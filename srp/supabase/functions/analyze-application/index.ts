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
import { Evaluation, computeFitScore } from "../_shared/evaluation.ts";
import {
  InterviewQa,
  ScreeningAnswers,
} from "../_shared/screening.ts";
import {
  buildUserMessage,
  MAX_CV_TEXT_CHARS,
  MODEL,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  REDACTION_SYSTEM_PROMPT,
  REDACTION_PROMPT_VERSION,
  TEMPERATURE,
} from "./prompts.ts";
import { RESPONSE_SCHEMA, REDACTION_SCHEMA } from "./schema.ts";

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

// Multi-tenancy turned "is the caller staff?" into "is the caller staff OF
// THIS APPLICATION'S ORGANIZATION?". The old is_staff() check would have let
// any customer's HR user force a re-run — and therefore spend AI quota — on
// another customer's applicant.
async function canManageApplication(
  req: Request,
  applicationId: string
): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data } = await asCaller.rpc("can_manage_application", {
      p_application_id: applicationId,
    });
    return data === true;
  } catch {
    return false;
  }
}

// Q/A evidence blocks for the v1.1 prompt. Malformed stored JSON degrades
// to "no block" rather than failing the analysis.
function formatScreeningAnswers(raw: unknown): string | null {
  const parsed = ScreeningAnswers.safeParse(raw);
  if (!parsed.success || parsed.data.length === 0) return null;
  return parsed.data
    .map(
      (entry) =>
        `Q: ${entry.label}\nA: ${
          Array.isArray(entry.answer) ? entry.answer.join(", ") : entry.answer
        }`
    )
    .join("\n\n");
}

function formatInterviewQa(raw: unknown): string | null {
  const parsed = InterviewQa.safeParse(raw);
  if (!parsed.success) return null;
  const answered = parsed.data.filter((e) => e.answer.trim().length > 0);
  if (answered.length === 0) return null;
  return answered
    .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
    .join("\n\n");
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
      "id, org_id, cv_path, cv_mime, cover_note, analysis_status, analysis_attempts, screening_answers, interview_qa, organizations(blind_screening), jobs(title, type, location, min_years_experience, skills, requirements, description)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    console.error("application lookup failed:", appError.message);
    return json(500, { error: "lookup failed" });
  }
  if (!application) return json(404, { error: "application not found" });

  if (application.analysis_status !== "pending") {
    // done/failed/processing: only staff of this application's own org
    // (dashboard re-run) or the service role (housekeeping cron) may proceed.
    if (!payload.force || !(await canManageApplication(req, applicationId))) {
      return json(
        application.analysis_status === "processing" ? 409 : 403,
        { error: "re-run requires a staff caller with force" }
      );
    }
    // NOTE: force overrides 'processing' too, so a run stuck mid-flight
    // (crashed instance) can be recovered by housekeeping.
  }

  // Claim the row atomically. Reading the status above and writing
  // 'processing' here used to be two statements, so two concurrent
  // invocations both saw 'pending', both proceeded, and both paid for a model
  // call. The RPC moves the row out of 'pending' in the same statement that
  // tests it, so exactly one caller can win.
  //
  // The authorisation decision stays above — this only settles who gets to
  // run, never whether they were allowed to ask.
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_application_for_analysis",
    { p_application_id: applicationId, p_force: payload.force === true }
  );
  if (claimError) {
    console.error("claim failed:", claimError.message);
    return json(500, { error: "claim failed" });
  }
  if (claimed !== true) {
    // Another invocation got there first. Not an error: the analysis this
    // caller wanted is already under way.
    return json(409, { error: "analysis already in progress" });
  }

  // D16: the quota is checked HERE, before anything is spent, and never in
  // the UI — a caller that skips the dashboard must still hit the ceiling.
  // /pricing sells 25, 150 and 750 analyses a month; until now nothing
  // enforced any of them.
  //
  // The unit is claimed rather than merely counted, so two analyses racing
  // for the last one cannot both win. If the run fails before reaching the
  // model, it is handed back below.
  const { data: quota, error: quotaError } = await admin.rpc(
    "consume_analysis_quota",
    { p_org: application.org_id }
  );
  if (quotaError) {
    console.error("quota check failed:", quotaError.message);
    await admin
      .from("applications")
      .update({ analysis_status: "failed", analysis_error: "quota check failed" })
      .eq("id", applicationId);
    return json(500, { error: "quota check failed" });
  }
  const quotaResult = quota as {
    allowed: boolean;
    reason?: string;
    used?: number;
    quota?: number | null;
  };
  if (!quotaResult.allowed) {
    // Not an error the applicant caused, and their row stays readable: HR can
    // still open the CV by hand (D4 — applying never fails because of AI).
    console.error(
      `analysis refused: ${quotaResult.reason} (${quotaResult.used}/${quotaResult.quota})`
    );
    await admin
      .from("applications")
      .update({
        analysis_status: "failed",
        analysis_error: "monthly analysis quota exhausted",
      })
      .eq("id", applicationId);
    return json(429, { error: "quota exceeded" });
  }

  // From here on the unit is spent unless we give it back explicitly.
  let quotaConsumed = true;
  let reachedModel = false;
  const releaseQuota = async () => {
    if (!quotaConsumed) return;
    quotaConsumed = false;
    await admin.rpc("release_analysis_quota", { p_org: application.org_id });
  };

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
    const screeningBlock = formatScreeningAnswers(
      application.screening_answers
    );
    const interviewBlock = formatInterviewQa(application.interview_qa);

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });

    // Blind screening (0016). When the organisation has it on, the CV is
    // anonymised first and ONLY the redacted text reaches the evaluation —
    // the original file never does, which is the whole point: sending the PDF
    // would hand the model back the name and photo we just removed.
    //
    // Two calls instead of one, which is why this is opt-in and off by
    // default. Everything below then takes the text path regardless of the
    // original file type.
    const blind =
      (application.organizations as unknown as { blind_screening: boolean } | null)
        ?.blind_screening === true;

    let redactedText: string | null = null;
    if (blind) {
      reachedModel = true;
      const redactionParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [{ text: "Anonymise the attached CV per your instructions." }];

      if (application.cv_mime === "application/pdf") {
        redactionParts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: base64Encode(await cvBlob.arrayBuffer()),
          },
        });
      } else if (application.cv_mime === DOCX_MIME) {
        const { value } = await mammoth.extractRawText({
          buffer: Buffer.from(await cvBlob.arrayBuffer()),
        });
        redactionParts.push({ text: value.slice(0, MAX_CV_TEXT_CHARS) });
      } else {
        throw new Error(`unsupported cv_mime: ${application.cv_mime}`);
      }

      const redaction = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: redactionParts }],
        config: {
          systemInstruction: REDACTION_SYSTEM_PROMPT,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: REDACTION_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse(redaction.text ?? "{}") as {
        redacted_text?: string;
        removed?: string[];
      };
      if (!parsed.redacted_text || parsed.redacted_text.trim().length === 0) {
        // Refusing here is deliberate. Falling back to the original file
        // would silently evaluate the identity-bearing CV under a setting
        // that promises the opposite.
        throw new Error("redaction produced no usable text");
      }
      redactedText = parsed.redacted_text.slice(0, MAX_CV_TEXT_CHARS);
      // Categories only — never the removed values (D8).
      console.log(
        `blind screening: removed ${(parsed.removed ?? []).length} categories, prompt=${REDACTION_PROMPT_VERSION}`
      );
    }

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (redactedText !== null) {
      parts.push({
        text: buildUserMessage(
          job,
          // The cover note is the candidate's own prose and carries their
          // name as often as not; it is dropped in blind mode rather than
          // becoming the leak that undoes the redaction.
          null,
          "text",
          redactedText,
          false,
          screeningBlock,
          interviewBlock
        ),
      });
    } else if (application.cv_mime === "application/pdf") {
      parts.push({
        text: buildUserMessage(
          job,
          application.cover_note,
          "pdf",
          undefined,
          false,
          screeningBlock,
          interviewBlock
        ),
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
        text: buildUserMessage(
          job,
          application.cover_note,
          "text",
          cvText,
          truncated,
          screeningBlock,
          interviewBlock
        ),
      });
    } else {
      throw new Error(`unsupported cv_mime: ${application.cv_mime}`);
    }

    // Past this line the money is gone whatever happens, so the quota unit
    // stays consumed. Everything before it — a missing CV, an unreadable
    // DOCX — cost nothing and is refunded in the catch below.
    reachedModel = true;
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
        // Recorded per evaluation rather than read from the organisation
        // later: the setting can change, and a score has to stay explainable
        // as of when it was produced.
        blind,
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
      .update({ analysis_status: "done", analysis_error: null })
      .eq("id", applicationId);

    return json(200, { ok: true, fit_score: evaluation.fit_score });
  } catch (err) {
    // Error message only — never CV content or model output (D8, §8 privacy).
    // D5 wants the reason persisted, not just logged: HR sees why a retry is
    // worth pressing, and the platform console can group failures by cause.
    const message = err instanceof Error ? err.message : String(err);
    console.error("analysis failed:", message.slice(0, 500));
    // Nothing was sent to the model, so nothing was spent: hand the unit back
    // rather than charging the customer for our own failure to read a file.
    if (!reachedModel) await releaseQuota();
    await admin
      .from("applications")
      .update({
        analysis_status: "failed",
        // The attempt was already counted when the row was claimed.
        analysis_error: message.slice(0, 500),
      })
      .eq("id", applicationId);
    return json(500, { error: "analysis failed" });
  }
});
