// Job banks and questions in the database, and their contract views.
import type { Sql, Tx } from "./client.ts";
import { jsonb } from "./client.ts";
import type {
  BankQuestionView,
  CreateJobBankRequest,
  JobBankStatus,
  JobBankView,
  JobContext,
  QuestionContent,
  QuestionKind,
  QuestionStatus,
} from "../contract/index.ts";
import { canonicalHash } from "../lib/canonical.ts";
import { regenerationsLeft, type Ceilings } from "../orchestrator/budget.ts";

export type JobBankRow = {
  id: string;
  external_ref: string;
  tenant_ref: string;
  version: number;
  status: JobBankStatus;
  job: JobContext;
  bank_hash: string | null;
  locked_at: Date | null;
  attempts: number;
  lease_until: Date | null;
  failure: string | null;
  model_calls: number;
  regenerations: number;
  input_tokens: number;
  output_tokens: number;
  created_at: Date;
  updated_at: Date;
};

export type QuestionRow = {
  id: string;
  job_bank_id: string | null;
  interview_id: string | null;
  position: number;
  kind: QuestionKind;
  status: QuestionStatus;
  original: QuestionContent;
  edited: QuestionContent | null;
  replaces: string | null;
  created_at: Date;
  updated_at: Date;
};

export type QuestionParent = { jobBankId: string } | { interviewId: string };

// What the interviewer will actually use: staff's version when there is one.
export function effectiveContent(row: Pick<QuestionRow, "original" | "edited">): QuestionContent {
  return row.edited ?? row.original;
}

export function toQuestionView(row: QuestionRow): BankQuestionView {
  return {
    id: row.id,
    position: row.position,
    status: row.status,
    original: row.original,
    edited: row.edited,
    replaces: row.replaces,
    updated_at: row.updated_at.toISOString(),
  };
}

export function toJobBankView(
  row: JobBankRow,
  questions: readonly QuestionRow[],
  ceilings: Ceilings
): JobBankView {
  return {
    id: row.id,
    external_ref: row.external_ref,
    version: row.version,
    status: row.status,
    bank_hash: row.bank_hash,
    locked_at: row.locked_at?.toISOString() ?? null,
    failure: row.failure,
    questions: questions.map(toQuestionView),
    regenerations_left: regenerationsLeft(
      { regenerations: row.regenerations, modelCalls: row.model_calls },
      ceilings.bank
    ),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function findJobBank(
  sql: Sql | Tx,
  id: string,
  options: { forUpdate?: boolean } = {}
): Promise<JobBankRow | null> {
  const [row] = options.forUpdate
    ? await sql<JobBankRow[]>`select * from job_banks where id = ${id} for update`
    : await sql<JobBankRow[]>`select * from job_banks where id = ${id}`;
  return row ?? null;
}

// Position order; a replacement shares its predecessor's position and sorts
// after it.
export async function listQuestions(
  sql: Sql | Tx,
  parent: QuestionParent
): Promise<QuestionRow[]> {
  return "jobBankId" in parent
    ? sql<QuestionRow[]>`
        select * from bank_questions where job_bank_id = ${parent.jobBankId}
        order by position, created_at, id`
    : sql<QuestionRow[]>`
        select * from bank_questions where interview_id = ${parent.interviewId}
        order by position, created_at, id`;
}

export async function findQuestion(
  tx: Tx,
  parent: QuestionParent,
  questionId: string
): Promise<QuestionRow | null> {
  const [row] =
    "jobBankId" in parent
      ? await tx<QuestionRow[]>`
          select * from bank_questions
          where id = ${questionId} and job_bank_id = ${parent.jobBankId}
          for update`
      : await tx<QuestionRow[]>`
          select * from bank_questions
          where id = ${questionId} and interview_id = ${parent.interviewId}
          for update`;
  return row ?? null;
}

export async function insertQuestions(
  tx: Tx,
  parent: QuestionParent,
  questions: readonly QuestionContent[],
  options: { startPosition?: number; replaces?: string | null } = {}
): Promise<QuestionRow[]> {
  const start = options.startPosition ?? 0;
  const inserted: QuestionRow[] = [];
  for (const [index, content] of questions.entries()) {
    const [row] = await tx<QuestionRow[]>`
      insert into bank_questions (job_bank_id, interview_id, position, kind, original, replaces)
      values (
        ${"jobBankId" in parent ? parent.jobBankId : null},
        ${"interviewId" in parent ? parent.interviewId : null},
        ${start + index},
        ${content.kind},
        ${tx.json(jsonb(content))},
        ${options.replaces ?? null}
      )
      returning *`;
    inserted.push(row!);
  }
  return inserted;
}

// Takes the per-external_ref lock and reports what the next version would
// be. The advisory lock serialises creates for one external_ref, so the
// check and the insert that follows cannot interleave; the unique
// (external_ref, version) constraint backs it up.
export async function nextBankVersion(
  tx: Tx,
  externalRef: string
): Promise<{ inProgress: boolean; version: number }> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${"job_bank:" + externalRef}, 0))`;
  const [newest] = await tx<{ version: number; status: JobBankStatus }[]>`
    select version, status from job_banks
    where external_ref = ${externalRef}
    order by version desc
    limit 1`;
  return {
    inProgress: newest?.status === "generating" || newest?.status === "awaiting_review",
    version: (newest?.version ?? 0) + 1,
  };
}

export async function insertJobBank(
  tx: Tx,
  request: CreateJobBankRequest,
  version: number
): Promise<JobBankRow> {
  const [row] = await tx<JobBankRow[]>`
    insert into job_banks (external_ref, tenant_ref, version, job)
    values (
      ${request.external_ref},
      ${request.tenant.ref},
      ${version},
      ${tx.json(jsonb(request.job))}
    )
    returning *`;
  return row!;
}

// bank_hash: sha256 of the canonical JSON of the approved questions in
// position order — id, position, kind and the content the interviewer uses.
export function computeBankHash(questions: readonly QuestionRow[]): string {
  return canonicalHash(
    questions
      .filter((q) => q.status === "approved")
      .map((q) => ({
        id: q.id,
        position: q.position,
        kind: q.kind,
        content: effectiveContent(q),
      }))
  );
}

export type ApprovedCounts = { warmup: number; technical: number; behavioral: number };

// What a locked bank can supply to an interview's mix: behavioral and
// situational questions both fill the mix's behavioral share.
export async function approvedCounts(sql: Sql | Tx, jobBankId: string): Promise<ApprovedCounts> {
  const rows = await sql<{ kind: QuestionKind; n: number }[]>`
    select kind, count(*)::int as n from bank_questions
    where job_bank_id = ${jobBankId} and status = 'approved'
    group by kind`;
  const count = (kind: QuestionKind) => rows.find((r) => r.kind === kind)?.n ?? 0;
  return {
    warmup: count("warmup"),
    technical: count("technical"),
    behavioral: count("behavioral") + count("situational"),
  };
}
