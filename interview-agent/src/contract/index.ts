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

export const CONTRACT_VERSION = "2026-10-16";

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

export const CreateInterviewRequest = z
  .object({
    external_ref: OpaqueRef,
    candidate_ref: OpaqueRef,
    job: JobContext,
    candidate_profile: CandidateProfile,
    config: InterviewConfig,
  })
  .strict();
export type CreateInterviewRequest = z.infer<typeof CreateInterviewRequest>;

const Timestamp = z.iso.datetime({ offset: true });

export const InterviewView = z.object({
  id: z.uuid(),
  external_ref: OpaqueRef,
  status: InterviewStatus,
  config: InterviewConfig,
  opens_at: Timestamp.nullable(),
  closes_at: Timestamp.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type InterviewView = z.infer<typeof InterviewView>;

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
    // Per-type payloads are added with the milestone that produces them
    // (the evaluation report lands in I3).
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type InterviewEvent = z.infer<typeof InterviewEvent>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
