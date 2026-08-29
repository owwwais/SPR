// talent-upload — step one of the three-step journey.
//
// Takes a CV and an email, stores both, and sends a verification link. It
// does NOT analyse anything: the model call happens after the link is
// clicked, in talent-analyze.
//
// That ordering is the whole cost control. Every upload is a paid call made
// by someone we do not know — ten thousand of them overnight is roughly $169
// — so nothing is spent until an address has proved it exists. The user waits
// for the analysis inside a step they were taking anyway, so the journey is
// still three steps and not four.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, plus
// TURNSTILE_SECRET_KEY and THROTTLE_SALT.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { newTraceId, makeLogger, isSchemaMissingError } from "../_shared/trace.ts";

const CV_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
} as const;
type CvMime = keyof typeof CV_MIME_TYPES;

const CV_MAX_BYTES = 5 * 1024 * 1024;

const uploadSchema = z.object({
  email: z.email().max(200).transform((v) => v.toLowerCase()),
});

function json(status: number, body: Record<string, unknown>, trace?: string): Response {
  return new Response(JSON.stringify(trace ? { ...body, request_id: trace } : body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Rightmost hop, never the leftmost: proxies append, so the first entry is
// whatever the caller wrote. Same reasoning as submit-application.
function clientIp(req: Request): string {
  const direct =
    req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1]! : "unknown";
}

// Leading bytes, not the browser's claim about them.
async function sniffMime(file: File): Promise<CvMime | null> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head.length < 4) return null;
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)
    return "application/pdf";
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

// Unlike the recruitment form, this one fails CLOSED without a captcha:
// nothing is lost by refusing a bot here, whereas refusing a job applicant
// costs a real person a real opportunity.
//
// Returns a reason alongside ok/not-ok because "rejected" has three very
// different causes that all looked identical to the caller before this:
//   not_configured   TURNSTILE_SECRET_KEY unset on this function -> passes
//   no_token          the browser sent nothing. Almost always means
//                      NEXT_PUBLIC_TURNSTILE_SITE_KEY was never set on
//                      Vercel (or set but not redeployed), so the widget in
//                      components/jobs/turnstile.tsx rendered nothing and no
//                      token was ever produced.
//   verify_failed     Cloudflare rejected the token, or the network call to
//                      siteverify itself failed.
async function turnstileCheck(
  token: string | null
): Promise<{ ok: boolean; reason: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return { ok: true, reason: "not_configured" };
  if (!token) return { ok: false, reason: "no_token" };
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      }
    );
    const body = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (body.success === true) return { ok: true, reason: "verified" };
    return {
      ok: false,
      reason: `verify_failed:${(body["error-codes"] ?? []).join(",") || "rejected"}`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `verify_failed:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const trace = newTraceId();
  const log = makeLogger("talent-upload", trace);
  log.step("received");

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, trace);

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    log.fail("parse_form", err instanceof Error ? err.message : String(err));
    return json(400, { error: "invalid_input" }, trace);
  }

  const captchaToken = String(form.get("cf-turnstile-response") ?? "") || null;
  const turnstile = await turnstileCheck(captchaToken);
  log.step("turnstile", { ok: turnstile.ok, reason: turnstile.reason });
  if (!turnstile.ok) {
    // The reason (no_token vs verify_failed vs a Cloudflare error code) is
    // deliberately kept out of the client response — telling a bot which
    // check it failed helps it adapt. It is one log line away for a human:
    // search this trace id in the function's logs.
    return json(400, { error: "captcha_failed" }, trace);
  }

  const parsed = uploadSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    log.fail("validate_email", "invalid email");
    return json(400, { error: "invalid_input", field: "email" }, trace);
  }
  const email = parsed.data.email;

  const cv = form.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    log.fail("validate_cv", "no file or empty file");
    return json(400, { error: "invalid_input", field: "cv" }, trace);
  }
  if (cv.size > CV_MAX_BYTES) {
    log.fail("validate_cv", "over size limit", { bytes: cv.size });
    return json(400, { error: "invalid_input", field: "cv_size" }, trace);
  }
  const sniffed = await sniffMime(cv);
  if (sniffed === null || !(cv.type in CV_MIME_TYPES) || sniffed !== cv.type) {
    log.fail("validate_cv", "declared type does not match file contents", {
      declared: cv.type,
      sniffed,
    });
    return json(400, { error: "invalid_input", field: "cv_type" }, trace);
  }
  log.step("input_valid", { email_domain: email.split("@")[1], cv_bytes: cv.size });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const salt = Deno.env.get("THROTTLE_SALT") ?? "";
  const [ipHash, emailHash] = await Promise.all([
    sha256Hex(salt + clientIp(req)),
    sha256Hex(salt + email),
  ]);

  const { data: throttle, error: throttleError } = await admin.rpc(
    "talent_record_upload_attempt",
    { p_ip_hash: ipHash, p_email_hash: emailHash }
  );
  if (throttleError) {
    if (isSchemaMissingError(throttleError)) {
      // The function this call needs (talent.record_upload_attempt via the
      // public.talent_record_upload_attempt wrapper) does not exist. This is
      // not a runtime failure — migrations 0012 through 0017 have not been
      // applied to this database yet, so nothing past this point can work
      // either. Loud on purpose: this is the single most likely cause of
      // "every upload is rejected" right after the functions are first
      // deployed.
      log.fail("throttle_check", "TALENT SCHEMA MISSING — migrations 0012-0017 not applied", {
        pg_code: throttleError.code,
      });
      return json(500, { error: "not_configured", step: "throttle_check" }, trace);
    }
    log.fail("throttle_check", throttleError.message, { pg_code: throttleError.code });
    return json(500, {
      error: "server_error",
      step: "throttle_check",
      detail: throttleError.code ?? throttleError.message.slice(0, 200),
    }, trace);
  }
  if (throttle) {
    log.step("rate_limited");
    return json(429, { error: "rate_limited" }, trace);
  }

  const bytes = await cv.arrayBuffer();
  const cvHash = await sha256Hex(bytes);

  // Same file, same result. Re-analysing it would spend a second call for an
  // answer we already have, and would tell the person nothing new.
  const { data: existing, error: lookupError } = await admin
    .schema("talent")
    .from("profiles")
    .select("id, public_token, cv_sha256, analysis_status")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    if (isSchemaMissingError(lookupError)) {
      log.fail("profile_lookup", "TALENT SCHEMA MISSING — migrations 0012-0017 not applied", {
        pg_code: lookupError.code,
      });
      return json(500, { error: "not_configured", step: "profile_lookup" }, trace);
    }
    log.fail("profile_lookup", lookupError.message, { pg_code: lookupError.code });
    return json(500, {
      error: "server_error",
      step: "profile_lookup",
      detail: lookupError.code ?? lookupError.message.slice(0, 200),
    }, trace);
  }

  const verifyToken = randomToken();
  const publicToken = existing?.public_token ?? randomToken();
  const profileId = existing?.id ?? crypto.randomUUID();
  const extension = CV_MIME_TYPES[cv.type as CvMime];
  const cvPath = `${profileId}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("talent-cvs")
    .upload(cvPath, cv, { contentType: cv.type, upsert: true });
  if (uploadError) {
    log.fail("cv_upload", uploadError.message);
    // A missing bucket surfaces here too (StorageApiError, "Bucket not
    // found") — the same migrations-not-applied cause as the schema checks
    // above, since 0017 is what creates the talent-cvs bucket. Storage
    // errors do not carry a Postgres/PostgREST code, so this is caught by
    // message text rather than isSchemaMissingError.
    const bucketMissing = uploadError.message.toLowerCase().includes("bucket not found");
    return json(500, {
      error: bucketMissing ? "not_configured" : "server_error",
      step: "cv_upload",
      detail: uploadError.message.slice(0, 200),
    }, trace);
  }
  log.step("cv_stored", { path: cvPath });

  const unchanged = existing?.cv_sha256 === cvHash;

  const { error: upsertError } = await admin
    .schema("talent")
    .from("profiles")
    .upsert(
      {
        id: profileId,
        email,
        public_token: publicToken,
        cv_path: cvPath,
        cv_sha256: cvHash,
        verify_token: verifyToken,
        verify_sent_at: new Date().toISOString(),
        // An unchanged file keeps whatever analysis it already had.
        analysis_status: unchanged ? existing!.analysis_status : "pending",
      },
      { onConflict: "id" }
    );
  if (upsertError) {
    log.fail("profile_upsert", upsertError.message, { pg_code: upsertError.code });
    return json(500, {
      error: "server_error",
      step: "profile_upsert",
      detail: upsertError.code ?? upsertError.message.slice(0, 200),
    }, trace);
  }
  log.step("profile_saved", { unchanged });

  // The link carries the verify token, not the profile id: clicking it is
  // what proves the address, and the public token must not travel until the
  // person has decided to publish.
  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  if (!siteUrl) {
    // Not fatal to the upload — the row and file are saved — but the link in
    // the email the person is about to receive will be broken
    // (https:///talent/verify/…), so flag it loudly rather than silently.
    log.fail("site_url", "SITE_URL is not set — the verification link will be malformed");
  }
  const verifyUrl = `${siteUrl}/talent/verify/${verifyToken}`;

  const { error: mailError } = await admin.functions.invoke("send-email", {
    body: { kind: "talent_verify", email, url: verifyUrl },
  });
  if (mailError) {
    // The profile exists and the link is valid; only delivery failed. Say so
    // rather than pretending the upload did not happen.
    log.fail("send_email", mailError.message);
    return json(502, { error: "email_failed" }, trace);
  }

  log.step("done");
  return json(200, { ok: true }, trace);
});
