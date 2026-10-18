// The planner worker (design §2 "Planner"). Lease-based polling on the rows
// themselves — job banks in `generating`, interviews in `planning` — so no
// queue dependency is needed: a row is claimed with FOR UPDATE SKIP LOCKED
// and a two-minute lease, the model call happens outside any transaction,
// and a crashed worker's lease simply expires for the next one.
//
// Each row gets at most MAX_ATTEMPTS generations. A terminal failure records
// a code (never model output); for an interview it also reports
// interview.failed and gives the allowance unit back, since no interview
// happened (D33).
import type { Sql, Tx } from "../db/client.ts";
import type { LlmClient } from "../llm/types.ts";
import { LlmCallError } from "../llm/run.ts";
import {
  BudgetExceededError,
  DEFAULT_CEILINGS,
  releaseInterviewUnit,
  type Ceilings,
} from "../orchestrator/budget.ts";
import { insertQuestions, type JobBankRow } from "../db/banks.ts";
import {
  findPlanningInterview,
  transition,
  type PlanningInterviewRow,
} from "../db/interviews.ts";
import { enqueueEvent } from "../webhooks/outbox.ts";
import { GAP_EXTRA, GAP_MAX } from "../prompts/gap-probes.ts";
import {
  generateCoreBank,
  generateGapProbes,
  meetsBankMinimum,
  type GenerationDeps,
} from "./generate.ts";
import { log } from "../lib/log.ts";

export const MAX_ATTEMPTS = 2;
const LEASE_SECONDS = 120;
// Model-call traces are kept for 90 days (design §8.1).
export const LLM_CALL_RETENTION_DAYS = 90;

export type FailureCode =
  | "insufficient_questions"
  | "invalid_output"
  | "model_error"
  | "budget_exceeded";

export type PlannerDeps = {
  sql: Sql;
  llm: LlmClient | null;
  ceilings?: Ceilings;
  signal?: AbortSignal;
};

type Outcome = { ok: true } | { ok: false; code: FailureCode; terminal: boolean } | { aborted: true };

function classify(err: unknown, signal: AbortSignal | undefined): Outcome {
  if (signal?.aborted) return { aborted: true };
  if (err instanceof BudgetExceededError) {
    return { ok: false, code: "budget_exceeded", terminal: true };
  }
  if (err instanceof LlmCallError) {
    return {
      ok: false,
      code: err.outcome === "invalid_output" ? "invalid_output" : "model_error",
      terminal: false,
    };
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Job banks
// ---------------------------------------------------------------------------

async function claimJobBank(sql: Sql): Promise<JobBankRow | null> {
  const [row] = await sql<JobBankRow[]>`
    update job_banks
    set lease_until = now() + make_interval(secs => ${LEASE_SECONDS}),
        attempts = attempts + 1,
        updated_at = now()
    where id = (
      select id from job_banks
      where status = 'generating'
        and attempts < ${MAX_ATTEMPTS}
        and (lease_until is null or lease_until < now())
      order by created_at
      limit 1
      for update skip locked
    )
    returning *`;
  return row ?? null;
}

async function failJobBank(sql: Sql | Tx, id: string, code: FailureCode): Promise<void> {
  await sql`
    update job_banks
    set status = 'failed', failure = ${code}, lease_until = null, updated_at = now()
    where id = ${id} and status = 'generating'`;
}

async function planJobBank(deps: GenerationDeps, bank: JobBankRow) {
  let outcome: Outcome;
  try {
    const { accepted, stats } = await generateCoreBank(deps, bank);
    log.info("bank generated", {
      job_bank_id: bank.id,
      attempt: bank.attempts,
      received: stats.received,
      invalid: stats.invalid,
      wrong_kind: stats.wrong_kind,
      protected_category: stats.protected_category,
      generic: stats.generic,
      duplicate: stats.duplicate,
      kept: accepted.length,
    });
    if (meetsBankMinimum(accepted)) {
      await deps.sql.begin(async (tx) => {
        const moved = await tx`
          update job_banks
          set status = 'awaiting_review', lease_until = null, failure = null, updated_at = now()
          where id = ${bank.id} and status = 'generating'
          returning id`;
        if (moved.length === 0) return;
        await insertQuestions(tx, { jobBankId: bank.id }, accepted);
      });
      return;
    }
    outcome = { ok: false, code: "insufficient_questions", terminal: false };
  } catch (err) {
    outcome = classify(err, deps.signal);
  }

  if ("aborted" in outcome) {
    // Shutting down: not the model's fault, so the attempt is given back.
    await deps.sql`
      update job_banks
      set lease_until = null, attempts = greatest(0, attempts - 1)
      where id = ${bank.id} and status = 'generating'`;
    return;
  }
  if (outcome.ok) return;
  if (outcome.terminal || bank.attempts >= MAX_ATTEMPTS) {
    await failJobBank(deps.sql, bank.id, outcome.code);
    log.warn("bank generation failed", { job_bank_id: bank.id, reason: outcome.code });
  } else {
    await deps.sql`
      update job_banks
      set lease_until = null, failure = ${outcome.code}, updated_at = now()
      where id = ${bank.id} and status = 'generating'`;
  }
}

// ---------------------------------------------------------------------------
// Interviews (gap probes)
// ---------------------------------------------------------------------------

async function claimInterview(sql: Sql): Promise<PlanningInterviewRow | null> {
  const [claimed] = await sql<{ id: string }[]>`
    update interviews
    set lease_until = now() + make_interval(secs => ${LEASE_SECONDS}),
        attempts = attempts + 1
    where id = (
      select id from interviews
      where status = 'planning'
        and attempts < ${MAX_ATTEMPTS}
        and (lease_until is null or lease_until < now())
      order by created_at
      limit 1
      for update skip locked
    )
    returning id`;
  return claimed ? findPlanningInterview(sql, claimed.id) : null;
}

// Terminal: failed, reported, and the allowance unit returned.
async function failInterview(sql: Sql, id: string, code: FailureCode): Promise<void> {
  await sql.begin(async (tx) => {
    const moved = await transition(tx, id, "planning", "failed", "system", "planning_failed");
    if (!moved) return;
    await tx`
      update interviews set failure = ${code}, lease_until = null
      where id = ${id}`;
    await enqueueEvent(tx, {
      type: "interview.failed",
      interviewId: id,
      externalRef: moved.external_ref,
      status: "failed",
      data: { reason: code },
    });
    await releaseInterviewUnit(tx, id);
  });
}

async function planInterview(deps: GenerationDeps, interview: PlanningInterviewRow) {
  const wanted = interview.config.mix.gap_probe;
  const requested = Math.min(wanted + GAP_EXTRA, GAP_MAX);
  let outcome: Outcome;
  try {
    const { accepted, stats } = await generateGapProbes(deps, interview, requested);
    log.info("gap probes generated", {
      interview_id: interview.id,
      attempt: interview.attempts,
      received: stats.received,
      invalid: stats.invalid,
      wrong_kind: stats.wrong_kind,
      protected_category: stats.protected_category,
      generic: stats.generic,
      duplicate: stats.duplicate,
      kept: accepted.length,
    });
    if (accepted.length >= wanted) {
      await deps.sql.begin(async (tx) => {
        const moved = await transition(tx, interview.id, "planning", "awaiting_review", "system", "planned");
        // Cancelled (or erased) while the model was writing: drop the result.
        if (!moved) return;
        await tx`
          update interviews set failure = null, lease_until = null
          where id = ${interview.id}`;
        await insertQuestions(tx, { interviewId: interview.id }, accepted);
        await enqueueEvent(tx, {
          type: "interview.planned",
          interviewId: interview.id,
          externalRef: moved.external_ref,
          status: "awaiting_review",
          data: { gap_probes: accepted.length },
        });
      });
      return;
    }
    outcome = { ok: false, code: "insufficient_questions", terminal: false };
  } catch (err) {
    outcome = classify(err, deps.signal);
  }

  if ("aborted" in outcome) {
    await deps.sql`
      update interviews
      set lease_until = null, attempts = greatest(0, attempts - 1)
      where id = ${interview.id} and status = 'planning'`;
    return;
  }
  if (outcome.ok) return;
  if (outcome.terminal || interview.attempts >= MAX_ATTEMPTS) {
    await failInterview(deps.sql, interview.id, outcome.code);
    log.warn("interview planning failed", { interview_id: interview.id, reason: outcome.code });
  } else {
    await deps.sql`
      update interviews set lease_until = null, failure = ${outcome.code}
      where id = ${interview.id} and status = 'planning'`;
  }
}

// ---------------------------------------------------------------------------
// Abandoned work and the loop
// ---------------------------------------------------------------------------

// A row whose last allowed attempt was claimed by a worker that never came
// back (crash, kill): its lease has run out and it can no longer be claimed,
// so it is failed here rather than left generating forever.
async function failAbandoned(sql: Sql): Promise<void> {
  const banks = await sql<{ id: string }[]>`
    select id from job_banks
    where status = 'generating' and attempts >= ${MAX_ATTEMPTS} and lease_until < now()`;
  for (const { id } of banks) await failJobBank(sql, id, "model_error");

  const interviews = await sql<{ id: string }[]>`
    select id from interviews
    where status = 'planning' and attempts >= ${MAX_ATTEMPTS} and lease_until < now()`;
  for (const { id } of interviews) await failInterview(sql, id, "model_error");
}

// Processes everything that is ready now; returns how many generation
// attempts it made. The planner is idle (returns 0) when no model is
// configured — nothing can be waiting then, since the API refuses to start
// generation without one.
export async function runPlannerOnce(deps: PlannerDeps): Promise<number> {
  if (!deps.llm) return 0;
  const full: GenerationDeps = {
    sql: deps.sql,
    llm: deps.llm,
    ceilings: deps.ceilings ?? DEFAULT_CEILINGS,
    signal: deps.signal,
  };
  await failAbandoned(deps.sql);
  let processed = 0;
  while (!deps.signal?.aborted) {
    const bank = await claimJobBank(deps.sql);
    if (bank) {
      await planJobBank(full, bank);
      processed++;
      continue;
    }
    const interview = await claimInterview(deps.sql);
    if (interview) {
      await planInterview(full, interview);
      processed++;
      continue;
    }
    break;
  }
  return processed;
}

export async function purgeOldLlmCalls(sql: Sql): Promise<number> {
  const rows = await sql`
    delete from llm_calls
    where created_at < now() - make_interval(days => ${LLM_CALL_RETENTION_DAYS})
    returning id`;
  return rows.length;
}

export type PlannerWorkerOptions = {
  sql: Sql;
  llm: LlmClient | null;
  pollMs: number;
  ceilings?: Ceilings;
  now?: () => number;
};

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export function createPlannerWorker(options: PlannerWorkerOptions) {
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let controller = new AbortController();
  let running: Promise<void> | null = null;
  let lastPurge = 0;

  async function tick(): Promise<void> {
    if (now() - lastPurge >= PURGE_INTERVAL_MS) {
      lastPurge = now();
      const purged = await purgeOldLlmCalls(options.sql);
      if (purged > 0) log.info("llm_calls purged", { count: purged });
    }
    await runPlannerOnce({
      sql: options.sql,
      llm: options.llm,
      ceilings: options.ceilings,
      signal: controller.signal,
    });
  }

  function schedule() {
    if (!stopped) timer = setTimeout(loop, options.pollMs);
  }

  function loop() {
    running = tick()
      .catch((err: unknown) => {
        log.error("planner tick failed", {
          error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        });
      })
      .finally(() => {
        running = null;
        schedule();
      });
  }

  return {
    tick,
    start() {
      if (!stopped) return;
      stopped = false;
      controller = new AbortController();
      loop();
    },
    // Aborts an in-flight model call (its attempt is given back) and waits
    // for the current pass to finish, so the database is not closed under it.
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller.abort();
      await running;
    },
  };
}
