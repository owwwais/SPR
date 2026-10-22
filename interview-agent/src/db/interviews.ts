import type { Sql, Tx } from "./client.ts";
import { jsonb } from "./client.ts";
import type {
  CandidateProfile,
  CreateInterviewRequest,
  InterviewConfig,
  InterviewStatus,
  InterviewView,
  JobContext,
  QuestionContent,
  QuestionKind,
} from "../contract/index.ts";
import { assertTransition } from "../orchestrator/state-machine.ts";

export type Actor = "platform" | "candidate" | "system";

// One question of a locked plan, in the order it will be asked.
export type PlanItem = { question_id: string; kind: QuestionKind; content: QuestionContent };

export type InterviewRow = {
  id: string;
  external_ref: string;
  candidate_ref: string;
  status: InterviewStatus;
  config: InterviewConfig;
  opens_at: Date | null;
  closes_at: Date | null;
  started_at: Date | null;
  session_epoch: number;
  tenant_ref: string | null;
  job_bank_id: string | null;
  bank_locked_at: Date | null;
  plan: PlanItem[] | null;
  plan_hash: string | null;
  failure: string | null;
  attempts: number;
  model_calls: number;
  gap_regenerations: number;
  created_at: Date;
  updated_at: Date;
};

// The planner also needs what the questions are written against.
export type PlanningInterviewRow = InterviewRow & {
  job: JobContext;
  candidate_profile: CandidateProfile;
};

const COLUMNS = [
  "id",
  "external_ref",
  "candidate_ref",
  "status",
  "config",
  "opens_at",
  "closes_at",
  "started_at",
  "session_epoch",
  "tenant_ref",
  "job_bank_id",
  "bank_locked_at",
  "plan",
  "plan_hash",
  "failure",
  "attempts",
  "model_calls",
  "gap_regenerations",
  "created_at",
  "updated_at",
] as const;

export function toView(row: InterviewRow): InterviewView {
  return {
    id: row.id,
    external_ref: row.external_ref,
    status: row.status,
    config: row.config,
    job_bank_id: row.job_bank_id,
    bank_locked_at: row.bank_locked_at?.toISOString() ?? null,
    plan_hash: row.plan_hash,
    failure: row.failure,
    opens_at: row.opens_at?.toISOString() ?? null,
    closes_at: row.closes_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// Inserts a draft interview against a locked bank. The job snapshot comes
// from the bank, so the gap probes are written against the same job text
// staff reviewed (the request no longer carries a job).
export async function insertInterview(
  tx: Tx,
  request: CreateInterviewRequest,
  bank: { id: string; job: JobContext },
  quotaPeriod: string | null
): Promise<InterviewRow> {
  const [row] = await tx<InterviewRow[]>`
    insert into interviews (
      external_ref, candidate_ref, job, candidate_profile, config,
      tenant_ref, job_bank_id, quota_period
    )
    values (
      ${request.external_ref},
      ${request.candidate_ref},
      ${tx.json(jsonb(bank.job))},
      ${tx.json(jsonb(request.candidate_profile))},
      ${tx.json(jsonb(request.config))},
      ${request.tenant.ref},
      ${bank.id},
      ${quotaPeriod}::date
    )
    returning ${tx(COLUMNS)}`;
  await tx`
    insert into audit_log (interview_id, actor, action, to_status)
    values (${row!.id}, 'platform', 'created', ${row!.status})`;
  return row!;
}

export async function findInterview(
  sql: Sql | Tx,
  id: string,
  options: { forUpdate?: boolean } = {}
): Promise<InterviewRow | null> {
  const [row] = options.forUpdate
    ? await sql<InterviewRow[]>`select ${sql(COLUMNS)} from interviews where id = ${id} for update`
    : await sql<InterviewRow[]>`select ${sql(COLUMNS)} from interviews where id = ${id}`;
  return row ?? null;
}

export async function findPlanningInterview(
  sql: Sql | Tx,
  id: string
): Promise<PlanningInterviewRow | null> {
  const [row] = await sql<PlanningInterviewRow[]>`
    select ${sql(COLUMNS)}, job, candidate_profile from interviews where id = ${id}`;
  return row ?? null;
}

// Moves an interview from `from` to `to`, or returns null if somebody else
// moved it first. The WHERE on the current status is what makes concurrent
// workers safe; assertTransition() is what makes the move legal.
export async function transition(
  tx: Tx,
  id: string,
  from: InterviewStatus,
  to: InterviewStatus,
  actor: Actor,
  action: string
): Promise<InterviewRow | null> {
  assertTransition(from, to);
  const [row] = await tx<InterviewRow[]>`
    update interviews
    set status = ${to}, updated_at = now()
    where id = ${id} and status = ${from}
    returning ${tx(COLUMNS)}`;
  if (!row) return null;
  await tx`
    insert into audit_log (interview_id, actor, action, from_status, to_status)
    values (${id}, ${actor}, ${action}, ${from}, ${to})`;
  return row;
}

// Erasure on request: one delete, every child row cascades with it — gap
// probes and model-call traces included.
export async function deleteInterview(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql`delete from interviews where id = ${id} returning id`;
  return rows.length > 0;
}

// Starts a new device session: the returned epoch is the only one accepted
// from now on.
export async function bumpSessionEpoch(tx: Tx, id: string): Promise<number> {
  const [row] = await tx<{ session_epoch: number }[]>`
    update interviews
    set session_epoch = session_epoch + 1, updated_at = now()
    where id = ${id}
    returning session_epoch`;
  await tx`
    insert into audit_log (interview_id, actor, action)
    values (${id}, 'platform', 'session_token_issued')`;
  return row!.session_epoch;
}
