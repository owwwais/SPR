// talent-analyze — where the paid model call happens for a talent profile.
//
// The call happens only for an email address that has proved it exists.
// Two invocations, one analysis:
//
//   { cv_version_id }  A seeker account's upload (D26). Accepted ONLY with the
//                      service-role bearer: talent-upload calls it right after
//                      storing the version, and it is the one route to a paid
//                      analysis for an account. The account's confirmed
//                      address is the proof, checked by talent-upload before
//                      the file was even stored.
//   { verify_token }   The superseded accountless journey: the verification
//                      link lands here. Kept unchanged for links already in
//                      flight — the token both authenticates the request and
//                      identifies the profile.
//
// Both run the same download, the same model call and the same parsing; the
// prompt and TALENT_PROMPT_VERSION are shared and untouched.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, plus
// GEMINI_API_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import mammoth from "mammoth";
import { Buffer } from "node:buffer";
import { encodeBase64 as base64Encode } from "jsr:@std/encoding/base64";
import { newTraceId, makeLogger, isSchemaMissingError } from "../_shared/trace.ts";
import {
  TALENT_SYSTEM_PROMPT,
  TALENT_PROMPT_VERSION,
  MODEL,
  TEMPERATURE,
  MAX_CV_TEXT_CHARS,
} from "./prompts.ts";

// A verification link older than this is refused rather than honoured: it is
// the only thing standing between an intercepted email and a published page.
const VERIFY_TTL_HOURS = 24;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    is_cv: { type: Type.BOOLEAN },
    full_name: { type: Type.STRING, nullable: true },
    headline: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
    total_years_experience: { type: Type.NUMBER },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          company: { type: Type.STRING, nullable: true },
          start: { type: Type.STRING, nullable: true },
          end: { type: Type.STRING, nullable: true },
          summary: { type: Type.STRING },
        },
        required: ["title", "summary"],
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          degree: { type: Type.STRING },
          field: { type: Type.STRING, nullable: true },
          institution: { type: Type.STRING, nullable: true },
          year: { type: Type.STRING, nullable: true },
        },
        required: ["degree"],
      },
    },
    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
    skill_labels: { type: Type.ARRAY, items: { type: Type.STRING } },
    focus_areas: { type: Type.ARRAY, items: { type: Type.STRING } },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "is_cv",
    "total_years_experience",
    "experiences",
    "education",
    "languages",
    "skill_labels",
    "focus_areas",
    "strengths",
  ],
};

type ModelResult = {
  is_cv?: boolean;
  full_name?: string | null;
  headline?: string | null;
  city?: string | null;
  total_years_experience?: number;
  experiences?: unknown[];
  education?: unknown[];
  languages?: string[];
  skill_labels?: string[];
  focus_areas?: string[];
  strengths?: string[];
};

type Analysis = {
  result: ModelResult;
  matched: Set<string>;
  unmapped: string[];
};

type Logger = ReturnType<typeof makeLogger>;

// Which stage is in flight, kept outside the try blocks so a catch can say
// which stage was running when it threw, rather than "analysis" covering
// everything from a storage hiccup to a malformed model response under one
// label.
type StepTracker = { current: string };

function json(status: number, body: Record<string, unknown>, trace?: string): Response {
  return new Response(JSON.stringify(trace ? { ...body, request_id: trace } : body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 ? token : null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ْ]/g, "") // Arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function lookupFailed(
  log: Logger,
  step: string,
  error: { code?: string; message: string },
  trace: string
): Response {
  if (isSchemaMissingError(error)) {
    log.fail(step, "TALENT SCHEMA MISSING — migrations not applied", {
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

// The download, the model call and the vocabulary mapping — identical for
// both invocations. Throws on any failure; the caller records it.
async function analyzeCv(
  admin: SupabaseClient,
  path: string,
  isPdf: boolean,
  log: Logger,
  step: StepTracker
): Promise<Analysis> {
  step.current = "cv_download";
  const { data: cvBlob, error: downloadError } = await admin.storage
    .from("talent-cvs")
    .download(path);
  if (downloadError || !cvBlob) {
    throw new Error(`CV download failed: ${downloadError?.message}`);
  }
  log.step("cv_downloaded");
  step.current = "extract_text";

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: "Read the attached CV and produce the profile." }];

  if (isPdf) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: base64Encode(await cvBlob.arrayBuffer()),
      },
    });
  } else {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(await cvBlob.arrayBuffer()),
    });
    parts.push({ text: value.slice(0, MAX_CV_TEXT_CHARS) });
  }

  // Without a key the SDK quietly falls back to Google's default
  // credentials and fails with a message about those instead; say plainly
  // what is missing, under its own step.
  step.current = "configuration";
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  step.current = "model_call";
  const ai = new GoogleGenAI({ apiKey });
  log.step("model_call_start");
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: TALENT_SYSTEM_PROMPT,
      temperature: TEMPERATURE,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  log.step("model_call_done");
  step.current = "parse_model_response";

  const result = JSON.parse(response.text ?? "{}") as ModelResult;

  if (result.is_cv === false) {
    throw new Error("uploaded file does not appear to be a CV");
  }

  step.current = "taxonomy_lookup";
  // Map the model's labels onto the shared vocabulary. Two systems
  // extracting free text would never agree — "تسويق رقمي" here and "Digital
  // Marketing" there are the same skill and would never match.
  const { data: taxonomy } = await admin
    .schema("talent")
    .from("skills")
    .select("id, label_ar, label_en, aliases");

  const lookup = new Map<string, string>();
  for (const skill of taxonomy ?? []) {
    lookup.set(norm(skill.label_ar), skill.id);
    lookup.set(norm(skill.label_en), skill.id);
    for (const alias of skill.aliases ?? []) lookup.set(norm(alias), skill.id);
  }

  const matched = new Set<string>();
  const unmapped: string[] = [];
  for (const raw of result.skill_labels ?? []) {
    const id = lookup.get(norm(raw));
    if (id) matched.add(id);
    else unmapped.push(raw.slice(0, 120));
  }

  return { result, matched, unmapped };
}

// A queue, not a bin: what recurs here is what the vocabulary is missing.
async function recordUnmapped(admin: SupabaseClient, unmapped: string[]) {
  for (const raw of unmapped) {
    await admin.rpc("talent_record_unmapped_skill", { p_label: raw });
  }
}

function throwIf(error: { code?: string; message: string } | null, what: string) {
  if (error) throw new Error(`${what} failed: ${error.code ?? ""} ${error.message}`.trim());
}

// "Current" is the newest version by created_at — the same rule
// talent_my_profile() uses for is_current.
async function newestVersionId(
  admin: SupabaseClient,
  profileId: string
): Promise<string | null> {
  const { data, error } = await admin
    .schema("talent")
    .from("cv_versions")
    .select("id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIf(error, "newest version lookup");
  return (data as { id: string } | null)?.id ?? null;
}

// ---------------------------------------------------------------------------
// { cv_version_id } — a seeker account's upload
// ---------------------------------------------------------------------------
async function analyzeVersion(
  admin: SupabaseClient,
  rawId: unknown,
  log: Logger,
  trace: string
): Promise<Response> {
  if (typeof rawId !== "string" || !UUID_RE.test(rawId)) {
    log.fail("validate_version", "missing or malformed cv_version_id");
    return json(400, { error: "invalid_input" }, trace);
  }

  const { data: version, error: versionError } = await admin
    .schema("talent")
    .from("cv_versions")
    .select("id, profile_id, path, mime, analysis_status")
    .eq("id", rawId)
    .maybeSingle();
  if (versionError) return lookupFailed(log, "version_lookup", versionError, trace);
  if (!version) {
    // Pruned or deleted with the account between upload and now.
    log.fail("version_lookup", "no such cv version");
    return json(404, { error: "not_found" }, trace);
  }
  const versionId = version.id as string;
  const profileId = version.profile_id as string;
  log.step("version_found", {
    version_id: versionId,
    profile_id: profileId,
    status: version.analysis_status,
  });

  if (version.analysis_status === "done") {
    log.step("already_done");
    return json(200, { ok: true, already_done: true }, trace);
  }

  // Claim the version: only one invocation may move it out of pending or
  // failed, so a doubled call never pays for the same file twice.
  const { data: claimed, error: claimError } = await admin
    .schema("talent")
    .from("cv_versions")
    .update({ analysis_status: "processing", analysis_error: null })
    .eq("id", versionId)
    .in("analysis_status", ["pending", "failed"])
    .select("id");
  if (claimError) return lookupFailed(log, "claim", claimError, trace);
  if (!claimed || claimed.length === 0) {
    log.step("in_progress");
    return json(409, { error: "in_progress" }, trace);
  }

  let newestAtStart = false;
  try {
    newestAtStart = (await newestVersionId(admin, profileId)) === versionId;
  } catch (err) {
    log.fail("newest_lookup", err instanceof Error ? err.message : String(err));
  }
  if (newestAtStart) {
    await admin
      .schema("talent")
      .from("profiles")
      .update({ analysis_status: "processing" })
      .eq("id", profileId);
  }
  log.step("processing", { newest: newestAtStart });

  const step: StepTracker = { current: "cv_download" };

  try {
    const { result, matched, unmapped } = await analyzeCv(
      admin,
      version.path as string,
      version.mime === "application/pdf",
      log,
      step
    );

    step.current = "save_profile";
    // Checked again now, not at the start: a newer file may have arrived
    // while the model was reading this one, and an older analysis landing
    // late must not overwrite the profile the newer one will produce.
    const isNewest = (await newestVersionId(admin, profileId)) === versionId;

    if (isNewest) {
      const now = new Date().toISOString();
      const { error: profileError } = await admin
        .schema("talent")
        .from("profiles")
        .update({
          extracted: {
            experiences: result.experiences ?? [],
            education: result.education ?? [],
            languages: result.languages ?? [],
          },
          strengths: result.strengths ?? [],
          focus_areas: result.focus_areas ?? [],
          analysis_status: "done",
          analysis_error: null,
          updated_at: now,
        })
        .eq("id", profileId);
      throwIf(profileError, "profile update");

      // Facts belong to the person and may already have been typed in the
      // contact step while this analysis ran, so the model only fills what
      // is still empty. One conditional update per column — the condition
      // is evaluated by the database, so a value saved a moment ago is
      // never overwritten by a stale read here.
      const facts: Array<[string, string | number]> = [];
      for (const key of ["full_name", "headline", "city"] as const) {
        const value = result[key];
        if (typeof value === "string" && value.trim().length > 0) {
          facts.push([key, value]);
        }
      }
      const years = result.total_years_experience;
      if (typeof years === "number" && Number.isFinite(years) && years >= 0 && years <= 60) {
        facts.push(["years_experience", years]);
      }
      for (const [column, value] of facts) {
        const { error: factError } = await admin
          .schema("talent")
          .from("profiles")
          .update({ [column]: value })
          .eq("id", profileId)
          .is(column, null);
        throwIf(factError, `profile ${column}`);
      }

      step.current = "save_skills";
      // Replaced, not merged: skills from the previous CV are not evidence
      // for this one.
      const { error: clearError } = await admin
        .schema("talent")
        .from("profile_skills")
        .delete()
        .eq("profile_id", profileId);
      throwIf(clearError, "profile skills clear");
      if (matched.size > 0) {
        const { error: skillsError } = await admin
          .schema("talent")
          .from("profile_skills")
          .insert(
            [...matched].map((skill_id) => ({ profile_id: profileId, skill_id }))
          );
        throwIf(skillsError, "profile skills insert");
      }
    }

    step.current = "save_version";
    const { error: doneError } = await admin
      .schema("talent")
      .from("cv_versions")
      .update({
        analysis_status: "done",
        analysis_error: null,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", versionId);
    throwIf(doneError, "version update");

    await recordUnmapped(admin, unmapped);

    log.step("done", {
      matched: matched.size,
      unmapped: unmapped.length,
      newest: isNewest,
      prompt_version: TALENT_PROMPT_VERSION,
    });
    return json(200, {
      ok: true,
      version_id: versionId,
      unmapped: unmapped.length,
    }, trace);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fail("analysis", message.slice(0, 500), { last_step: step.current });
    // Same stored format as the token flow: the trace id and the step ride
    // along, so a person looking at their own failed analysis can quote
    // something searchable back to us without needing log access.
    const stored = `[${trace}/${step.current}] ${message.slice(0, 480)}`;
    const { error: markError } = await admin
      .schema("talent")
      .from("cv_versions")
      .update({ analysis_status: "failed", analysis_error: stored })
      .eq("id", versionId);
    if (markError) log.fail("mark_failed", markError.message, { pg_code: markError.code });

    let isNewest = false;
    try {
      isNewest = (await newestVersionId(admin, profileId)) === versionId;
    } catch (lookupErr) {
      log.fail(
        "newest_lookup",
        lookupErr instanceof Error ? lookupErr.message : String(lookupErr)
      );
    }
    if (isNewest) {
      await admin
        .schema("talent")
        .from("profiles")
        .update({ analysis_status: "failed", analysis_error: stored })
        .eq("id", profileId);
    }
    return json(500, { error: "analysis_failed", step: step.current }, trace);
  }
}

// ---------------------------------------------------------------------------
// { verify_token } — the accountless journey, unchanged
// ---------------------------------------------------------------------------
async function analyzeByToken(
  admin: SupabaseClient,
  token: string | undefined,
  log: Logger,
  trace: string
): Promise<Response> {
  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    log.fail("validate_token", "missing or malformed verify_token");
    return json(400, { error: "invalid_input" }, trace);
  }

  const { data: profile, error: lookupError } = await admin
    .schema("talent")
    .from("profiles")
    .select("id, public_token, cv_path, verify_sent_at, analysis_status")
    .eq("verify_token", token)
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
  if (!profile) {
    log.fail("profile_lookup", "no profile for this verify_token — already used, or never existed");
    return json(404, { error: "expired" }, trace);
  }
  log.step("profile_found", { profile_id: profile.id, status: profile.analysis_status });

  const sentAt = profile.verify_sent_at
    ? new Date(profile.verify_sent_at).getTime()
    : 0;
  if (Date.now() - sentAt > VERIFY_TTL_HOURS * 3600 * 1000) {
    log.fail("ttl_check", "verification link expired", { sent_at: profile.verify_sent_at });
    return json(410, { error: "expired" }, trace);
  }

  // Verification is recorded before the analysis, so a failed model call does
  // not send the person back to the start.
  await admin
    .schema("talent")
    .from("profiles")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", profile.id);
  log.step("email_verified");

  // Already analysed — the same file re-uploaded, or the link clicked twice.
  // Return the review token rather than paying again.
  if (profile.analysis_status === "done") {
    log.step("already_done");
    return json(200, { ok: true, public_token: profile.public_token }, trace);
  }

  await admin
    .schema("talent")
    .from("profiles")
    .update({ analysis_status: "processing" })
    .eq("id", profile.id);
  log.step("processing");

  const step: StepTracker = { current: "cv_download" };

  try {
    const { result, matched, unmapped } = await analyzeCv(
      admin,
      profile.cv_path!,
      profile.cv_path!.endsWith(".pdf"),
      log,
      step
    );

    step.current = "save_profile";
    await admin
      .schema("talent")
      .from("profiles")
      .update({
        full_name: result.full_name ?? null,
        headline: result.headline ?? null,
        city: result.city ?? null,
        years_experience: result.total_years_experience ?? null,
        extracted: {
          experiences: result.experiences ?? [],
          education: result.education ?? [],
          languages: result.languages ?? [],
        },
        strengths: result.strengths ?? [],
        focus_areas: result.focus_areas ?? [],
        analysis_status: "done",
        analysis_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (matched.size > 0) {
      await admin
        .schema("talent")
        .from("profile_skills")
        .upsert(
          [...matched].map((skill_id) => ({
            profile_id: profile.id,
            skill_id,
          })),
          { onConflict: "profile_id,skill_id" }
        );
    }

    await recordUnmapped(admin, unmapped);

    log.step("done", { matched: matched.size, unmapped: unmapped.length });
    return json(200, {
      ok: true,
      public_token: profile.public_token,
      unmapped: unmapped.length,
    }, trace);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fail("analysis", message.slice(0, 500), { last_step: step.current });
    // The trace id AND the step ride along in the stored error too (a short
    // prefix), so a person looking at their own failed page in
    // talent_review_profile can quote something searchable back to us
    // without needing log access themselves.
    await admin
      .schema("talent")
      .from("profiles")
      .update({
        analysis_status: "failed",
        analysis_error: `[${trace}/${step.current}] ${message.slice(0, 480)}`,
      })
      .eq("id", profile.id);
    return json(500, { error: "analysis_failed", step: step.current }, trace);
  }
}

Deno.serve(async (req) => {
  const trace = newTraceId();
  const log = makeLogger("talent-analyze", trace);
  log.step("received");

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, trace);

  let payload: { verify_token?: string; cv_version_id?: unknown };
  try {
    payload = await req.json();
  } catch (err) {
    log.fail("parse_body", err instanceof Error ? err.message : String(err));
    return json(400, { error: "invalid_input" }, trace);
  }
  if (payload === null || typeof payload !== "object") {
    log.fail("parse_body", "body is not an object");
    return json(400, { error: "invalid_input" }, trace);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  if (payload.cv_version_id !== undefined) {
    // Only our own functions may spend an analysis on an account upload.
    // A user's JWT, the anon key or a guessed version id gets nothing.
    if (!serviceKey || bearerToken(req) !== serviceKey) {
      log.fail("auth", "cv_version_id mode requires the service role");
      return json(401, { error: "unauthorized" }, trace);
    }
    return await analyzeVersion(admin, payload.cv_version_id, log, trace);
  }

  return await analyzeByToken(admin, payload.verify_token, log, trace);
});
