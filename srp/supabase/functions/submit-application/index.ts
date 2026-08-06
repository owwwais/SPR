// submit-application — the ONLY write path available to an applicant (D15).
//
// Before multi-tenancy the browser inserted into `applications` and uploaded
// to the `cvs` bucket directly as `anon`. That cannot survive a shared job
// board: an unauthenticated caller could write into any organization's CV
// folder, flood storage with files no row referenced, and burn a tenant's AI
// quota with fabricated submissions. 0006/0007 revoked those grants; this
// function replaces them.
//
// The one rule that matters here: `org_id` is derived from the job row we
// just read, never taken from the request. (A database trigger enforces the
// same thing independently — see applications_set_org in 0006.)
//
// Contract: POST multipart/form-data
//   job_id, full_name, email, phone, cover_note, cv (File), sq_{question_id}…
//   plus an optional Turnstile token as `cf-turnstile-response`.
// Responses are machine-readable codes; the Arabic wording lives in
// lib/i18n/ar.ts on the Next.js side.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY, plus optional TURNSTILE_SECRET_KEY and THROTTLE_SALT.
import { createClient } from "@supabase/supabase-js";
import {
  applicationSchema,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  type CvMime,
} from "../../../lib/validations/application.ts";
import {
  ScreeningAnswers,
  ScreeningQuestions,
  type ScreeningAnswerType,
} from "../../../lib/validations/screening.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The apply form renders yes/no questions with these Arabic labels; answers
// are validated against the job's own definition, so these are the only two
// literals the function needs to know about.
const YES = "نعم";
const NO = "لا";

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type Fail = {
  error: string;
  field_errors?: Record<string, string>;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fail(status: number, body: Fail): Response {
  return json(status, body);
}

function generateRefCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += REF_ALPHABET[byte % REF_ALPHABET.length];
  return `SRP-${code}`;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]!.trim() || "unknown";
}

// Optional: only enforced once a site key is configured (S9-mini). Absent
// configuration must not block submissions, or a misconfigured deploy
// silently rejects every applicant.
async function turnstileOk(token: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      }
    );
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch (err) {
    // Never let an outage at the captcha provider close the funnel.
    console.error(
      "turnstile verification unavailable:",
      err instanceof Error ? err.message : err
    );
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, { error: "invalid_input" });
  }

  const jobId = String(form.get("job_id") ?? "");
  if (!UUID_RE.test(jobId)) return fail(400, { error: "invalid_input" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---- 1. resolve the job, and with it the tenant --------------------
  // Everything downstream — the storage folder, the row's org_id, the quota
  // that will be charged — hangs off this read. It is deliberately the first
  // thing that happens.
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select(
      "id, org_id, status, closes_at, deleted_at, screening_questions, organizations(status, deleted_at)"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    console.error("job lookup failed:", jobError.message);
    return fail(500, { error: "server_error" });
  }
  if (!job) return fail(404, { error: "job_closed" });

  const org = job.organizations as unknown as {
    status: string;
    deleted_at: string | null;
  } | null;

  const today = new Date().toISOString().slice(0, 10);
  const jobOpen =
    job.status === "published" &&
    job.deleted_at === null &&
    (job.closes_at === null || job.closes_at >= today);
  // A suspended or cancelled tenant stops accepting applications the moment
  // their subscription lapses — no orphaned pipeline, no AI spend.
  const orgLive =
    org !== null &&
    org.deleted_at === null &&
    (org.status === "trial" || org.status === "active");

  if (!jobOpen || !orgLive) return fail(409, { error: "job_closed" });

  // ---- 2. validate the applicant's own fields ------------------------
  const parsed = applicationSchema.safeParse({
    full_name: form.get("full_name"),
    email: form.get("email"),
    phone: form.get("phone"),
    cover_note: form.get("cover_note") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !(key in fieldErrors)) fieldErrors[key] = "invalid";
    }
    return fail(400, { error: "invalid_input", field_errors: fieldErrors });
  }

  const cv = form.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    return fail(400, {
      error: "invalid_input",
      field_errors: { cv: "required" },
    });
  }
  if (!(cv.type in CV_MIME_TYPES)) {
    return fail(400, {
      error: "invalid_input",
      field_errors: { cv: "type" },
    });
  }
  if (cv.size > CV_MAX_BYTES) {
    return fail(400, {
      error: "invalid_input",
      field_errors: { cv: "size" },
    });
  }

  // ---- 3. screening answers, checked against the JOB's definition ----
  // Never against a question list supplied by the client.
  const parsedQuestions = ScreeningQuestions.safeParse(job.screening_questions);
  const questions = parsedQuestions.success ? parsedQuestions.data : [];

  const answers: ScreeningAnswerType[] = [];
  const questionErrors: Record<string, string> = {};

  for (const question of questions) {
    const key = `sq_${question.id}`;

    if (question.type === "multiple_choice") {
      const values = form
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
        questionErrors[key] = "required";
      }
      continue;
    }

    let value = String(form.get(key) ?? "").trim();
    if (question.type === "yes_no" && value !== YES && value !== NO) {
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
      questionErrors[key] = "required";
    }
  }

  if (Object.keys(questionErrors).length > 0) {
    return fail(400, { error: "invalid_input", field_errors: questionErrors });
  }

  const validatedAnswers = ScreeningAnswers.safeParse(answers);
  if (!validatedAnswers.success) return fail(400, { error: "invalid_input" });

  // ---- 4. abuse controls ---------------------------------------------
  if (!(await turnstileOk(form.get("cf-turnstile-response") as string | null))) {
    return fail(403, { error: "captcha_failed" });
  }

  const salt = Deno.env.get("THROTTLE_SALT") ?? "srp";
  const [ipHash, emailHash] = await Promise.all([
    sha256Hex(`${salt}:${clientIp(req)}`),
    sha256Hex(`${salt}:${parsed.data.email}`),
  ]);

  const { data: throttle, error: throttleError } = await admin.rpc(
    "record_submission_attempt",
    { p_ip_hash: ipHash, p_email_hash: emailHash, p_job_id: jobId }
  );
  if (throttleError) {
    console.error("throttle check failed:", throttleError.message);
    return fail(500, { error: "server_error" });
  }
  if (throttle) return fail(429, { error: String(throttle) });

  // ---- 5. reject duplicates BEFORE uploading --------------------------
  // The old flow uploaded first and discovered the duplicate on insert,
  // leaving an orphan file behind for the retention job to sweep. Checking
  // first makes the common rejection free. The unique constraint is still
  // the authority, for the race.
  const { data: existing } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (existing) {
    return fail(409, {
      error: "duplicate",
      field_errors: { email: "duplicate" },
    });
  }

  // ---- 6. upload into the tenant's own folder -------------------------
  const applicationId = crypto.randomUUID();
  const extension = CV_MIME_TYPES[cv.type as CvMime];
  const cvPath = `${job.org_id}/${applicationId}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("cvs")
    .upload(cvPath, cv, { contentType: cv.type, upsert: false });
  if (uploadError) {
    console.error("CV upload failed:", uploadError.message);
    return fail(500, { error: "server_error" });
  }

  const cleanupUpload = async () => {
    const { error } = await admin.storage.from("cvs").remove([cvPath]);
    if (error) console.error("orphan cleanup failed:", error.message);
  };

  // ---- 7. insert -------------------------------------------------------
  let refCode = generateRefCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.from("applications").insert({
      id: applicationId,
      // org_id is intentionally omitted: the applications_set_org trigger
      // derives it from job_id, so there is no client-supplied value to
      // trust or to get wrong.
      job_id: jobId,
      ref_code: refCode,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      cv_path: cvPath,
      cv_mime: cv.type,
      cover_note: parsed.data.cover_note,
      screening_answers: validatedAnswers.data,
    });

    if (!error) {
      // D4: applying never fails because of the AI or the mailer.
      await Promise.allSettled([
        invokeFunction("analyze-application", { application_id: applicationId }),
        invokeFunction("send-email", {
          kind: "application_received",
          application_id: applicationId,
        }),
      ]);
      return json(200, { ok: true, ref_code: refCode });
    }

    if (error.code === "23505") {
      if (error.message.includes("ref_code")) {
        refCode = generateRefCode();
        continue;
      }
      // unique (job_id, email) — lost the race at step 5.
      await cleanupUpload();
      return fail(409, {
        error: "duplicate",
        field_errors: { email: "duplicate" },
      });
    }

    console.error("application insert failed:", error.code, error.message);
    await cleanupUpload();
    return fail(500, { error: "server_error" });
  }

  await cleanupUpload();
  return fail(500, { error: "server_error" });
});

// Fire-and-forget: a lost invocation leaves the row `pending`, which the
// housekeeping cron picks up (§4.2.4).
async function invokeFunction(name: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) console.error(`${name} returned HTTP ${res.status}`);
  } catch (err) {
    console.error(
      `${name} invocation failed:`,
      err instanceof Error ? err.message : err
    );
  }
}
