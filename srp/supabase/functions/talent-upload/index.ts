// talent-upload — a signed-in seeker's CV, stored as a new version.
//
// The accountless journey this function used to serve (CV + email, then a
// verification link) is superseded by seeker accounts (D26). The cost rule it
// was built around stays exactly where it was: nothing is spent until an
// email address has proved it exists. The proof is now the account's own
// confirmed address instead of a link we mailed, so the analysis can start
// the moment the file lands — while the person fills in their contact
// details — rather than after a round trip through their inbox.
//
// Contract: POST multipart/form-data with `cv` (File), and
//   Authorization: Bearer <the user's access token>
// forwarded by the Next.js server action. The anon key is not enough: there
// is no anonymous path any more.
//
// Every upload becomes a row in talent.cv_versions, because an application
// copies one SPECIFIC version (D27) and a person may want to apply with last
// month's CV while this month's is still being read. At most three are kept.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, plus
// THROTTLE_SALT.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newTraceId, makeLogger, isSchemaMissingError } from "../_shared/trace.ts";

// Provided by the Supabase Edge Runtime, absent under plain `deno run`. Lets
// a response go out while work it started keeps running.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const CV_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
} as const;
type CvMime = keyof typeof CV_MIME_TYPES;

const CV_MAX_BYTES = 5 * 1024 * 1024;

// Older versions are pruned beyond this. Three covers "the one I applied with
// last week" without turning the bucket into an archive of everything a
// person ever uploaded.
const KEEP_VERSIONS = 3;

// A version still pending or processing after this long lost its analysis —
// a dropped invocation, or a worker killed at its wall-clock limit. Treating
// it as failed lets the same file be uploaded again; otherwise the "same
// file, same answer" rule below would hand back a version that will never
// finish. Comfortably above the runtime's longest request.
const STALE_ANALYSIS_MS = 10 * 60 * 1000;

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

function randomToken(): string {
  const bytes = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 ? token : null;
}

type Profile = { id: string; onboarding_step: string };

// Missing schema (migrations not applied) gets its own code, as it always
// has here: it is the most likely cause of "every upload fails" right after
// a deploy, and it points at a different fix than a runtime error does.
function dbError(
  log: ReturnType<typeof makeLogger>,
  step: string,
  error: { code?: string; message: string },
  trace: string
): Response {
  if (isSchemaMissingError(error)) {
    log.fail(step, "TALENT SCHEMA MISSING — migrations 0017-0020 not applied", {
      pg_code: error.code,
    });
    return json(500, { error: "not_configured", step }, trace);
  }
  log.fail(step, error.message, { pg_code: error.code });
  return json(500, {
    error: "server_error",
    step,
    detail: error.code ?? error.message.slice(0, 200),
  }, trace);
}

async function findProfile(
  admin: SupabaseClient,
  userId: string
): Promise<{ data: Profile | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .schema("talent")
    .from("profiles")
    .select("id, onboarding_step")
    .eq("user_id", userId)
    .maybeSingle();
  return { data: (data as Profile | null) ?? null, error };
}

Deno.serve(async (req) => {
  const trace = newTraceId();
  const log = makeLogger("talent-upload", trace);
  log.step("received");

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, trace);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // ---- 1. who is uploading -------------------------------------------
  const token = bearerToken(req);
  if (!token) {
    log.fail("auth", "no bearer token");
    return json(401, { error: "auth_required" }, trace);
  }
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user ?? null;
  if (!user) {
    // A 5xx (or no status at all: the request never got an answer) is our
    // outage, not the caller's credentials — say so rather than sending a
    // signed-in person back to the login page.
    if (authError && (!authError.status || authError.status >= 500)) {
      log.fail("auth", authError.message, { status: authError.status });
      return json(500, { error: "server_error", step: "auth" }, trace);
    }
    log.fail("auth", "token did not resolve to a user");
    return json(401, { error: "auth_required" }, trace);
  }

  // ---- 2. D26: a confirmed address before anything is spent -----------
  if (!user.email_confirmed_at || !user.email) {
    log.fail("auth", "email not confirmed");
    return json(403, { error: "email_unverified" }, trace);
  }
  const email = user.email.toLowerCase();

  // ---- 3. the file -----------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    log.fail("parse_form", err instanceof Error ? err.message : String(err));
    return json(400, { error: "invalid_input" }, trace);
  }

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
  const mime = sniffed;
  log.step("input_valid", { cv_bytes: cv.size });

  // ---- 4. throttle -----------------------------------------------------
  // Keyed on the account id rather than the address: an address can be
  // changed, the id cannot, so this is the key a person cannot rotate to
  // earn a fresh allowance. Same ledger and limits as before (3 a day per
  // key, 10 per IP).
  const salt = Deno.env.get("THROTTLE_SALT") ?? "";
  const [ipHash, accountHash] = await Promise.all([
    sha256Hex(salt + clientIp(req)),
    sha256Hex(salt + user.id),
  ]);

  const { data: throttle, error: throttleError } = await admin.rpc(
    "talent_record_upload_attempt",
    { p_ip_hash: ipHash, p_email_hash: accountHash }
  );
  if (throttleError) return dbError(log, "throttle_check", throttleError, trace);
  if (throttle) {
    log.step("rate_limited");
    return json(429, { error: "rate_limited" }, trace);
  }

  // ---- 5. the profile: found by account, created on first upload -------
  const found = await findProfile(admin, user.id);
  if (found.error) return dbError(log, "profile_lookup", found.error, trace);
  let profile = found.data;

  if (!profile) {
    const { data: created, error: insertError } = await admin
      .schema("talent")
      .from("profiles")
      .insert({
        user_id: user.id,
        email,
        // The account's confirmed address is the verification.
        email_verified_at: new Date().toISOString(),
        public_token: randomToken(),
        status: "draft",
        onboarding_step: "cv",
      })
      .select("id, onboarding_step")
      .single();
    if (insertError) {
      // Two uploads racing for the same new account: the other one created
      // the row first. Use it.
      if (insertError.code !== "23505") {
        return dbError(log, "profile_create", insertError, trace);
      }
      const retry = await findProfile(admin, user.id);
      if (retry.error) return dbError(log, "profile_lookup", retry.error, trace);
      if (!retry.data) {
        return dbError(log, "profile_create", insertError, trace);
      }
      profile = retry.data;
    } else {
      profile = created as Profile;
    }
    log.step("profile_created", { profile_id: profile.id });
  }
  const currentProfile: Profile = profile;

  // ---- 6. same file, same answer --------------------------------------
  const bytes = await cv.arrayBuffer();
  const cvHash = await sha256Hex(bytes);

  const { data: newest, error: newestError } = await admin
    .schema("talent")
    .from("cv_versions")
    .select("id, sha256, analysis_status, created_at")
    .eq("profile_id", currentProfile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newestError) return dbError(log, "version_lookup", newestError, trace);

  if (newest && newest.sha256 === cvHash) {
    const inFlight =
      newest.analysis_status === "pending" ||
      newest.analysis_status === "processing";
    const stale =
      inFlight &&
      Date.now() - new Date(newest.created_at).getTime() > STALE_ANALYSIS_MS;
    if (newest.analysis_status !== "failed" && !stale) {
      // Re-analysing would spend a second call for an answer we already
      // have, or are about to have.
      if (currentProfile.onboarding_step === "cv") {
        // Only reachable if an earlier upload stored the version but not
        // the step — move the person on rather than leaving them stuck.
        await admin
          .schema("talent")
          .from("profiles")
          .update({ onboarding_step: "contact", updated_at: new Date().toISOString() })
          .eq("id", currentProfile.id);
      }
      log.step("unchanged", { version_id: newest.id });
      return json(200, { ok: true, version_id: newest.id, unchanged: true }, trace);
    }
  }

  // ---- 7. store the new version ---------------------------------------
  const versionId = crypto.randomUUID();
  const cvPath = `${currentProfile.id}/${versionId}.${CV_MIME_TYPES[mime]}`;

  const { error: uploadError } = await admin.storage
    .from("talent-cvs")
    .upload(cvPath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    log.fail("cv_upload", uploadError.message);
    // A missing bucket surfaces here (StorageApiError, "Bucket not found")
    // — the same migrations-not-applied cause as the schema checks, since
    // 0017 creates talent-cvs. Storage errors carry no Postgres code, so
    // this is caught by message text.
    const bucketMissing = uploadError.message.toLowerCase().includes("bucket not found");
    return json(500, {
      error: bucketMissing ? "not_configured" : "server_error",
      step: "cv_upload",
      detail: uploadError.message.slice(0, 200),
    }, trace);
  }
  log.step("cv_stored", { version_id: versionId });

  const removeStoredFile = async () => {
    const { error } = await admin.storage.from("talent-cvs").remove([cvPath]);
    if (error) log.fail("cleanup_file", error.message, { version_id: versionId });
  };

  const { error: versionError } = await admin
    .schema("talent")
    .from("cv_versions")
    .insert({
      id: versionId,
      profile_id: currentProfile.id,
      path: cvPath,
      sha256: cvHash,
      mime,
      size_bytes: cv.size,
      analysis_status: "pending",
    });
  if (versionError) {
    await removeStoredFile();
    return dbError(log, "version_insert", versionError, trace);
  }

  const { error: profileError } = await admin
    .schema("talent")
    .from("profiles")
    .update({
      cv_path: cvPath,
      cv_sha256: cvHash,
      analysis_status: "pending",
      analysis_error: null,
      ...(currentProfile.onboarding_step === "cv" ? { onboarding_step: "contact" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", currentProfile.id);
  if (profileError) {
    // Undo the version too. Left behind, it would be the newest version
    // with this file's hash and a pending analysis nobody started — and the
    // next upload of the same file would be answered "unchanged".
    const { error: undoError } = await admin
      .schema("talent")
      .from("cv_versions")
      .delete()
      .eq("id", versionId);
    if (undoError) log.fail("cleanup_version", undoError.message, { version_id: versionId });
    await removeStoredFile();
    return dbError(log, "profile_update", profileError, trace);
  }
  log.step("version_saved", { version_id: versionId });

  // ---- 8. prune beyond the newest three -------------------------------
  // Files first, rows second: a row whose file is already gone is removed
  // again on the next upload, whereas a file whose row is gone is a CV
  // nobody can find to delete — not even the seeker deleting their account.
  const { data: versions, error: listError } = await admin
    .schema("talent")
    .from("cv_versions")
    .select("id, path")
    .eq("profile_id", currentProfile.id)
    .order("created_at", { ascending: false });
  if (listError) {
    // Not fatal: the upload succeeded and the next one prunes again.
    log.fail("prune_list", listError.message, { pg_code: listError.code });
  } else {
    const excess = (versions ?? []).slice(KEEP_VERSIONS) as { id: string; path: string }[];
    if (excess.length > 0) {
      const { error: removeError } = await admin.storage
        .from("talent-cvs")
        .remove(excess.map((v) => v.path));
      if (removeError) {
        log.fail("prune_files", removeError.message, { count: excess.length });
      } else {
        const { error: deleteError } = await admin
          .schema("talent")
          .from("cv_versions")
          .delete()
          .in("id", excess.map((v) => v.id));
        if (deleteError) {
          log.fail("prune_rows", deleteError.message, { pg_code: deleteError.code });
        } else {
          log.step("pruned", { count: excess.length });
        }
      }
    }
  }

  // ---- 9. start the analysis without making the person wait ------------
  // talent-analyze accepts { cv_version_id } only from the service role, so
  // this call is the one route to a paid analysis for an account upload.
  const analysis = (async () => {
    try {
      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/talent-analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ cv_version_id: versionId }),
        }
      );
      if (!res.ok) {
        log.fail("analysis_invoke", `talent-analyze returned HTTP ${res.status}`, {
          version_id: versionId,
        });
      }
    } catch (err) {
      log.fail("analysis_invoke", err instanceof Error ? err.message : String(err), {
        version_id: versionId,
      });
    }
  })();

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
    EdgeRuntime.waitUntil(analysis);
    log.step("analysis_started", { background: true });
  } else {
    await analysis;
    log.step("analysis_started", { background: false });
  }

  log.step("done");
  return json(200, { ok: true, version_id: versionId, unchanged: false }, trace);
});
