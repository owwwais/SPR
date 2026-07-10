"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { InterviewQa } from "@/lib/validations/screening";
import { ar } from "@/lib/i18n/ar";
import type { AppStatus, Json } from "@/types/database";

// FR-06: re-run analysis for failed (or re-runnable) applications. Invoked
// with the staff member's own JWT — the Edge Function verifies is_staff()
// before accepting force. The invocation is not awaited to completion:
// analysis continues server-side; the page shows the live analysis_status.
export async function reRunAnalysis(
  applicationId: string,
  returnPath: string
): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const invocation = supabase.functions.invoke("analyze-application", {
    body: { application_id: applicationId, force: true },
  });
  // Surface immediate failures (missing function, auth) without blocking on
  // the full Gemini roundtrip.
  const raced = await Promise.race([
    invocation.catch((err) => ({
      error: err instanceof Error ? err : new Error(String(err)),
    })),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  if (raced && "error" in raced && raced.error) {
    console.warn("re-run analysis failed:", raced.error.message);
    redirect(`${returnPath}?error=retryFailed`);
  }

  revalidatePath(returnPath);
  redirect(returnPath);
}

const APP_STATUSES: AppStatus[] = [
  "new",
  "under_review",
  "interview",
  "accepted",
  "rejected",
];

// FR-08: templates exist for interview & rejection only ("received" goes out
// at submission time); other transitions send no email.
const STATUS_EMAIL_KIND: Partial<Record<AppStatus, string>> = {
  interview: "interview_invited",
  rejected: "rejected",
};

export type StatusChangeState = { changed: boolean; error: string | null };

// FR-08: status changes go through the change_application_status RPC only —
// it validates the caller, updates the row, and the DB trigger writes the
// history entry (with the note) atomically.
export async function changeApplicationStatus(
  applicationId: string,
  _prev: StatusChangeState,
  formData: FormData
): Promise<StatusChangeState> {
  await requireProfile();

  const newStatus = String(formData.get("status") ?? "") as AppStatus;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!APP_STATUSES.includes(newStatus)) {
    return { changed: false, error: ar.application.statusChange.failed };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_application_status", {
    p_application_id: applicationId,
    p_new_status: newStatus,
    p_note: note.length > 0 ? note : null,
  });
  if (error) {
    console.error("change_application_status failed:", error.message);
    return { changed: false, error: ar.application.statusChange.failed };
  }

  // Never blocks or fails the status change (same posture as D4).
  const emailKind = STATUS_EMAIL_KIND[newStatus];
  if (emailKind) {
    try {
      const publicClient = createPublicClient();
      const { error: emailError } = await publicClient.functions.invoke(
        "send-email",
        { body: { kind: emailKind, application_id: applicationId } }
      );
      if (emailError) console.warn("status email failed:", emailError.message);
    } catch (err) {
      console.warn(
        "status email failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  revalidatePath(`/admin/applications/${applicationId}`);
  return { changed: true, error: null };
}

export type InterviewState = { saved: boolean; error: string | null };

// Interview management: schedule + the running Q&A record. The client
// component serializes state into hidden fields (ISO timestamp + JSON);
// zod re-validates before anything is written. Column-level grants restrict
// staff to exactly these two fields.
export async function saveInterview(
  applicationId: string,
  _prev: InterviewState,
  formData: FormData
): Promise<InterviewState> {
  await requireProfile();

  const rawAt = String(formData.get("interview_at_iso") ?? "").trim();
  let interviewAt: string | null = null;
  if (rawAt.length > 0) {
    const date = new Date(rawAt);
    if (Number.isNaN(date.getTime())) {
      return { saved: false, error: ar.interview.failed };
    }
    interviewAt = date.toISOString();
  }

  let qa: unknown;
  try {
    qa = JSON.parse(String(formData.get("interview_qa") ?? "[]"));
  } catch {
    return { saved: false, error: ar.interview.failed };
  }
  const parsedQa = InterviewQa.safeParse(qa);
  if (!parsedQa.success) {
    return { saved: false, error: ar.interview.failed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({
      interview_at: interviewAt,
      interview_qa: parsedQa.data as unknown as Json,
    })
    .eq("id", applicationId);
  if (error) {
    console.error("saveInterview failed:", error.message);
    return { saved: false, error: ar.interview.failed };
  }

  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/calendar");
  return { saved: true, error: null };
}

export type NotesState = { saved: boolean; error: string | null };

// FR-07: HR notes live in ai_evaluations.interview_notes only — the AI
// originals are immutable (column-level grant enforces this in the DB).
export async function saveInterviewNotes(
  applicationId: string,
  _prev: NotesState,
  formData: FormData
): Promise<NotesState> {
  await requireProfile();
  const notes = String(formData.get("interview_notes") ?? "").slice(0, 4000);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_evaluations")
    .update({ interview_notes: notes.trim().length > 0 ? notes : null })
    .eq("application_id", applicationId);
  if (error) {
    console.error("saveInterviewNotes failed:", error.message);
    return { saved: false, error: ar.evaluation.notesFailed };
  }

  revalidatePath(`/admin/applications/${applicationId}`);
  return { saved: true, error: null };
}
