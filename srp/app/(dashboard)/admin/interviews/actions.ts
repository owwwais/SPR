"use server";

import { revalidatePath } from "next/cache";
import { canWrite, requireMembership, type Session } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  BankEdit,
  BankReply,
  CancelReply,
  CreateReply,
  InterviewConfigInput,
  InterviewReply,
  QUESTION_TOTAL_MAX,
  QUESTION_TOTAL_MIN,
  callGateway,
  interviewErrorMessage,
  type GatewayResult,
} from "@/lib/interviews";
import { ar } from "@/lib/i18n/ar";

// Question banks and virtual interviews (I1, D30). Every action:
//   1. requires a membership and a writing role (viewers read only);
//   2. confirms the row belongs to the ACTIVE organization, by an explicit
//      org_id filter on the caller's own RLS-bound client — the gateway
//      authorises again against the row's own organization, so this is the
//      first of two layers, never the only one (§2.1);
//   3. calls interview-gateway with the caller's JWT, and maps any code to
//      Arabic wording — neither a code nor the agent's message reaches the UI.
// Nothing here decides anything about a candidate: these actions shape the
// questions; the report (I3) is advisory and never changes an application.

export type InterviewActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errors = ar.interviewBank.errors;

function failed(code: string): InterviewActionResult {
  return { ok: false, error: interviewErrorMessage(code) };
}

function outcome<T>(result: GatewayResult<T>): InterviewActionResult {
  return result.ok ? { ok: true } : failed(result.code);
}

function bankPagePath(jobId: string) {
  return `/admin/jobs/${jobId}/interview-bank`;
}

function applicationPath(applicationId: string) {
  return `/admin/applications/${applicationId}`;
}

async function writer(): Promise<Session | null> {
  const session = await requireMembership();
  return canWrite(session.role) ? session : null;
}

// The bank row, only when it belongs to the caller's active organization.
async function ownBank(session: Session, bankId: string) {
  if (!UUID_RE.test(bankId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("interview_job_banks")
    .select("id, job_id")
    .eq("id", bankId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  return data;
}

async function ownAssignment(session: Session, assignmentId: string) {
  if (!UUID_RE.test(assignmentId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("interview_assignments")
    .select("id, application_id")
    .eq("id", assignmentId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// A job's core bank
// ---------------------------------------------------------------------------

/** Generates the job's first bank, or its next version after a locked one. */
export async function generateJobBank(jobId: string): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };
  if (!UUID_RE.test(jobId)) return failed("not_found");

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("org_id", session.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) return failed("not_found");

  const result = await callGateway({ action: "bank_create", job_id: job.id }, BankReply);
  // Even a refusal can leave a row behind (marked failed, with its code), so
  // the page is refreshed either way.
  revalidatePath(bankPagePath(job.id));
  return outcome(result);
}

export async function editJobBank(
  bankId: string,
  edit: BankEdit
): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };

  // The edit arrives from the browser: validated again here on the shape the
  // agent accepts, before anything is sent.
  const parsed = BankEdit.safeParse(edit);
  if (!parsed.success) return { ok: false, error: errors.invalid_edit };

  const bank = await ownBank(session, bankId);
  if (!bank) return failed("not_found");

  const result = await callGateway(
    { action: "bank_edit", bank_id: bank.id, edit: parsed.data },
    BankReply
  );
  revalidatePath(bankPagePath(bank.job_id));
  return outcome(result);
}

export async function lockJobBank(bankId: string): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };
  const bank = await ownBank(session, bankId);
  if (!bank) return failed("not_found");

  const result = await callGateway({ action: "bank_lock", bank_id: bank.id }, BankReply);
  revalidatePath(bankPagePath(bank.job_id));
  // Applicant pages read the job's current locked bank for their panel. A
  // route pattern names the file structure, route group included.
  if (result.ok) revalidatePath("/(dashboard)/admin/applications/[id]", "page");
  return outcome(result);
}

export async function retryJobBank(bankId: string): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };
  const bank = await ownBank(session, bankId);
  if (!bank) return failed("not_found");

  // A bank the agent never accepted comes back as the job's NEXT version
  // (a new row); the page shows the newest bank, so it follows either way.
  const result = await callGateway({ action: "bank_retry", bank_id: bank.id }, BankReply);
  revalidatePath(bankPagePath(bank.job_id));
  return outcome(result);
}

// ---------------------------------------------------------------------------
// One applicant's virtual interview
// ---------------------------------------------------------------------------

export type ConfigField =
  | "technical"
  | "behavioral"
  | "gap_probe"
  | "total"
  | "duration_minutes"
  | "extra_time_percent"
  | "candidate_result"
  | "paste_policy";

export type CreateInterviewState = {
  ok: boolean;
  error: string | null;
  fieldErrors: Partial<Record<ConfigField, string>>;
};

function intField(formData: FormData, name: string): number {
  const raw = formData.get(name);
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw.trim())) return Number.NaN;
  return Number.parseInt(raw.trim(), 10);
}

function inRange(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export async function createVirtualInterview(
  applicationId: string,
  _prev: CreateInterviewState,
  formData: FormData
): Promise<CreateInterviewState> {
  const fail = (error: string, fieldErrors: CreateInterviewState["fieldErrors"] = {}) => ({
    ok: false,
    error,
    fieldErrors,
  });

  const session = await writer();
  if (!session) return fail(errors.forbidden);
  if (!UUID_RE.test(applicationId)) return fail(interviewErrorMessage("not_found"));

  const supabase = await createClient();
  const { data: application } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!application) return fail(interviewErrorMessage("not_found"));

  const f = ar.interviewBank.panel.form.fieldErrors;
  const technical = intField(formData, "technical");
  const behavioral = intField(formData, "behavioral");
  const gapProbe = intField(formData, "gap_probe");
  const warmup = formData.get("warmup") === "on" ? 1 : 0;
  const duration = intField(formData, "duration_minutes");
  const extraTime = intField(formData, "extra_time_percent");
  const candidateResult = formData.get("candidate_result");
  const pastePolicy = formData.get("paste_policy");

  const fieldErrors: CreateInterviewState["fieldErrors"] = {};
  if (!inRange(technical, 0, 15)) fieldErrors.technical = f.counts;
  if (!inRange(behavioral, 0, 15)) fieldErrors.behavioral = f.counts;
  if (!inRange(gapProbe, 0, 15)) fieldErrors.gap_probe = f.counts;
  const total = technical + behavioral + gapProbe + warmup;
  if (
    !fieldErrors.technical &&
    !fieldErrors.behavioral &&
    !fieldErrors.gap_probe &&
    !inRange(total, QUESTION_TOTAL_MIN, QUESTION_TOTAL_MAX)
  ) {
    fieldErrors.total = f.total;
  }
  if (!inRange(duration, 10, 120)) fieldErrors.duration_minutes = f.duration;
  if (!inRange(extraTime, 0, 100)) fieldErrors.extra_time_percent = f.extraTime;
  if (
    candidateResult !== "none" &&
    candidateResult !== "completion" &&
    candidateResult !== "summary"
  ) {
    fieldErrors.candidate_result = f.choice;
  }
  if (pastePolicy !== "record" && pastePolicy !== "block") {
    fieldErrors.paste_policy = f.choice;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(errors.invalid_config, fieldErrors);
  }

  // Text only and no coding until their milestones (I5, I4): fixed here,
  // whatever the form sent.
  const config = InterviewConfigInput.safeParse({
    question_count: total,
    mix: {
      technical,
      behavioral,
      gap_probe: gapProbe,
      coding: 0,
      warmup,
    },
    modes: ["text"],
    duration_minutes: duration,
    paste_policy: pastePolicy,
    candidate_result: candidateResult,
    accommodations: { extra_time_percent: extraTime },
  });
  if (!config.success) return fail(errors.invalid_config);

  const result = await callGateway(
    { action: "create", application_id: application.id, config: config.data },
    CreateReply
  );
  revalidatePath(applicationPath(application.id));
  if (!result.ok) return fail(interviewErrorMessage(result.code));
  return { ok: true, error: null, fieldErrors: {} };
}

export async function cancelVirtualInterview(
  assignmentId: string
): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };
  const assignment = await ownAssignment(session, assignmentId);
  if (!assignment) return failed("not_found");

  const result = await callGateway(
    { action: "cancel", assignment_id: assignment.id },
    CancelReply
  );
  revalidatePath(applicationPath(assignment.application_id));
  return outcome(result);
}

/** Review of the candidate's gap probes (optional, design §12.6). */
export async function editInterviewBank(
  assignmentId: string,
  edit: BankEdit
): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };

  const parsed = BankEdit.safeParse(edit);
  if (!parsed.success) return { ok: false, error: errors.invalid_edit };

  const assignment = await ownAssignment(session, assignmentId);
  if (!assignment) return failed("not_found");

  const result = await callGateway(
    { action: "interview_bank_edit", assignment_id: assignment.id, edit: parsed.data },
    InterviewReply
  );
  revalidatePath(applicationPath(assignment.application_id));
  return outcome(result);
}

export async function lockInterviewBank(
  assignmentId: string
): Promise<InterviewActionResult> {
  const session = await writer();
  if (!session) return { ok: false, error: errors.forbidden };
  const assignment = await ownAssignment(session, assignmentId);
  if (!assignment) return failed("not_found");

  const result = await callGateway(
    { action: "interview_bank_lock", assignment_id: assignment.id },
    InterviewReply
  );
  revalidatePath(applicationPath(assignment.application_id));
  return outcome(result);
}
