// talent-analyze — step two of three: the verification link lands here.
//
// This is where the paid model call finally happens, and it happens only
// because an email address has just proved it exists. Before this point an
// anonymous upload costs storage and nothing else.
//
// Invocation: { verify_token }. The token both authenticates the request and
// identifies the profile; there is no session, by design (the journey has no
// password).
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, plus
// GEMINI_API_KEY.
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import mammoth from "mammoth";
import { Buffer } from "node:buffer";
import { encodeBase64 as base64Encode } from "jsr:@std/encoding/base64";
import {
  TALENT_SYSTEM_PROMPT,
  TALENT_PROMPT_VERSION,
  MODEL,
  TEMPERATURE,
  MAX_CV_TEXT_CHARS,
} from "./prompts.ts";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A verification link older than this is refused rather than honoured: it is
// the only thing standing between an intercepted email and a published page.
const VERIFY_TTL_HOURS = 24;

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

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let payload: { verify_token?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_input" });
  }
  const token = payload.verify_token;
  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    return json(400, { error: "invalid_input" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profile, error: lookupError } = await admin
    .schema("talent")
    .from("profiles")
    .select("id, public_token, cv_path, verify_sent_at, analysis_status")
    .eq("verify_token", token)
    .maybeSingle();
  if (lookupError) {
    console.error("profile lookup failed:", lookupError.message);
    return json(500, { error: "server_error" });
  }
  if (!profile) return json(404, { error: "expired" });

  const sentAt = profile.verify_sent_at
    ? new Date(profile.verify_sent_at).getTime()
    : 0;
  if (Date.now() - sentAt > VERIFY_TTL_HOURS * 3600 * 1000) {
    return json(410, { error: "expired" });
  }

  // Verification is recorded before the analysis, so a failed model call does
  // not send the person back to the start.
  await admin
    .schema("talent")
    .from("profiles")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", profile.id);

  // Already analysed — the same file re-uploaded, or the link clicked twice.
  // Return the review token rather than paying again.
  if (profile.analysis_status === "done") {
    return json(200, { ok: true, public_token: profile.public_token });
  }

  await admin
    .schema("talent")
    .from("profiles")
    .update({ analysis_status: "processing" })
    .eq("id", profile.id);

  try {
    const { data: cvBlob, error: downloadError } = await admin.storage
      .from("talent-cvs")
      .download(profile.cv_path!);
    if (downloadError || !cvBlob) {
      throw new Error(`CV download failed: ${downloadError?.message}`);
    }

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: "Read the attached CV and produce the profile." }];

    if (profile.cv_path!.endsWith(".pdf")) {
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

    const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });
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

    const result = JSON.parse(response.text ?? "{}") as {
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

    if (result.is_cv === false) {
      throw new Error("uploaded file does not appear to be a CV");
    }

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

    // A queue, not a bin: what recurs here is what the vocabulary is missing.
    for (const raw of unmapped) {
      await admin.rpc("talent_record_unmapped_skill", { p_label: raw });
    }

    return json(200, {
      ok: true,
      public_token: profile.public_token,
      unmapped: unmapped.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("talent analysis failed:", message.slice(0, 500));
    await admin
      .schema("talent")
      .from("profiles")
      .update({
        analysis_status: "failed",
        analysis_error: message.slice(0, 500),
      })
      .eq("id", profile.id);
    return json(500, { error: "analysis_failed" });
  }
});
