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
// Two modes share one pipeline (job resolution, screening answers, throttle,
// duplicate check, insert, analysis + email):
//
// Guest (default). Contract: POST multipart/form-data
//   job_id, full_name, email, phone, cover_note, cv (File), sq_{question_id}…
//   plus an optional Turnstile token as `cf-turnstile-response`.
//
// Profile (D27), when `mode` = "profile": a signed-in seeker applies with a
// CV they already stored. POST multipart/form-data
//   job_id, mode, cv_version_id (optional uuid), consent ("on"), cover_note,
//   sq_{question_id}…
//   Authorization: Bearer <the user's access token>
// Name and phone come from the seeker's profile and the email from their
// verified identity — nothing about who is applying is read off the form.
// The company receives its OWN copy of the chosen CV version, so a seeker
// deleting their account never touches a submitted application, and company
// retention (D8) never touches the seeker's profile.
//
// Responses are machine-readable codes; the Arabic wording lives in
// lib/i18n/ar.ts on the Next.js side.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY, plus optional THROTTLE_SALT, TURNSTILE_SECRET_KEY with
// TURNSTILE_SITE_KEY (both, or the captcha stays off), and
// SUBMIT_RELAY_SECRET (shared with the Next.js server, which relays the
// visitor's address).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  applicationSchema,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  REF_CODE_PREFIX,
  type CvMime,
} from "../_shared/application.ts";
import {
  ScreeningAnswers,
  ScreeningQuestions,
  type ScreeningAnswerType,
} from "../_shared/screening.ts";

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

type Job = {
  id: string;
  org_id: string;
  screening_questions: unknown;
};

// Where the company's copy of the CV comes from: the file in this request
// (guest), or a stored version in the seeker's own bucket (profile).
type CvSource =
  | { kind: "upload"; file: File; mime: CvMime }
  | { kind: "copy"; path: string; mime: CvMime };

type Applicant = {
  full_name: string;
  email: string;
  phone: string;
  cover_note: string | null;
  // Set only in profile mode: the account that applied (0020).
  applicant_user_id: string | null;
  cv: CvSource;
};

type SeekerUser = { id: string; email: string };

type CvVersion = { id: string; path: string; mime: string; analysis_status: string };

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
  return `${REF_CODE_PREFIX}-${code}`;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// The rate-limit key, and therefore the thing that decides whether the limits
// in record_submission_attempt mean anything at all.
//
// Proxies APPEND to X-Forwarded-For, so the header reads
//   <whatever the caller sent>, <hop 1>, ..., <the edge we actually trust>
// Reading the leftmost value — the obvious choice, and what this did until
// now — reads a value the caller wrote. Sending a random X-Forwarded-For per
// request therefore earned a fresh limit bucket every time, which defeated
// the per-IP limits completely and left the AI spend unbounded.
//
// The rightmost entry is the one our own infrastructure appended and is the
// only one a caller cannot forge. Prefer the platform's own header when it is
// present, and fall back to that last hop.
//
// A guest form does not reach us from the visitor, though: the Next.js server
// action relays it, so every header above describes the web tier, and one
// 5-an-hour bucket was shared by every guest (OQ-07). The relay therefore
// sends the visitor's address with a shared secret; only a request carrying
// that secret may name the address it is counted under.
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,45})$/i;

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

function relayedIp(req: Request): string | null {
  const secret = Deno.env.get("SUBMIT_RELAY_SECRET");
  const presented = req.headers.get("x-relay-secret");
  const ip = req.headers.get("x-relay-client-ip")?.trim().toLowerCase();
  if (!secret || !presented || !ip || !timingSafeEqual(presented, secret)) return null;
  return IP_RE.test(ip) ? ip : null;
}

function clientIp(req: Request): string {
  const relayed = relayedIp(req);
  if (relayed) return relayed;

  const direct =
    req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();

  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1]! : "unknown";
}

// cv.type is whatever the browser attached to the File — a value the caller
// controls. Checking it alone lets any 5MB payload through labelled as a PDF,
// to be stored and then handed to the model. Read the actual leading bytes.
//   PDF  -> "%PDF"
//   DOCX -> a ZIP container, "PK\x03\x04"
async function sniffMime(file: File): Promise<CvMime | null> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head.length < 4) return null;
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
    return "application/pdf";
  }
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

// Optional (S9-mini): enforced only when BOTH keys are set here. The site key
// is not used by this function; it is the operator's statement that the
// widget is live on the form. With the secret alone, the form (built without
// NEXT_PUBLIC_TURNSTILE_SITE_KEY) renders no widget, sends no token, and
// every guest was refused (KD-03). Absent configuration must never block
// submissions.
async function turnstileOk(token: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const siteKey = Deno.env.get("TURNSTILE_SITE_KEY");
  if (!secret || !siteKey) {
    // Deploying without them disables the captcha, which is how an
    // environment ends up with no bot protection and nobody noticing.
    // Still allow the submission — refusing every applicant over a missing
    // env var is worse — but never let it pass unremarked.
    console.error(
      secret
        ? "TURNSTILE_SITE_KEY is not configured — captcha verification DISABLED (set it to the site key the form uses)"
        : "TURNSTILE_SECRET_KEY is not configured — captcha verification DISABLED"
    );
    return true;
  }
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

function fieldErrorsFrom(issues: ReadonlyArray<{ path: PropertyKey[] }>): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in fieldErrors)) fieldErrors[key] = "invalid";
  }
  return fieldErrors;
}

// ---- the job, and with it the tenant ------------------------------------
// Everything downstream — the storage folder, the row's org_id, the quota
// that will be charged — hangs off this read. Both modes do it before
// anything else touches the request's contents.
async function resolveJob(admin: SupabaseClient, jobId: string): Promise<Job | Response> {
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

  return {
    id: job.id as string,
    org_id: job.org_id as string,
    screening_questions: job.screening_questions,
  };
}

// ---- screening answers, checked against the JOB's definition -----------
// Never against a question list supplied by the client.
function collectAnswers(
  job: Job,
  form: FormData
): { answers: ScreeningAnswerType[]; errors: Record<string, string> } {
  const parsedQuestions = ScreeningQuestions.safeParse(job.screening_questions);
  const questions = parsedQuestions.success ? parsedQuestions.data : [];

  const answers: ScreeningAnswerType[] = [];
  const errors: Record<string, string> = {};

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
          disqualifying: question.disqualifying,
        });
      } else if (question.required) {
        errors[key] = "required";
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
        disqualifying: question.disqualifying,
      });
    } else if (question.required) {
      errors[key] = "required";
    }
  }

  return { answers, errors };
}

// ---- guest: everything comes from the form -------------------------------
async function guestApplicant(form: FormData): Promise<Applicant | Response> {
  const parsed = applicationSchema.safeParse({
    full_name: form.get("full_name"),
    email: form.get("email"),
    phone: form.get("phone"),
    cover_note: form.get("cover_note") ?? "",
  });
  if (!parsed.success) {
    return fail(400, {
      error: "invalid_input",
      field_errors: fieldErrorsFrom(parsed.error.issues),
    });
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
  // The declared type has to agree with what the file actually is; a mismatch
  // means the label was wrong or deliberately misleading, and either way we do
  // not store it or spend an analysis on it.
  const sniffed = await sniffMime(cv);
  if (sniffed === null || sniffed !== cv.type) {
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

  return {
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    cover_note: parsed.data.cover_note,
    applicant_user_id: null,
    cv: { kind: "upload", file: cv, mime: sniffed },
  };
}

// ---- profile: who is applying ---------------------------------------------
async function seekerUser(req: Request, admin: SupabaseClient): Promise<SeekerUser | Response> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return fail(401, { error: "auth_required" });

  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user ?? null;
  if (!user) {
    // No status, or a 5xx, is the auth service failing — not the caller's
    // credentials. Sending them to sign in again would not help.
    if (error && (!error.status || error.status >= 500)) {
      console.error("auth lookup failed:", error.status ?? "no status");
      return fail(500, { error: "server_error" });
    }
    return fail(401, { error: "auth_required" });
  }
  // D26: email verification precedes any paid analysis, and applying
  // starts one.
  if (!user.email_confirmed_at || !user.email) {
    return fail(403, { error: "email_unverified" });
  }
  return { id: user.id, email: user.email.toLowerCase() };
}

// ---- profile: everything comes from the stored profile -------------------
// Returns the applicant plus any field errors of its own (cv_version_id,
// consent), so they can be reported together with the screening answers in
// one response instead of one at a time.
async function profileApplicant(
  admin: SupabaseClient,
  form: FormData,
  user: SeekerUser
): Promise<{ applicant: Applicant | null; errors: Record<string, string> } | Response> {
  const { data: profile, error: profileError } = await admin
    .schema("talent")
    .from("profiles")
    .select("id, full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("profile lookup failed:", profileError.code ?? profileError.message);
    return fail(500, { error: "server_error" });
  }
  if (!profile) return fail(409, { error: "profile_incomplete" });

  // The same rules a guest's typed values must meet. A profile that does
  // not meet them is sent back to be completed, not submitted half-filled.
  const parsed = applicationSchema.safeParse({
    full_name: profile.full_name ?? "",
    email: user.email,
    phone: profile.phone ?? "",
    cover_note: form.get("cover_note") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error.issues);
    const fromProfile = ["full_name", "email", "phone"].some((k) => k in fieldErrors);
    if (fromProfile) return fail(409, { error: "profile_incomplete" });
    return fail(400, { error: "invalid_input", field_errors: fieldErrors });
  }

  const errors: Record<string, string> = {};

  // The CV: the version named on the form, else the newest analysed one.
  // Either way it must be this profile's own and fully analysed — the
  // profile_id filter is what stops one seeker from applying with another's
  // file by guessing a version id.
  const requested = String(form.get("cv_version_id") ?? "").trim();
  let version: CvVersion | null = null;
  if (requested.length > 0 && !UUID_RE.test(requested)) {
    errors.cv_version_id = "invalid";
  } else {
    let query = admin
      .schema("talent")
      .from("cv_versions")
      .select("id, path, mime, analysis_status")
      .eq("profile_id", profile.id);
    query = requested.length > 0
      ? query.eq("id", requested)
      : query.eq("analysis_status", "done").order("created_at", { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error("cv version lookup failed:", error.code ?? error.message);
      return fail(500, { error: "server_error" });
    }
    version = data as CvVersion | null;
    if (!version || version.analysis_status !== "done" || !(version.mime in CV_MIME_TYPES)) {
      errors.cv_version_id = "invalid";
      version = null;
    }
  }

  // Per application, every time. Never stored as a standing permission: the
  // seeker agrees to share with THIS company for THIS job.
  if (form.get("consent") !== "on") errors.consent = "required";

  return {
    applicant: version
      ? {
          full_name: parsed.data.full_name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          cover_note: parsed.data.cover_note,
          applicant_user_id: user.id,
          cv: { kind: "copy", path: version.path, mime: version.mime as CvMime },
        }
      : null,
    errors,
  };
}

// ---- the company's copy of the CV, in the tenant's own folder -----------
async function storeCv(admin: SupabaseClient, cvPath: string, source: CvSource): Promise<boolean> {
  let body: Blob;
  if (source.kind === "upload") {
    body = source.file;
  } else {
    const { data, error } = await admin.storage.from("talent-cvs").download(source.path);
    if (error || !data) {
      console.error("CV copy: download failed:", error?.message ?? "no data");
      return false;
    }
    body = data;
  }
  const { error: uploadError } = await admin.storage
    .from("cvs")
    .upload(cvPath, body, { contentType: source.mime, upsert: false });
  if (uploadError) {
    console.error("CV upload failed:", uploadError.message);
    return false;
  }
  return true;
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

  const profileMode = form.get("mode") === "profile";

  // Profile mode answers "who are you" before anything else.
  let user: SeekerUser | null = null;
  if (profileMode) {
    const resolved = await seekerUser(req, admin);
    if (resolved instanceof Response) return resolved;
    user = resolved;
  }

  // ---- 1. resolve the job, and with it the tenant --------------------
  const job = await resolveJob(admin, jobId);
  if (job instanceof Response) return job;

  // #12: optional hiring-source attribution. Sanitized here too — the
  // server action already does, but this function is the write boundary
  // and never trusts the caller for that. Anything that doesn't match
  // becomes null rather than an error: a malformed source is not a reason
  // to refuse an application.
  const rawSource = String(form.get("source") ?? "").trim().toLowerCase();
  const source = /^[a-z0-9_-]{1,40}$/.test(rawSource) ? rawSource : null;

  // ---- 2. the applicant: typed in (guest) or stored (profile) ---------
  // ---- 3. screening answers -------------------------------------------
  let applicant: Applicant;
  let answers: ScreeningAnswerType[];
  if (user) {
    const resolved = await profileApplicant(admin, form, user);
    if (resolved instanceof Response) return resolved;
    const screening = collectAnswers(job, form);
    const errors = { ...resolved.errors, ...screening.errors };
    if (Object.keys(errors).length > 0 || !resolved.applicant) {
      return fail(400, { error: "invalid_input", field_errors: errors });
    }
    applicant = resolved.applicant;
    answers = screening.answers;
  } else {
    const resolved = await guestApplicant(form);
    if (resolved instanceof Response) return resolved;
    const screening = collectAnswers(job, form);
    if (Object.keys(screening.errors).length > 0) {
      return fail(400, { error: "invalid_input", field_errors: screening.errors });
    }
    applicant = resolved;
    answers = screening.answers;
  }

  const validatedAnswers = ScreeningAnswers.safeParse(answers);
  if (!validatedAnswers.success) return fail(400, { error: "invalid_input" });

  // ---- 4. abuse controls ---------------------------------------------
  // The captcha is for anonymous callers. A profile submission carries a
  // verified account's token, which is a stronger signal than a widget;
  // the per-IP and per-email limits below still apply to it.
  if (!user && !(await turnstileOk(form.get("cf-turnstile-response") as string | null))) {
    return fail(403, { error: "captcha_failed" });
  }

  // A profile submission is keyed on its verified account instead of an IP:
  // it arrives from the Next.js server, whose egress address every seeker
  // shares, so an IP limit would throttle all of them together. The
  // per-email limit still applies.
  const salt = Deno.env.get("THROTTLE_SALT") ?? "srp";
  const [ipHash, emailHash] = await Promise.all([
    sha256Hex(user ? `${salt}:account:${user.id}` : `${salt}:${clientIp(req)}`),
    sha256Hex(`${salt}:${applicant.email}`),
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
  // the authority, for the race. A seeker who once applied to this job as a
  // guest with the same address is a duplicate too: it is the same person.
  const { data: existing } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("email", applicant.email)
    .maybeSingle();
  if (existing) {
    return fail(409, {
      error: "duplicate",
      field_errors: { email: "duplicate" },
    });
  }

  // ---- 6. the CV, into the tenant's own folder -------------------------
  const applicationId = crypto.randomUUID();
  const extension = CV_MIME_TYPES[applicant.cv.mime];
  const cvPath = `${job.org_id}/${applicationId}.${extension}`;

  if (!(await storeCv(admin, cvPath, applicant.cv))) {
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
      full_name: applicant.full_name,
      email: applicant.email,
      phone: applicant.phone,
      cv_path: cvPath,
      cv_mime: applicant.cv.mime,
      cover_note: applicant.cover_note,
      screening_answers: validatedAnswers.data,
      // Only sent when there is one: this function deploys on merge, its
      // migration (0023) does not, and PostgREST rejects an insert naming a
      // column it has never seen — so an unconditional `source: null` took
      // every application down until the migration ran.
      ...(source ? { source } : {}),
      // Guests leave both at their defaults (null, false).
      ...(applicant.applicant_user_id
        ? { applicant_user_id: applicant.applicant_user_id, via_account: true }
        : {}),
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
