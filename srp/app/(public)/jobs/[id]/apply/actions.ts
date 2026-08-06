"use server";

import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  CV_MAX_BYTES,
  CV_MIME_TYPES,
} from "@/lib/validations/application";
import { ar } from "@/lib/i18n/ar";

export type ApplyState =
  | { ok: false; error: string | null; fieldErrors: Record<string, string> }
  | { ok: true; refCode: string };

function fail(
  error: string,
  fieldErrors: Record<string, string> = {}
): ApplyState {
  return { ok: false, error, fieldErrors };
}

// D15: this action no longer writes anything. `anon` lost INSERT on
// `applications` and on the `cvs` bucket in 0006/0007, because a public,
// multi-tenant job board cannot hand unauthenticated callers a write
// primitive — they could file into another company's folder or flood
// storage. All of it now happens inside the submit-application Edge
// Function, which derives org_id from the job, rate-limits, and writes with
// the service role. This action just relays the form and translates the
// function's error codes into Arabic.

// The function speaks codes; the UI speaks Arabic. Mapping lives here so
// the API boundary stays language-free.
const FIELD_MESSAGES: Record<string, string> = {
  full_name: ar.apply.errors.fullName,
  email: ar.apply.errors.email,
  phone: ar.apply.errors.phone,
  cover_note: ar.apply.errors.coverNote,
};

const CV_MESSAGES: Record<string, string> = {
  required: ar.apply.errors.cvRequired,
  type: ar.apply.errors.cvType,
  size: ar.apply.errors.cvSize,
};

function translateFieldErrors(
  raw: Record<string, string> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, code] of Object.entries(raw ?? {})) {
    if (key === "cv") {
      out.cv = CV_MESSAGES[code] ?? ar.apply.errors.cvRequired;
    } else if (key === "email" && code === "duplicate") {
      out.email = ar.apply.errors.duplicate;
    } else if (key in FIELD_MESSAGES) {
      out[key] = FIELD_MESSAGES[key]!;
    } else if (key.startsWith("sq_")) {
      out[key] = ar.apply.errors.questionRequired;
    }
  }
  return out;
}

export async function submitApplication(
  jobId: string,
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  // Cheap client-side-equivalent checks first, so an oversized file is not
  // uploaded across the network only to be refused.
  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    return fail(ar.apply.errors.invalidInput, {
      cv: ar.apply.errors.cvRequired,
    });
  }
  if (!(cv.type in CV_MIME_TYPES)) {
    return fail(ar.apply.errors.invalidInput, { cv: ar.apply.errors.cvType });
  }
  if (cv.size > CV_MAX_BYTES) {
    return fail(ar.apply.errors.invalidInput, { cv: ar.apply.errors.cvSize });
  }

  formData.set("job_id", jobId);

  let response: Response;
  try {
    const { url, anonKey } = getSupabaseEnv();
    response = await fetch(`${url}/functions/v1/submit-application`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        // Content-Type is deliberately unset: fetch derives the multipart
        // boundary from the FormData body.
      },
      body: formData,
    });
  } catch (err) {
    console.error(
      "submit-application unreachable:",
      err instanceof Error ? err.message : err
    );
    return fail(ar.apply.errors.serverError);
  }

  let body: {
    ok?: boolean;
    ref_code?: string;
    error?: string;
    field_errors?: Record<string, string>;
  };
  try {
    body = await response.json();
  } catch {
    return fail(ar.apply.errors.serverError);
  }

  if (response.ok && body.ok && body.ref_code) {
    return { ok: true, refCode: body.ref_code };
  }

  const fieldErrors = translateFieldErrors(body.field_errors);

  switch (body.error) {
    case "duplicate":
      return fail(ar.apply.errors.duplicate, {
        email: ar.apply.errors.duplicate,
      });
    case "job_closed":
      return fail(ar.apply.errors.jobClosed);
    case "rate_limited":
      return fail(ar.apply.errors.rateLimited);
    case "captcha_failed":
      return fail(ar.apply.errors.captchaFailed);
    case "invalid_input":
      return fail(ar.apply.errors.invalidInput, fieldErrors);
    default:
      console.error(
        "submit-application failed:",
        response.status,
        body.error ?? "unknown"
      );
      return fail(ar.apply.errors.serverError);
  }
}
