// analyze-application — the ONLY place Gemini is called (CLAUDE.md D3).
// Pipeline per §4.2: processing -> download CV -> single Gemini call ->
// zod-validate -> upsert ai_evaluations -> done. Any error: increment
// analysis_attempts, set failed, log the error message only (never CV
// content, never applicant PII).
//
// Secrets required: GEMINI_API_KEY (plus platform-injected SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY).
//
// Invocation contract: { application_id, force? }.
//   - status 'pending'  -> anyone may trigger (post-submit fire-and-forget).
//   - anything else     -> requires force + a staff JWT (dashboard re-run)
//                          or the service-role key (pg_cron retry, M7).
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import mammoth from "mammoth";
import { Evaluation, computeFitScore } from "../../../lib/validations/evaluation.ts";
import {
  buildUserMessage,
  MAX_CV_TEXT_CHARS,
  MODEL,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  TEMPERATURE,
} from "./prompts.ts";
import { RESPONSE_SCHEMA } from "./schema.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

async function isStaffCaller(req: Request): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data } = await asCaller.rpc("is_staff");
    return data === true;
  } catch {
    return false;
  }
}

function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let payload: { application_id?: string; force?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const applicationId = payload.application_id;
  if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
    return json(400, { error: "invalid application_id" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: application, error: appError } = await admin
    .from("applications")
    .select(
      "id, cv_path, cv_mime, cover_note, analysis_status, analysis_attempts, jobs(title, type, location, min_years_experience, skills, requirements, description)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    console.error("application lookup failed:", appError.message);
    return json(500, { error: "lookup failed" });
  }
  if (!application) return json(404, { error: "application not found" });

  if (application.analysis_status !== "pending") {
    // done/failed/processing: only staff (dashboard re-run) or the service
    // role (housekeeping cron) may proceed.
    if (!payload.force || !(await isStaffCaller(req))) {
      return json(
        application.analysis_status === "processing" ? 409 : 403,
        { error: "re-run requires a staff caller with force" }
      );
    }
    // NOTE: force overrides 'processing' too, so a run stuck mid-flight
    // (crashed instance) can be recovered by housekeeping; a genuine
    // concurrent duplicate only costs one extra call — the upsert is
    // idempotent per application.
  }

  await admin
    .from("applications")
    .update({ analysis_status: "processing" })
    .eq("id", applicationId);

  try {
    const { data: cvBlob, error: downloadError } = await admin.storage
      .from("cvs")
      .download(application.cv_path);
    if (downloadError || !cvBlob) {
      throw new Error(`CV download failed: ${downloadError?.message}`);
    }

    const job = application.jobs as unknown as {
      title: string;
      type: string;
      location: string | null;
      min_years_experience: number | null;
      skills: string[];
      requirements: string;
      description: string;
    };

    // Exactly ONE Gemini call per analysis (§8 cost guard).
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (application.cv_mime === "application/pdf") {
      parts.push({
        text: buildUserMessage(job, application.cover_note, "pdf"),
      });
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: base64Encode(await cvBlob.arrayBuffer()),
        },
      });
    } else if (application.cv_mime === DOCX_MIME) {
      // Node build of mammoth (what Deno's npm compat loads) accepts
      // { buffer } only — { arrayBuffer } is a browser-build option.
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(await cvBlob.arrayBuffer()),
      });
      const truncated = value.length > MAX_CV_TEXT_CHARS;
      const cvText = truncated ? value.slice(0, MAX_CV_TEXT_CHARS) : value;
      parts.push({
        text: buildUserMessage(job, application.cover_note, "text", cvText, truncated),
      });
    } else {
      throw new Error(`unsupported cv_mime: ${application.cv_mime}`);
    }

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });
    const startedAt = Date.now();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // Extraction + rubric scoring needs little deliberation; the model
        // default (medium) adds tens of seconds of thinking latency.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    // Duration only — never content (D8).
    console.log(
      `gemini call: ${Date.now() - startedAt}ms, model=${MODEL}, cv=${application.cv_mime === "application/pdf" ? "pdf" : "docx"}`
    );

    const rawText = response.text;
    if (!rawText) throw new Error("empty model response");

    // D5: validate before persisting; malformed output is never stored.
    const evaluation = Evaluation.parse(JSON.parse(rawText));

    // §6: the breakdown sum is authoritative over the model's own total.
    evaluation.fit_score = computeFitScore(evaluation.score_breakdown);

    const { error: upsertError } = await admin.from("ai_evaluations").upsert(
      {
        application_id: applicationId,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        extracted: evaluation.extracted,
        fit_score: evaluation.fit_score,
        score_breakdown: evaluation.score_breakdown,
        // No dedicated column in §4 — confidence rides in justification jsonb.
        justification: {
          ...evaluation.justification,
          confidence: evaluation.confidence,
        },
        interview_questions: evaluation.interview_questions,
      },
      { onConflict: "application_id" }
    );
    if (upsertError) {
      throw new Error(`evaluation upsert failed: ${upsertError.message}`);
    }

    await admin
      .from("applications")
      .update({ analysis_status: "done" })
      .eq("id", applicationId);

    return json(200, { ok: true, fit_score: evaluation.fit_score });
  } catch (err) {
    // Error message only — never CV content or model output (D8, §8 privacy).
    const message = err instanceof Error ? err.message : String(err);
    console.error("analysis failed:", message.slice(0, 500));
    await admin
      .from("applications")
      .update({
        analysis_status: "failed",
        analysis_attempts: application.analysis_attempts + 1,
      })
      .eq("id", applicationId);
    return json(500, { error: "analysis failed" });
  }
});
