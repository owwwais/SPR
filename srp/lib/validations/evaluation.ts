import { z } from "zod";

// AI output schemas — single source of truth (CLAUDE.md §6), shared between
// the Next.js dashboard and the analyze-application Edge Function (Deno
// resolves the bare "zod" specifier via the function's deno.json imports).
// Keep this file dependency-free apart from zod.

export const ExtractedCV = z.object({
  full_name: z.string().nullable(),
  total_years_experience: z.number().min(0).max(60),
  experiences: z.array(
    z.object({
      title: z.string(),
      company: z.string().nullable(),
      start: z.string().nullable(), // "YYYY-MM" or null
      end: z.string().nullable(), // "YYYY-MM" or null
      summary: z.string(),
    })
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      field: z.string().nullable(),
      institution: z.string().nullable(),
      year: z.string().nullable(),
    })
  ),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  cv_language: z.enum(["ar", "en", "mixed"]),
});

export const ScoreBreakdown = z.object({
  required_skills: z.number().min(0).max(40),
  experience_relevance: z.number().min(0).max(30),
  experience_years: z.number().min(0).max(15),
  education_fit: z.number().min(0).max(10),
  bonus_signals: z.number().min(0).max(5),
});

export const Evaluation = z.object({
  extracted: ExtractedCV,
  score_breakdown: ScoreBreakdown,
  fit_score: z.number().int().min(0).max(100), // must equal sum of breakdown (verify in code)
  justification: z.object({
    // §7.1 non-CV fallback returns empty strengths — so no min(1) here;
    // for real CVs the prompt itself demands evidence-based strengths.
    strengths: z.array(z.string()).max(6), // Arabic
    gaps: z.array(z.string()).max(6), // Arabic
    red_flags: z.array(z.string()).max(4), // Arabic
  }),
  // 8–10 questions for a real CV; 0 allowed only for the §7.1 non-CV
  // fallback (fit_score 0, empty extractions). 1–7 stays invalid.
  interview_questions: z
    .array(
      z.object({
        question: z.string(), // Arabic
        kind: z.enum(["technical", "behavioral", "gap_probe"]),
        rationale: z.string(), // Arabic, one line
      })
    )
    .max(10)
    .refine((questions) => questions.length === 0 || questions.length >= 8, {
      message: "expected 8-10 questions, or 0 for the non-CV fallback",
    }),
  confidence: z.enum(["high", "medium", "low"]), // low => UI shows a caution badge
});

export type ExtractedCVType = z.infer<typeof ExtractedCV>;
export type ScoreBreakdownType = z.infer<typeof ScoreBreakdown>;
export type EvaluationType = z.infer<typeof Evaluation>;

// §6: recompute fit_score from the breakdown sum and overwrite the model's
// total if they differ. Rounded (criteria may carry decimals) and clamped.
export function computeFitScore(breakdown: ScoreBreakdownType): number {
  const sum =
    breakdown.required_skills +
    breakdown.experience_relevance +
    breakdown.experience_years +
    breakdown.education_fit +
    breakdown.bonus_signals;
  return Math.min(100, Math.max(0, Math.round(sum)));
}
