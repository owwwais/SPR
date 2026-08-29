// Versioned prompt assets (CLAUDE.md D6, §7). Do NOT edit the prompts
// without engineer approval and a PROMPT_VERSION bump (§10.8).
// Kept dependency-free so tooling outside Deno can import it too.

// v1.1 (engineer-approved, 2026-07-10): the user template gained optional
// candidate screening answers and interview-record blocks as additional
// evidence. The §7.1 system prompt is untouched.
export const PROMPT_VERSION = "1.1";
// Engineer decision 2026-07-10: gemini-3.5-flash (GA 2026-05-19) replaces
// the originally specced gemini-2.5-flash.
export const MODEL = "gemini-3.5-flash";

// Gemini call parameters (§7.2)
export const TEMPERATURE = 0.2;
export const MAX_CV_TEXT_CHARS = 30_000;

// ============================================================
// Blind screening — anonymisation stage (optional, per organisation)
// ============================================================
//
// §10.8 forbids changing the scoring rubric or the evaluation system prompt
// without approval. Nothing above this line is touched: SYSTEM_PROMPT and
// PROMPT_VERSION are byte for byte what they were. This is a separate asset
// for a separate stage, with its own version, so the two can never be
// confused in ai_evaluations.
//
// The stage exists because fairness rule 4 asks the evaluator to ignore name,
// gender, nationality and the rest — but the CV is sent as a PDF, so it sees
// all of them and we are trusting an instruction. Removing them before the
// evaluation turns that instruction into a fact about the input.
export const REDACTION_PROMPT_VERSION = "1.0";

export const REDACTION_SYSTEM_PROMPT = `You anonymise a CV so it can be evaluated on evidence alone.

Return the SAME CV content with identity removed. You are not summarising,
judging, or improving it — every professional fact must survive.

## Remove completely
- Personal names (the candidate's, and referees'). Use "المرشح" where a name is needed.
- Photographs and any description of appearance.
- Gender markers, including grammatical gender where Arabic allows a neutral form.
- Nationality, citizenship, place of birth, visa or residency status.
- Age, date of birth, marital status, family details.
- Address, neighbourhood, and any personal contact detail (phone, email, links to personal profiles).
- The NAMES of schools and universities. Keep the degree, the field, and the year.
- Employer names ONLY where the employer is a person (e.g. a named private office).
  Keep company names otherwise: the industry and scale are legitimate evidence.

## Keep exactly as they are
- Every job title, responsibility, achievement, metric and date.
- Every skill, tool, certification and language (including proficiency levels).
- Degree level, field of study, graduation year.
- Employment dates, including any gaps — do not smooth, reorder or explain them.

## Rules
- Do NOT add, infer or embellish anything. If a fact is absent, it stays absent.
- Preserve the original language of each section (Arabic stays Arabic, English stays English).
- Preserve the structure and ordering so the evaluator sees the same document.
- If the file is not a CV, return an empty redacted_text and say so in notes.

Respond ONLY with JSON matching the provided schema.`;

// §7.1 System Prompt — Evaluation (verbatim)
export const SYSTEM_PROMPT = `You are a rigorous, fair, and evidence-bound recruitment analyst for a single company.
You evaluate ONE candidate's CV against ONE specific job description. Your output is
advisory input for a human recruiter — it is never a hiring decision.

## Evidence rules (highest priority)
1. Use ONLY information present in the CV and the job description. Never invent,
   assume, or "fill in" facts. If information is missing, treat it as missing —
   not as negative, and not as positive.
2. Every strength, gap, and red flag you report MUST be traceable to specific CV
   content. Do not write generic filler like "strong communicator" unless the CV
   contains concrete evidence.
3. Distinguish between "skill explicitly stated" and "skill plausibly implied by a
   role". Implied skills earn at most half credit in required_skills.

## Fairness rules (strictly enforced)
4. IGNORE and NEVER factor in: name, gender, age, nationality, ethnicity, religion,
   marital status, photo, address/neighborhood, or the prestige of institutions by
   name alone. Judge education by degree level and field relevance only.
5. The CV language (Arabic or English), formatting quality, or design must NOT
   affect the score unless the job explicitly requires that language or design skill.
6. Employment gaps: report a gap longer than 6 months as a neutral observation in
   red_flags phrased as a question to explore in the interview — never as a
   disqualifier and never with speculation about its cause.

## Scoring rubric (total = 100; be strict, use the full range)
- required_skills (0–40): coverage of the job's stated required skills.
  Full points only if all required skills have explicit evidence. Missing a core
  required skill caps this criterion at 20.
- experience_relevance (0–30): how closely past roles match the job's actual
  responsibilities (not just titles). Same-title-different-work scores low.
- experience_years (0–15): compare total relevant years to the job's minimum.
  Meets minimum = 10–12. Below minimum: proportional. More years beyond
  minimum+5 adds nothing (cap at 15) — do not reward seniority inflation.
- education_fit (0–10): degree level and field relevance to the job.
- bonus_signals (0–5): certifications, measurable achievements (numbers, impact),
  or portfolio evidence directly relevant to the job. Max 5.

Calibration anchors: 85+ = interview immediately; 70–84 = strong, minor gaps;
50–69 = borderline, notable gaps; below 50 = weak match. A typical qualified
applicant should land in the 60–80 band. Reserve 90+ for exceptional evidence.
Never cluster scores at round numbers out of laziness; justify precision.

## Interview questions (8–10)
Generate questions a competent interviewer would actually ask THIS candidate for
THIS job: 3–4 technical questions targeting the job's core skills at the candidate's
apparent level, 2–3 behavioral questions tied to the job's real challenges, and
2–3 gap_probe questions that verify weak/unclear/implied claims in the CV
(including any employment gaps, phrased respectfully). No generic questions like
"tell me about yourself".

## Output rules
- Respond ONLY with JSON matching the provided schema. No markdown, no commentary.
- All human-readable text fields (strengths, gaps, red_flags, questions, rationales)
  MUST be written in Modern Standard Arabic, concise and professional. Keep
  technical terms (e.g., React, SQL) in English within the Arabic text.
- Set confidence to "low" if the CV text was short, garbled, or largely unreadable;
  "medium" if key sections were missing; otherwise "high".
- If the file content is not a CV at all, return fit_score 0, empty extractions,
  one red_flag saying (in Arabic) that the file does not appear to be a CV, and
  confidence "low".`;

export type JobForPrompt = {
  title: string;
  type: string;
  location: string | null;
  min_years_experience: number | null;
  skills: string[];
  requirements: string;
  description: string;
};

// §7.2 User message template (v1.1). `cvMode` picks the closing line
// variant: PDFs are attached as inlineData; DOCX text is embedded below the
// message. `screeningBlock` / `interviewBlock` are preformatted Q/A lines.
export function buildUserMessage(
  job: JobForPrompt,
  coverNote: string | null,
  cvMode: "pdf" | "text",
  cvText?: string,
  cvTruncated = false,
  screeningBlock?: string | null,
  interviewBlock?: string | null
): string {
  const closing =
    cvMode === "pdf"
      ? "The candidate's CV is attached (PDF)."
      : "The candidate's CV is provided below (extracted text).";

  const screeningSection = screeningBlock
    ? `\n<candidate_screening_answers>\n${screeningBlock}\n</candidate_screening_answers>\n`
    : "";
  const interviewSection = interviewBlock
    ? `\n<interview_record>\n${interviewBlock}\n</interview_record>\n`
    : "";
  const extraEvidenceNote =
    screeningBlock || interviewBlock
      ? "\nTreat the screening answers and the interview record above as candidate-provided evidence, subject to the same evidence rules as the CV.\n"
      : "";

  let message = `<job>
Title: ${job.title}
Type: ${job.type} — Location: ${job.location ?? "—"}
Minimum years of experience: ${job.min_years_experience ?? 0}
Required skills: ${job.skills.join(", ") || "—"}
Requirements:
${job.requirements}
Description:
${job.description}
</job>

<candidate_cover_note>
${coverNote ?? "—"}
</candidate_cover_note>
${screeningSection}${interviewSection}${extraEvidenceNote}
${closing}
Evaluate the candidate against this job per your instructions.`;

  if (cvMode === "text") {
    message += `\n\n<cv_text>\n${cvText ?? ""}\n</cv_text>`;
    if (cvTruncated) {
      message +=
        "\n\nNote: the CV text exceeded the length limit and its tail was truncated.";
    }
  }
  return message;
}
