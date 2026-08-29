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

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
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
    console.error(
      "turnstile unavailable:",
      err instanceof Error ? err.message : err
    );
    return false;
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
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "invalid_input" });
  }

  if (!(await turnstileOk(String(form.get("cf-turnstile-response") ?? "")))) {
    return json(400, { error: "captcha_failed" });
  }

  const parsed = uploadSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    return json(400, { error: "invalid_input", field: "email" });
  }
  const email = parsed.data.email;

  const cv = form.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    return json(400, { error: "invalid_input", field: "cv" });
  }
  if (cv.size > CV_MAX_BYTES) {
    return json(400, { error: "invalid_input", field: "cv_size" });
  }
  const sniffed = await sniffMime(cv);
  if (sniffed === null || !(cv.type in CV_MIME_TYPES) || sniffed !== cv.type) {
    return json(400, { error: "invalid_input", field: "cv_type" });
  }

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
    console.error("throttle failed:", throttleError.message);
    return json(500, { error: "server_error" });
  }
  if (throttle) return json(429, { error: "rate_limited" });

  const bytes = await cv.arrayBuffer();
  const cvHash = await sha256Hex(bytes);

  // Same file, same result. Re-analysing it would spend a second call for an
  // answer we already have, and would tell the person nothing new.
  const { data: existing } = await admin
    .schema("talent")
    .from("profiles")
    .select("id, public_token, cv_sha256, analysis_status")
    .eq("email", email)
    .maybeSingle();

  const verifyToken = randomToken();
  const publicToken = existing?.public_token ?? randomToken();
  const profileId = existing?.id ?? crypto.randomUUID();
  const extension = CV_MIME_TYPES[cv.type as CvMime];
  const cvPath = `${profileId}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("talent-cvs")
    .upload(cvPath, cv, { contentType: cv.type, upsert: true });
  if (uploadError) {
    console.error("talent CV upload failed:", uploadError.message);
    return json(500, { error: "server_error" });
  }

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
    console.error("profile upsert failed:", upsertError.message);
    return json(500, { error: "server_error" });
  }

  // The link carries the verify token, not the profile id: clicking it is
  // what proves the address, and the public token must not travel until the
  // person has decided to publish.
  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const verifyUrl = `${siteUrl}/talent/verify/${verifyToken}`;

  const { error: mailError } = await admin.functions.invoke("send-email", {
    body: { kind: "talent_verify", email, url: verifyUrl },
  });
  if (mailError) {
    // The profile exists and the link is valid; only delivery failed. Say so
    // rather than pretending the upload did not happen.
    console.error("verification email failed:", mailError.message);
    return json(502, { error: "email_failed" });
  }

  return json(200, { ok: true });
});
