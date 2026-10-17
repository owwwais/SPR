// The contract between the Hakeem platform and the interview agent
// (CLAUDE.md D30, docs/INTERVIEW-AGENT-DESIGN.md §3).
//
// THIS FILE EXISTS TWICE, BYTE FOR BYTE:
//   interview-agent/src/contract/index.ts              (source of truth)
//   srp/supabase/functions/_shared/interview-contract.ts (copy for Deno)
// Edit the first and run `npm run contract:sync` in interview-agent/; a test
// fails if the two ever differ. Keep it dependency-free apart from zod, which
// both runtimes resolve as a bare specifier.

import { z } from "zod";

export const CONTRACT_VERSION = "2026-10-17";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const INTERVIEW_STATUSES = [
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
] as const;
export const InterviewStatus = z.enum(INTERVIEW_STATUSES);
export type InterviewStatus = z.infer<typeof InterviewStatus>;

export const InterviewMode = z.enum(["text", "voice"]);
export type InterviewMode = z.infer<typeof InterviewMode>;

// What the candidate may see of their own result, chosen by the company.
// Authenticity signals are never part of any option (D31).
export const CandidateResultPolicy = z.enum(["none", "completion", "summary"]);

export const PastePolicy = z.enum(["record", "block"]);

export const JobType = z.enum([
  "full_time",
  "part_time",
  "contract",
  "remote",
  "internship",
]);

// ---------------------------------------------------------------------------
// Creating an interview
// ---------------------------------------------------------------------------

// Opaque identifiers only: an application id or a hashed candidate reference,
// never anything that names a person.
export const OpaqueRef = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);

export const QuestionMix = z
  .object({
    technical: z.number().int().min(0).max(15),
    behavioral: z.number().int().min(0).max(15),
    gap_probe: z.number().int().min(0).max(15),
    coding: z.number().int().min(0).max(2),
    warmup: z.number().int().min(0).max(1),
  })
  .strict();

export const InterviewConfig = z
  .object({
    question_count: z.number().int().min(4).max(15),
    mix: QuestionMix,
    modes: z
      .array(InterviewMode)
      .min(1)
      .max(2)
      .refine((modes) => new Set(modes).size === modes.length, {
        message: "modes must be unique",
      }),
    duration_minutes: z.number().int().min(10).max(120),
    language: z.literal("ar"),
    paste_policy: PastePolicy,
    candidate_result: CandidateResultPolicy,
    accommodations: z
      .object({
        extra_time_percent: z.number().int().min(0).max(100),
      })
      .strict(),
  })
  .strict()
  .refine(
    (config) =>
      config.mix.technical +
        config.mix.behavioral +
        config.mix.gap_probe +
        config.mix.coding +
        config.mix.warmup ===
      config.question_count,
    { message: "mix must add up to question_count", path: ["mix"] }
  );
export type InterviewConfig = z.infer<typeof InterviewConfig>;

export const JobContext = z
  .object({
    title: z.string().min(1).max(200),
    type: JobType,
    location: z.string().max(200).nullable(),
    min_years_experience: z.number().int().min(0).max(60),
    skills: z.array(z.string().min(1).max(80)).max(50),
    requirements: z.string().min(1).max(20000),
    description: z.string().max(20000),
  })
  .strict();
export type JobContext = z.infer<typeof JobContext>;

// The platform's extracted CV (CLAUDE.md §6 ExtractedCV) MINUS full_name.
// Strict on purpose: if the platform ever forgets to strip the name, the
// agent rejects the request instead of quietly receiving an identity it has
// no use for (design §3.5).
export const CandidateProfile = z
  .object({
    total_years_experience: z.number().min(0).max(60),
    experiences: z
      .array(
        z
          .object({
            title: z.string().max(300),
            company: z.string().max(300).nullable(),
            start: z.string().max(20).nullable(),
            end: z.string().max(20).nullable(),
            summary: z.string().max(4000),
          })
          .strict()
      )
      .max(30),
    education: z
      .array(
        z
          .object({
            degree: z.string().max(300),
            field: z.string().max(300).nullable(),
            institution: z.string().max(300).nullable(),
            year: z.string().max(20).nullable(),
          })
          .strict()
      )
      .max(10),
    skills: z.array(z.string().max(120)).max(100),
    languages: z.array(z.string().max(80)).max(20),
    cv_language: z.enum(["ar", "en", "mixed"]),
  })
  .strict();
export type CandidateProfile = z.infer<typeof CandidateProfile>;

// ---------------------------------------------------------------------------
// Tenancy and the interview allowance (D33)
// ---------------------------------------------------------------------------

// Who is paying, without saying who. `ref` is a keyed hash of the platform's
// organization id; the allowance comes from the organization's plan and is
// enforced by the agent before any model call (the D16 pattern).
export const TenantContext = z
  .object({
    ref: OpaqueRef,
    // Interviews per calendar month (UTC). null = uncapped; 0 = the plan
    // includes none, and nothing that costs a model call may start.
    monthly_interview_allowance: z.number().int().min(0).max(100000).nullable(),
  })
  .strict();
export type TenantContext = z.infer<typeof TenantContext>;

// ---------------------------------------------------------------------------
// Question banks (design §4.2–4.3, milestone I1)
// ---------------------------------------------------------------------------

// "situational" questions are drawn from the behavioral share of the mix.
// "coding" stays unavailable until the sandbox exists (I4, D32), and the
// agent refuses a mix that asks for it.
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

export const RubricCriterion = z
  .object({
    name: z.string().trim().min(1).max(120),
    weight: z.number().int().min(1).max(5),
    excellent: z.string().trim().min(1).max(400),
    acceptable: z.string().trim().min(1).max(400),
    weak: z.string().trim().min(1).max(400),
  })
  .strict();
export type RubricCriterion = z.infer<typeof RubricCriterion>;

// One question as the candidate's interviewer will use it. The same shape
// holds what the model produced and what staff changed it to.
export const QuestionContent = z
  .object({
    kind: QuestionKind,
    text_ar: z.string().trim().min(8).max(600),
    // The job requirement this question tests.
    competency: z.string().trim().min(1).max(120),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    expected_points: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
    rubric: z
      .object({ criteria: z.array(RubricCriterion).max(5) })
      .strict(),
    time_limit_sec: z.number().int().min(30).max(1200).nullable(),
    follow_up_policy: z.enum(["none", "on_vague", "probe_claim"]),
  })
  .strict()
  // The warm-up is never scored (design §4.4); every other question is, so
  // it needs at least one criterion to be scored against.
  .refine((q) => q.kind === "warmup" || q.rubric.criteria.length > 0, {
    message: "a scored question needs at least one rubric criterion",
    path: ["rubric", "criteria"],
  });
export type QuestionContent = z.infer<typeof QuestionContent>;

export const QuestionStatus = z.enum(["pending", "approved", "removed"]);
export type QuestionStatus = z.infer<typeof QuestionStatus>;

const Timestamp = z.iso.datetime({ offset: true });
const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const BankQuestionView = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  status: QuestionStatus,
  // What the model produced. Never modified after it is stored — the same
  // rule CLAUDE.md §10.6 applies to evaluations.
  original: QuestionContent,
  // Staff's version, kept apart from the original. null = unedited.
  edited: QuestionContent.nullable(),
  // Set on a question generated to replace another ("generate a
  // replacement"); the replaced one is marked removed, not deleted.
  replaces: z.uuid().nullable(),
  updated_at: Timestamp,
});
export type BankQuestionView = z.infer<typeof BankQuestionView>;

// One review action. `edit` carries the complete new content; its kind must
// equal the original's. `restore` puts a removed question back to pending.
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

export const JOB_BANK_STATUSES = [
  "generating",
  "awaiting_review",
  "locked",
  "failed",
] as const;
export const JobBankStatus = z.enum(JOB_BANK_STATUSES);
export type JobBankStatus = z.infer<typeof JobBankStatus>;

// The core bank for one job: generated once, reviewed by staff (mandatory,
// D30), locked, and shared by every interview for that job so candidates are
// compared on the same structure.
export const CreateJobBankRequest = z
  .object({
    external_ref: OpaqueRef,
    tenant: TenantContext,
    job: JobContext,
  })
  .strict();
export type CreateJobBankRequest = z.infer<typeof CreateJobBankRequest>;

export const JobBankView = z.object({
  id: z.uuid(),
  external_ref: OpaqueRef,
  // A locked bank never changes; revising it creates the next version.
  version: z.number().int().min(1),
  status: JobBankStatus,
  bank_hash: Sha256Hex.nullable(),
  locked_at: Timestamp.nullable(),
  // A machine-readable reason when generation failed. Never model output.
  failure: z.string().max(100).nullable(),
  questions: z.array(BankQuestionView),
  regenerations_left: z.number().int().min(0),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type JobBankView = z.infer<typeof JobBankView>;

// ---------------------------------------------------------------------------
// Creating an interview (continued)
// ---------------------------------------------------------------------------

// The job comes from the locked bank, so it is not sent again: the gap
// probes are written against the same job text the staff reviewed.
export const CreateInterviewRequest = z
  .object({
    external_ref: OpaqueRef,
    candidate_ref: OpaqueRef,
    tenant: TenantContext,
    job_bank_id: z.uuid(),
    candidate_profile: CandidateProfile,
    config: InterviewConfig,
  })
  .strict();
export type CreateInterviewRequest = z.infer<typeof CreateInterviewRequest>;

export const InterviewView = z.object({
  id: z.uuid(),
  external_ref: OpaqueRef,
  status: InterviewStatus,
  config: InterviewConfig,
  job_bank_id: z.uuid().nullable(),
  // Set when staff lock this interview's questions (core bank + gap probes).
  bank_locked_at: Timestamp.nullable(),
  plan_hash: Sha256Hex.nullable(),
  failure: z.string().max(100).nullable(),
  opens_at: Timestamp.nullable(),
  closes_at: Timestamp.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type InterviewView = z.infer<typeof InterviewView>;

// The candidate-specific part of an interview's questions. Reviewing gap
// probes is optional (design §12.6): locking approves whatever is pending.
export const InterviewBankView = z.object({
  interview_id: z.uuid(),
  status: InterviewStatus,
  job_bank_id: z.uuid(),
  job_bank_hash: Sha256Hex,
  gap_probes: z.array(BankQuestionView),
  // Fixed at lock: the questions this candidate will be asked, in order.
  plan: z
    .array(z.object({ question_id: z.uuid(), kind: QuestionKind }))
    .nullable(),
  plan_hash: Sha256Hex.nullable(),
  locked_at: Timestamp.nullable(),
  regenerations_left: z.number().int().min(0),
});
export type InterviewBankView = z.infer<typeof InterviewBankView>;

// ---------------------------------------------------------------------------
// Candidate sessions
// ---------------------------------------------------------------------------

export const SessionTokenRequest = z
  .object({ candidate_ref: OpaqueRef })
  .strict();

export const SessionTokenResponse = z.object({
  token: z.string().min(1),
  expires_at: Timestamp,
});
export type SessionTokenResponse = z.infer<typeof SessionTokenResponse>;

export const SessionView = z.object({
  interview_id: z.uuid(),
  status: InterviewStatus,
  modes: z.array(InterviewMode),
  duration_minutes: z.number().int(),
  opens_at: Timestamp.nullable(),
  closes_at: Timestamp.nullable(),
  // The server's clock, so the browser renders countdowns from it rather
  // than from a device clock the candidate controls.
  server_time: Timestamp,
  remaining_seconds: z.number().int().min(0).nullable(),
});
export type SessionView = z.infer<typeof SessionView>;

// ---------------------------------------------------------------------------
// Events (agent -> platform webhooks)
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "interview.planned",
  "interview.bank_locked",
  "interview.started",
  "interview.submitted",
  "interview.evaluated",
  "interview.expired",
  "interview.failed",
  "interview.cancelled",
] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

export const InterviewEvent = z
  .object({
    event_id: z.uuid(),
    type: EventType,
    interview_id: z.uuid(),
    external_ref: OpaqueRef,
    // The interview's status as of this event. Deliveries can arrive out of
    // order after retries, so the receiver applies a status only when
    // occurred_at is newer than the last one it applied.
    status: InterviewStatus,
    occurred_at: Timestamp,
    // Per-type payloads, added with the milestone that produces them:
    //   interview.planned      { gap_probes: number }
    //   interview.bank_locked  { plan_hash: string }
    //   interview.failed       { reason: string }   (a code, never content)
    // The evaluation report lands in I3.
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type InterviewEvent = z.infer<typeof InterviewEvent>;

// Error codes the platform maps to Arabic wording (it never shows `message`):
//   400 invalid_request · idempotency_key_required
//   401 unauthorized
//   402 interviews_not_in_plan (allowance 0) · quota_exceeded
//   403 candidate_mismatch · tenant_mismatch
//   404 not_found
//   409 invalid_transition · external_ref_exists · bank_in_progress ·
//       bank_not_locked · bank_locked · pending_questions ·
//       too_few_questions · insufficient_bank · not_accepting_candidates ·
//       question_not_editable
//   422 coding_unavailable · voice_unavailable · protected_category ·
//       generic_question · kind_mismatch
//   429 rate_limited · regeneration_limit
//   502 generation_failed
//   503 llm_not_configured
export const ApiError = z.object({
  error: z.string(),
  message: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
