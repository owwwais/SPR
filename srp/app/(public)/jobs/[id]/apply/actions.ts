"use server";

import { createPublicClient } from "@/lib/supabase/public";
import {
  applicationSchema,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  type CvMime,
} from "@/lib/validations/application";
import {
  ScreeningAnswers,
  ScreeningQuestions,
  type ScreeningAnswerType,
} from "@/lib/validations/screening";
import { generateRefCode } from "@/lib/ref-code";
import { ar } from "@/lib/i18n/ar";
import type { Json } from "@/types/database";

export type ApplyState =
  | { ok: false; error: string | null; fieldErrors: Record<string, string> }
  | { ok: true; refCode: string };

function fail(
  error: string,
  fieldErrors: Record<string, string> = {}
): ApplyState {
  return { ok: false, error, fieldErrors };
}

// FR-03 / §4.2 step 1: validate -> upload CV -> insert application row.
// Analysis stays `pending` (the analyze-application invocation lands in M4).
// Always runs in the anon role via the public client, matching the RLS
// matrix (applications: anon insert only) even if a staff member applies.
export async function submitApplication(
  jobId: string,
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const parsed = applicationSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    cover_note: formData.get("cover_note") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return fail(ar.apply.errors.invalidInput, fieldErrors);
  }

  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    return fail(ar.apply.errors.invalidInput, { cv: ar.apply.errors.cvRequired });
  }
  if (!(cv.type in CV_MIME_TYPES)) {
    return fail(ar.apply.errors.invalidInput, { cv: ar.apply.errors.cvType });
  }
  if (cv.size > CV_MAX_BYTES) {
    return fail(ar.apply.errors.invalidInput, { cv: ar.apply.errors.cvSize });
  }

  const supabase = createPublicClient();

  // Screening answers are validated against the job's authoritative question
  // definitions — never against anything the client sent.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("screening_questions")
    .eq("id", jobId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (!jobRow) return fail(ar.apply.errors.jobClosed);

  const parsedQuestions = ScreeningQuestions.safeParse(
    jobRow.screening_questions
  );
  const questions = parsedQuestions.success ? parsedQuestions.data : [];

  const answers: ScreeningAnswerType[] = [];
  const questionErrors: Record<string, string> = {};
  for (const question of questions) {
    const key = `sq_${question.id}`;
    if (question.type === "multiple_choice") {
      const values = formData
        .getAll(key)
        .map(String)
        .filter((v) => question.options.includes(v));
      if (values.length > 0) {
        answers.push({
          question_id: question.id,
          label: question.label,
          type: question.type,
          answer: values,
        });
      } else if (question.required) {
        questionErrors[key] = ar.apply.errors.questionRequired;
      }
      continue;
    }

    let value = String(formData.get(key) ?? "").trim();
    const yesNoOptions: string[] = [ar.apply.yes, ar.apply.no];
    if (question.type === "yes_no" && !yesNoOptions.includes(value)) {
      value = "";
    }
    if (question.type === "single_choice" && !question.options.includes(value)) {
      value = "";
    }
    value = value.slice(0, 2000);

    if (value.length > 0) {
      answers.push({
        question_id: question.id,
        label: question.label,
        type: question.type,
        answer: value,
      });
    } else if (question.required) {
      questionErrors[key] = ar.apply.errors.questionRequired;
    }
  }
  if (Object.keys(questionErrors).length > 0) {
    return fail(ar.apply.errors.invalidInput, questionErrors);
  }
  const validatedAnswers = ScreeningAnswers.safeParse(answers);
  if (!validatedAnswers.success) {
    return fail(ar.apply.errors.invalidInput);
  }

  const applicationId = crypto.randomUUID();
  const cvPath = `${applicationId}.${CV_MIME_TYPES[cv.type as CvMime]}`;

  // §4.2 order: upload first, then insert. A rejected insert (e.g. duplicate)
  // leaves an unreferenced upload behind; it is never served to anyone and
  // the M7 retention job is the designated cleaner.
  const { error: uploadError } = await supabase.storage
    .from("cvs")
    .upload(cvPath, cv, { contentType: cv.type });
  if (uploadError) {
    console.error("CV upload failed:", uploadError.message);
    return fail(ar.apply.errors.serverError);
  }

  // Retry only on the astronomically unlikely ref_code collision.
  let refCode = generateRefCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from("applications").insert({
      id: applicationId,
      job_id: jobId,
      ref_code: refCode,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      cv_path: cvPath,
      cv_mime: cv.type,
      cover_note: parsed.data.cover_note,
      screening_answers: validatedAnswers.data as unknown as Json,
    });

    if (!error) {
      // §4.2: trigger analysis + confirmation email; neither may fail the
      // submission (D4 — applying never fails because of AI).
      await Promise.allSettled([
        triggerAnalysis(applicationId),
        sendConfirmationEmail(applicationId),
      ]);
      return { ok: true, refCode };
    }
    if (error.code === "23505") {
      if (error.message.includes("ref_code")) {
        refCode = generateRefCode();
        continue;
      }
      // unique (job_id, email) — FR-03 friendly duplicate rejection
      return fail(ar.apply.errors.duplicate, {
        email: ar.apply.errors.duplicate,
      });
    }
    if (error.code === "42501") {
      // RLS: job no longer published / past its closing date
      return fail(ar.apply.errors.jobClosed);
    }
    console.error("application insert failed:", error.code, error.message);
    return fail(ar.apply.errors.serverError);
  }
  return fail(ar.apply.errors.serverError);
}

// Fire-and-forget invocation of the AI pipeline (M4). The application row
// stays `pending` and is retried by cron / re-run from the dashboard if
// this invocation is lost.
async function triggerAnalysis(applicationId: string) {
  try {
    const supabase = createPublicClient();
    const { error } = await supabase.functions.invoke("analyze-application", {
      body: { application_id: applicationId },
    });
    if (error) console.warn("analysis trigger failed:", error.message);
  } catch (err) {
    console.warn(
      "analysis trigger failed:",
      err instanceof Error ? err.message : err
    );
  }
}

// Fire-and-forget: submission must never fail because of email (D4 spirit).
async function sendConfirmationEmail(applicationId: string) {
  try {
    const supabase = createPublicClient();
    const { error } = await supabase.functions.invoke("send-email", {
      body: { kind: "application_received", application_id: applicationId },
    });
    if (error) console.warn("confirmation email failed:", error.message);
  } catch (err) {
    console.warn(
      "confirmation email failed:",
      err instanceof Error ? err.message : err
    );
  }
}
