// The harness budget (design §4.1, CLAUDE.md §8 cost guard) and the
// interview allowance (D33). Everything that costs a model call passes
// through here first, and every check is a single atomic statement: under
// concurrency, two callers can never both take the last unit of anything.
import type { Sql, Tx } from "../db/client.ts";

// Per interview, for its whole life (I1 planning through I3 evaluation).
// I1 itself uses only a few calls; the ceiling is the interview's, not the
// milestone's.
export const MAX_MODEL_CALLS = 30;
export const MAX_INPUT_TOKENS = 300_000;
export const MAX_OUTPUT_TOKENS = 60_000;
export const MAX_GAP_REGENERATIONS = 5;

// Per job-bank version: two generation attempts per start, retries, and
// staff's "generate a replacement" requests all count here. The token
// ceilings sit above what twenty full-size calls can use, so the call count
// is the binding limit and the tokens are a backstop.
export const MAX_BANK_MODEL_CALLS = 20;
export const MAX_BANK_REGENERATIONS = 15;
export const MAX_BANK_INPUT_TOKENS = 1_200_000;
export const MAX_BANK_OUTPUT_TOKENS = 700_000;

// Bank generation starts (create + retry) per tenant per UTC day.
export const DAILY_GENERATION_LIMIT = 10;

export type OwnerCeilings = {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  regenerations: number;
};

export type Ceilings = {
  interview: OwnerCeilings;
  bank: OwnerCeilings;
  dailyGenerations: number;
};

// Injectable so tests can prove a ceiling holds without spending thirty
// calls to reach it.
export const DEFAULT_CEILINGS: Ceilings = {
  interview: {
    modelCalls: MAX_MODEL_CALLS,
    inputTokens: MAX_INPUT_TOKENS,
    outputTokens: MAX_OUTPUT_TOKENS,
    regenerations: MAX_GAP_REGENERATIONS,
  },
  bank: {
    modelCalls: MAX_BANK_MODEL_CALLS,
    inputTokens: MAX_BANK_INPUT_TOKENS,
    outputTokens: MAX_BANK_OUTPUT_TOKENS,
    regenerations: MAX_BANK_REGENERATIONS,
  },
  dailyGenerations: DAILY_GENERATION_LIMIT,
};

export type BudgetOwner = { kind: "job_bank" | "interview"; id: string };

export class BudgetExceededError extends Error {
  constructor(owner: BudgetOwner) {
    super(`${owner.kind} budget exhausted`);
    this.name = "BudgetExceededError";
  }
}

function ceilingsFor(owner: BudgetOwner, ceilings: Ceilings): OwnerCeilings {
  return owner.kind === "job_bank" ? ceilings.bank : ceilings.interview;
}

export type Reservation = { inputTokens: number; outputTokens: number };

// Takes one model call and the call's worst case in tokens, or refuses.
// Reserving the worst case (an upper bound of the input, and the output cap
// the model is held to) rather than checking only what was spent so far is
// what makes "never exceeds the ceiling" true even for the call that would
// cross it, and for two calls racing. settleCall() swaps the reservation for
// the real numbers afterwards.
export async function reserveCall(
  sql: Sql | Tx,
  owner: BudgetOwner,
  ceilings: Ceilings,
  reservation: Reservation
): Promise<void> {
  const max = ceilingsFor(owner, ceilings);
  const rows =
    owner.kind === "job_bank"
      ? await sql`
          update job_banks
          set model_calls = model_calls + 1,
              input_tokens = input_tokens + ${reservation.inputTokens},
              output_tokens = output_tokens + ${reservation.outputTokens}
          where id = ${owner.id}
            and model_calls < ${max.modelCalls}
            and input_tokens + ${reservation.inputTokens} <= ${max.inputTokens}
            and output_tokens + ${reservation.outputTokens} <= ${max.outputTokens}
          returning id`
      : await sql`
          update interviews
          set model_calls = model_calls + 1,
              input_tokens = input_tokens + ${reservation.inputTokens},
              output_tokens = output_tokens + ${reservation.outputTokens}
          where id = ${owner.id}
            and model_calls < ${max.modelCalls}
            and input_tokens + ${reservation.inputTokens} <= ${max.inputTokens}
            and output_tokens + ${reservation.outputTokens} <= ${max.outputTokens}
          returning id`;
  if (rows.length === 0) throw new BudgetExceededError(owner);
}

// Replaces a call's reservation with what it actually used. The call itself
// stays counted whatever happened to it.
export async function settleCall(
  sql: Sql | Tx,
  owner: BudgetOwner,
  reservation: Reservation,
  actual: Reservation
): Promise<void> {
  const inDelta = actual.inputTokens - reservation.inputTokens;
  const outDelta = actual.outputTokens - reservation.outputTokens;
  if (owner.kind === "job_bank") {
    await sql`
      update job_banks
      set input_tokens = greatest(0, input_tokens + ${inDelta}),
          output_tokens = greatest(0, output_tokens + ${outDelta})
      where id = ${owner.id}`;
  } else {
    await sql`
      update interviews
      set input_tokens = greatest(0, input_tokens + ${inDelta}),
          output_tokens = greatest(0, output_tokens + ${outDelta})
      where id = ${owner.id}`;
  }
}

// Staff's "generate a replacement": one unit of the owner's regeneration
// allowance, taken before the call. Returns false when none is left.
export async function claimRegeneration(
  sql: Sql | Tx,
  owner: BudgetOwner,
  ceilings: Ceilings
): Promise<boolean> {
  const max = ceilingsFor(owner, ceilings);
  const rows =
    owner.kind === "job_bank"
      ? await sql`
          update job_banks set regenerations = regenerations + 1
          where id = ${owner.id}
            and regenerations < ${max.regenerations}
            and model_calls < ${max.modelCalls}
          returning id`
      : await sql`
          update interviews set gap_regenerations = gap_regenerations + 1
          where id = ${owner.id}
            and gap_regenerations < ${max.regenerations}
            and model_calls < ${max.modelCalls}
          returning id`;
  return rows.length > 0;
}

// Gives a regeneration back when it never reached the model (the call
// budget refused it first).
export async function refundRegeneration(sql: Sql | Tx, owner: BudgetOwner): Promise<void> {
  if (owner.kind === "job_bank") {
    await sql`
      update job_banks set regenerations = greatest(0, regenerations - 1)
      where id = ${owner.id}`;
  } else {
    await sql`
      update interviews set gap_regenerations = greatest(0, gap_regenerations - 1)
      where id = ${owner.id}`;
  }
}

// What the review screen shows: the smaller of the regenerations left and
// the model calls left, since a regeneration needs both.
export function regenerationsLeft(
  used: { regenerations: number; modelCalls: number },
  max: OwnerCeilings
): number {
  return Math.max(
    0,
    Math.min(max.regenerations - used.regenerations, max.modelCalls - used.modelCalls)
  );
}

// ---------------------------------------------------------------------------
// The interview allowance (D33)
// ---------------------------------------------------------------------------

export type AllowanceClaim = { ok: true; period: string } | { ok: false };

// Claims one interview unit for the current UTC month. Must run inside the
// transaction that creates the interview, so a refused claim leaves nothing
// behind and a failed insert gives the unit back by rolling back. The WHERE
// on DO UPDATE runs against the locked, newest row, so with one unit left
// exactly one of two concurrent claims succeeds. `null` means uncapped:
// still counted, never refused. Allowance 0 is refused by the caller before
// any of this (interviews_not_in_plan).
export async function claimInterviewUnit(
  tx: Tx,
  tenantRef: string,
  allowance: number | null
): Promise<AllowanceClaim> {
  const rows = await tx<{ period: string }[]>`
    insert into tenant_usage (tenant_ref, period_start, used)
    values (
      ${tenantRef},
      date_trunc('month', now() at time zone 'utc')::date,
      1
    )
    on conflict (tenant_ref, period_start) do update
      set used = tenant_usage.used + 1, updated_at = now()
      where ${allowance}::int is null or tenant_usage.used < ${allowance}::int
    returning to_char(period_start, 'YYYY-MM-DD') as period`;
  const row = rows[0];
  return row ? { ok: true, period: row.period } : { ok: false };
}

// Gives an interview's unit back when no interview happened (planning failed
// terminally). Clearing quota_period in the same locked transaction makes it
// impossible to release the same unit twice.
export async function releaseInterviewUnit(tx: Tx, interviewId: string): Promise<boolean> {
  const [row] = await tx<{ tenant_ref: string | null; period: string | null }[]>`
    select tenant_ref, to_char(quota_period, 'YYYY-MM-DD') as period
    from interviews where id = ${interviewId}
    for update`;
  if (!row || !row.tenant_ref || !row.period) return false;
  await tx`update interviews set quota_period = null where id = ${interviewId}`;
  await tx`
    update tenant_usage
    set used = greatest(0, used - 1), updated_at = now()
    where tenant_ref = ${row.tenant_ref} and period_start = ${row.period}::date`;
  return true;
}

// Records one bank generation start for the tenant, or refuses when the
// daily limit is reached. The advisory lock serialises concurrent starts for
// the same tenant, so the count and the insert cannot interleave.
export async function recordGenerationStart(
  tx: Tx,
  tenantRef: string,
  limit: number
): Promise<boolean> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${"generation:" + tenantRef}, 0))`;
  const [row] = await tx<{ n: number }[]>`
    select count(*)::int as n from tenant_generation_log
    where tenant_ref = ${tenantRef}
      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;
  if ((row?.n ?? 0) >= limit) return false;
  await tx`insert into tenant_generation_log (tenant_ref) values (${tenantRef})`;
  return true;
}
