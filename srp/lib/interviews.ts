// SERVER ONLY. This project has no `server-only` package, so the rule is
// stated here instead: never import this module from a client component
// (type-only imports are fine — they are erased). It reads the staff
// member's session cookie and calls the interview-gateway Edge Function with
// their own JWT; the gateway, not this file, holds the agent's signing secret
// (D3, D30), and it authorises every action against the organization of the
// row it touches.
//
// The gateway's answers are re-validated here before anything renders
// (§10.5): the gateway already checked the agent's answer against the shared
// contract, but nothing is displayed that no longer parses. The schemas
// mirror interview-agent/src/contract/index.ts; that file is the source of
// truth and is not imported (it is a Deno module with its own zod import).
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { ar } from "@/lib/i18n/ar";
import type { InterviewStatus, JobBankStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// Contract mirror (only what the admin UI needs)
// ---------------------------------------------------------------------------

export const QUESTION_KINDS = [
  "warmup",
  "technical",
  "behavioral",
  "situational",
  "gap_probe",
  "coding",
] as const;
export const QuestionKind = z.enum(QUESTION_KINDS);
export type QuestionKind = z.infer<typeof QuestionKind>;

export const QuestionStatus = z.enum(["pending", "approved", "removed"]);
export type QuestionStatus = z.infer<typeof QuestionStatus>;

const RubricCriterion = z
  .object({
    name: z.string().trim().min(1).max(120),
    weight: z.number().int().min(1).max(5),
    excellent: z.string().trim().min(1).max(400),
    acceptable: z.string().trim().min(1).max(400),
    weak: z.string().trim().min(1).max(400),
  })
  .strict();
export type RubricCriterion = z.infer<typeof RubricCriterion>;

// The same limits as the contract, so an edit that passes here is one the
// agent accepts on shape (it still applies its own content filters).
export const QuestionContent = z
  .object({
    kind: QuestionKind,
    text_ar: z.string().trim().min(8).max(600),
    competency: z.string().trim().min(1).max(120),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    expected_points: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
    rubric: z.object({ criteria: z.array(RubricCriterion).max(5) }).strict(),
    time_limit_sec: z.number().int().min(30).max(1200).nullable(),
    follow_up_policy: z.enum(["none", "on_vague", "probe_claim"]),
  })
  .strict()
  .refine((q) => q.kind === "warmup" || q.rubric.criteria.length > 0, {
    message: "a scored question needs at least one rubric criterion",
    path: ["rubric", "criteria"],
  });
export type QuestionContent = z.infer<typeof QuestionContent>;

// Platform row ids are matched loosely (seed data uses hand-written ids that
// are not RFC 4122); ids minted by the agent are real UUIDs.
const Id = z.guid();
const Timestamp = z.string().min(1);
const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const BankQuestionView = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  status: QuestionStatus,
  original: QuestionContent,
  edited: QuestionContent.nullable(),
  replaces: z.uuid().nullable(),
  updated_at: Timestamp,
});
export type BankQuestionView = z.infer<typeof BankQuestionView>;

export const BankEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("approve"), question_id: z.uuid() }).strict(),
  z.object({ op: z.literal("remove"), question_id: z.uuid() }).strict(),
  z.object({ op: z.literal("restore"), question_id: z.uuid() }).strict(),
  z
    .object({ op: z.literal("edit"), question_id: z.uuid(), content: QuestionContent })
    .strict(),
  z.object({ op: z.literal("regenerate"), question_id: z.uuid() }).strict(),
]);
export type BankEdit = z.infer<typeof BankEdit>;

const JOB_BANK_STATUSES = [
  "generating",
  "awaiting_review",
  "locked",
  "failed",
  "superseded",
] as const satisfies readonly JobBankStatus[];

const INTERVIEW_STATUSES = [
  "draft",
  "planning",
  "awaiting_review",
  "scheduled",
  "open",
  "in_progress",
  "submitted",
  "evaluating",
  "evaluated",
  "expired",
  "cancelled",
  "failed",
] as const satisfies readonly InterviewStatus[];
const InterviewStatusSchema = z.enum(INTERVIEW_STATUSES);

// ---------------------------------------------------------------------------
// Gateway responses (interview-gateway, spec §6.4)
// ---------------------------------------------------------------------------

/** A job's core bank as the gateway returns it; `id` is the PLATFORM row id. */
export const GatewayBank = z.object({
  id: Id,
  job_id: Id,
  version: z.number().int().min(1),
  status: z.enum(JOB_BANK_STATUSES),
  bank_hash: Sha256Hex.nullable(),
  locked_at: Timestamp.nullable(),
  failure: z.string().max(100).nullable(),
  questions: z.array(BankQuestionView),
  regenerations_left: z.number().int().min(0),
});
export type GatewayBank = z.infer<typeof GatewayBank>;

/** One interview's candidate-specific questions and, once locked, its plan. */
export const GatewayInterview = z.object({
  assignment_id: Id,
  status: InterviewStatusSchema,
  gap_probes: z.array(BankQuestionView),
  plan: z.array(z.object({ question_id: z.uuid(), kind: QuestionKind })).nullable(),
  plan_hash: Sha256Hex.nullable(),
  locked_at: Timestamp.nullable(),
  regenerations_left: z.number().int().min(0),
});
export type GatewayInterview = z.infer<typeof GatewayInterview>;

export const BankReply = z.object({ ok: z.literal(true), bank: GatewayBank });
export const InterviewReply = z.object({
  ok: z.literal(true),
  interview: GatewayInterview,
});
export const CreateReply = z.object({
  ok: z.literal(true),
  assignment_id: Id,
  status: InterviewStatusSchema,
});
export const CancelReply = z.object({
  ok: z.literal(true),
  status: InterviewStatusSchema,
});

// ---------------------------------------------------------------------------
// What staff choose for an interview (the gateway adds language itself)
// ---------------------------------------------------------------------------

export const QUESTION_TOTAL_MIN = 4;
export const QUESTION_TOTAL_MAX = 15;

export const InterviewConfigInput = z
  .object({
    question_count: z.number().int().min(QUESTION_TOTAL_MIN).max(QUESTION_TOTAL_MAX),
    mix: z
      .object({
        technical: z.number().int().min(0).max(15),
        behavioral: z.number().int().min(0).max(15),
        gap_probe: z.number().int().min(0).max(15),
        // Coding arrives with the sandbox (I4, D32); voice with I5.
        coding: z.literal(0),
        warmup: z.number().int().min(0).max(1),
      })
      .strict(),
    modes: z.tuple([z.literal("text")]),
    duration_minutes: z.number().int().min(10).max(120),
    paste_policy: z.enum(["record", "block"]),
    candidate_result: z.enum(["none", "completion", "summary"]),
    accommodations: z
      .object({ extra_time_percent: z.number().int().min(0).max(100) })
      .strict(),
  })
  .strict()
  .refine(
    (c) =>
      c.mix.technical + c.mix.behavioral + c.mix.gap_probe + c.mix.coding + c.mix.warmup ===
      c.question_count,
    { message: "mix must add up to question_count", path: ["mix"] }
  );
export type InterviewConfigInput = z.infer<typeof InterviewConfigInput>;

// The stored copy of the configuration (interview_assignments.config), read
// back only for display; anything that no longer parses is simply not shown.
const StoredConfig = z.object({
  question_count: z.number().int(),
  duration_minutes: z.number().int(),
  mix: z.object({
    technical: z.number().int(),
    behavioral: z.number().int(),
    gap_probe: z.number().int(),
    coding: z.number().int(),
    warmup: z.number().int(),
  }),
});
export type StoredInterviewConfig = z.infer<typeof StoredConfig>;

export function readStoredConfig(value: unknown): StoredInterviewConfig | null {
  const parsed = StoredConfig.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// The gateway call
// ---------------------------------------------------------------------------

export type GatewayRequest =
  | { action: "bank_create"; job_id: string }
  | { action: "bank_get"; bank_id: string }
  | { action: "bank_edit"; bank_id: string; edit: BankEdit }
  | { action: "bank_lock"; bank_id: string }
  | { action: "bank_retry"; bank_id: string }
  | { action: "create"; application_id: string; config: InterviewConfigInput }
  | { action: "cancel"; assignment_id: string }
  | { action: "interview_bank_get"; assignment_id: string }
  | { action: "interview_bank_edit"; assignment_id: string; edit: BankEdit }
  | { action: "interview_bank_lock"; assignment_id: string };

export type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string };

// The gateway gives the agent 15 s per call and may make two in one action
// (a refused retry is followed by a read); a review edit may be "generate a
// replacement", for which it waits up to 55 s on the agent's model call.
// These only stop a hung request from holding the page or the action
// forever, and must outlast the gateway's own waits: giving up first would
// report a failure while the gateway is still storing the result.
const GATEWAY_TIMEOUT_MS = 40_000;
const GATEWAY_EDIT_TIMEOUT_MS = 65_000;
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;

export async function callGateway<T>(
  body: GatewayRequest,
  schema: z.ZodType<T>
): Promise<GatewayResult<T>> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, status: 401, code: "unauthorized" };

  let response: Response;
  try {
    const { url } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/interview-gateway`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(
        body.action === "bank_edit" || body.action === "interview_bank_edit"
          ? GATEWAY_EDIT_TIMEOUT_MS
          : GATEWAY_TIMEOUT_MS
      ),
    });
  } catch (err) {
    // The name only (TimeoutError, TypeError …): a message could echo a URL.
    console.error(
      `interview-gateway unreachable on ${body.action}:`,
      err instanceof Error ? err.name : "error"
    );
    return { ok: false, status: 502, code: "gateway_unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body: handled below like any unexpected answer.
  }

  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    const code =
      typeof error === "string" && ERROR_CODE.test(error)
        ? error
        : response.status === 401
          ? "unauthorized"
          : "unknown";
    // Codes only — the gateway never sends content in an error, and nothing
    // from a question or a CV is ever logged (D8).
    console.error(`interview-gateway ${body.action} answered ${response.status} ${code}`);
    return { ok: false, status: response.status, code };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.error(`interview-gateway ${body.action}: answer does not match the expected shape`);
    return { ok: false, status: 502, code: "agent_invalid_response" };
  }
  return { ok: true, data: parsed.data };
}

/** The Arabic wording for a gateway, agent or planner code (never the code). */
export function interviewErrorMessage(code: string | null | undefined): string {
  const errors: Readonly<Record<string, string>> = ar.interviewBank.errors;
  if (code && Object.hasOwn(errors, code)) return errors[code]!;
  return errors.unknown!;
}

export async function fetchJobBank(bankId: string): Promise<GatewayResult<GatewayBank>> {
  const result = await callGateway({ action: "bank_get", bank_id: bankId }, BankReply);
  return result.ok ? { ok: true, data: result.data.bank } : result;
}

export async function fetchInterviewBank(
  assignmentId: string
): Promise<GatewayResult<GatewayInterview>> {
  const result = await callGateway(
    { action: "interview_bank_get", assignment_id: assignmentId },
    InterviewReply
  );
  return result.ok ? { ok: true, data: result.data.interview } : result;
}

// ---------------------------------------------------------------------------
// The applicant page's virtual-interview data
// ---------------------------------------------------------------------------

export type AssignmentSummary = {
  id: string;
  status: InterviewStatus;
  external_interview_id: string | null;
  config: StoredInterviewConfig | null;
  last_error: string | null;
  bank_hash: string | null;
  bank_locked_at: string | null;
  created_at: string;
  /**
   * A draft the agent never acknowledged, old enough that no request can
   * still be waiting on it. The gateway fails such a row on the next create,
   * so the panel offers to start again instead of spinning forever.
   */
  stale: boolean;
};

// Matches the gateway's STALE_CREATION_MS: its agent call gives up after
// 15 s, so a draft this old was left behind by a request that died.
const STALE_DRAFT_MS = 2 * 60 * 1000;

export type VirtualInterviewData = {
  /** organizations.monthly_interview_quota: null = uncapped, 0 = none (D33). */
  quota: number | null;
  /** The job's current core bank: its newest locked version. */
  lockedBank: { id: string; version: number; approvedCount: number } | null;
  /** The application's most recent assignment, live or not. */
  assignment: AssignmentSummary | null;
};

// Three reads, each filtered by the caller's organization in code and by RLS
// in the database (the isolation invariant: two layers, always).
export async function loadVirtualInterview(params: {
  orgId: string;
  applicationId: string;
  jobId: string;
}): Promise<VirtualInterviewData> {
  const { orgId, applicationId, jobId } = params;
  const supabase = await createClient();
  const [orgRes, bankRes, assignmentRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("monthly_interview_quota")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("interview_job_banks")
      .select("id, version, approved_count")
      .eq("org_id", orgId)
      .eq("job_id", jobId)
      .eq("status", "locked")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("interview_assignments")
      .select(
        "id, status, external_interview_id, config, last_error, bank_hash, bank_locked_at, created_at"
      )
      .eq("org_id", orgId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (orgRes.error) console.error("interview quota read failed:", orgRes.error.code);
  if (bankRes.error) console.error("locked bank read failed:", bankRes.error.code);
  if (assignmentRes.error) console.error("assignment read failed:", assignmentRes.error.code);

  // A failed read of the quota reads as "not in plan": the panel then offers
  // nothing that would cost an interview, which is the safe side.
  const quota = orgRes.data ? orgRes.data.monthly_interview_quota : 0;
  const bank = bankRes.data;
  const row = assignmentRes.data;

  return {
    quota,
    lockedBank: bank
      ? { id: bank.id, version: bank.version, approvedCount: bank.approved_count }
      : null,
    assignment: row
      ? {
          id: row.id,
          status: row.status,
          external_interview_id: row.external_interview_id,
          config: readStoredConfig(row.config),
          last_error: row.last_error,
          bank_hash: row.bank_hash,
          bank_locked_at: row.bank_locked_at,
          created_at: row.created_at,
          stale:
            row.status === "draft" &&
            row.external_interview_id === null &&
            Date.parse(row.created_at) < Date.now() - STALE_DRAFT_MS,
        }
      : null,
  };
}
