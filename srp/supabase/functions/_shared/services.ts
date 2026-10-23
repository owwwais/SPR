import { z } from "zod";

// The services hub (CLAUDE.md D34): input and output contracts shared by the
// hr-services Edge Function and the Next.js pages, plus the parts of each
// service that are arithmetic rather than judgement. Those are computed here,
// in code, never by the model: a grade, a pay range, a skill match.
//
// Keep this file dependency-free apart from zod (same rule as evaluation.ts).
// The Next.js side imports it through lib/validations/services.ts.

export const SERVICE_KINDS = [
  "job_need",
  "pay_grade",
  "team",
  "ad_audit",
  "interview_kit",
  "onboarding",
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const isServiceKind = (value: unknown): value is ServiceKind =>
  typeof value === "string" && (SERVICE_KINDS as readonly string[]).includes(value);

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().default("");

export const JOB_TYPES = ["full_time", "part_time", "contract", "remote", "internship"] as const;
export const SENIORITY = ["entry", "mid", "senior", "lead"] as const;
export type Seniority = (typeof SENIORITY)[number];

// ============================================================
// Inputs
// ============================================================

export const JobNeedInput = z.object({
  // "Review this job": the current text is analysed too.
  job_id: z.guid().optional(),
  title_hint: optionalText(120),
  problem: text(1500).min(10),
  outcomes: text(1500).min(10),
  team_context: optionalText(800),
  location: optionalText(120),
  work_mode: z.enum(["onsite", "remote", "hybrid"]).optional(),
  employment_type: z.enum(JOB_TYPES).optional(),
  level: z.enum(["unknown", ...SENIORITY]).default("unknown"),
  tools: optionalText(800),
  existing_description: optionalText(12000),
});
export type JobNeedInput = z.infer<typeof JobNeedInput>;

// Pay grade, ad audit, interview kit and onboarding read an existing job.
export const JobRefInput = z.object({ job_id: z.guid() });

export const PayGradeInput = z.union([
  z.object({ job_id: z.guid() }),
  z.object({ title: text(120).min(2), summary: text(4000).min(20) }),
]);
export type PayGradeInput = z.infer<typeof PayGradeInput>;

export const TeamInput = z.object({
  goal: text(2000).min(20),
  timeline: optionalText(200),
  team_size: z.number().int().min(2).max(12).optional(),
});
export type TeamInput = z.infer<typeof TeamInput>;

export const OnboardingInput = z.object({
  job_id: z.guid(),
  context: optionalText(800),
});

export const SERVICE_INPUTS = {
  job_need: JobNeedInput,
  pay_grade: PayGradeInput,
  team: TeamInput,
  ad_audit: JobRefInput,
  interview_kit: JobRefInput,
  onboarding: OnboardingInput,
} as const;

// ============================================================
// Outputs (what the model returns; validated before anything is stored, D5)
// ============================================================

const confidence = z.enum(["high", "medium", "low"]);
const basis = z.enum(["stated", "typical"]);

// O*NET content model + KSAO + competency modeling (job_need prompt).
export const JobNeedOutput = z.object({
  role_summary: text(600),
  title_suggestions: z.array(text(120)).min(1).max(3),
  seniority: z.enum(SENIORITY),
  min_years_experience: z.number().int().min(0).max(30),
  years_rationale: text(400),
  key_tasks: z
    .array(z.object({ task: text(300), importance: z.enum(["core", "supporting"]), basis }))
    .min(3)
    .max(10),
  must_have: z
    .array(
      z.object({
        requirement: text(300),
        kind: z.enum(["knowledge", "skill", "ability", "other"]),
        why: text(300),
        evidence_in_cv: text(300),
        basis,
      })
    )
    .min(1)
    .max(6),
  nice_to_have: z.array(z.object({ requirement: text(300), why: text(300) })).max(6),
  skills: z.array(text(80)).max(20),
  competencies: z
    .array(z.object({ name: text(80), definition: text(300), indicators: z.array(text(200)).min(1).max(4) }))
    .min(3)
    .max(6),
  first_90_days: z.array(text(300)).min(2).max(5),
  interview_focus: z.array(text(300)).min(3).max(6),
  screening_questions: z.array(text(300)).max(5),
  clarity_warnings: z
    .array(z.object({ kind: z.enum(["contradiction", "inflated", "vague"]), message: text(400) }))
    .max(8),
  fairness_flags: z.array(text(400)).max(6),
  confidence,
  // Deliberately absent: salary, market data, occupation codes, nationality.
});
export type JobNeedOutput = z.infer<typeof JobNeedOutput>;

// Point-factor job evaluation: the model rates each factor; points and the
// grade are computed below.
export const PAY_FACTORS = [
  "knowledge",
  "problem_solving",
  "accountability",
  "communication",
  "leadership",
  "working_conditions",
] as const;
export type PayFactor = (typeof PAY_FACTORS)[number];

export const PayGradeOutput = z.object({
  role_summary: text(400),
  factors: z
    .array(z.object({ factor: z.enum(PAY_FACTORS), level: z.number().int().min(1).max(6), rationale: text(400) }))
    .length(PAY_FACTORS.length)
    .refine((list) => new Set(list.map((f) => f.factor)).size === PAY_FACTORS.length, {
      message: "each factor exactly once",
    }),
  level_guidance: z.object({
    entry: text(300),
    competent: text(300),
    expert: text(300),
  }),
  confidence,
  // Deliberately absent: any salary figure or market statistic.
});
export type PayGradeOutput = z.infer<typeof PayGradeOutput>;

export const TeamOutput = z.object({
  team_summary: text(600),
  roles: z
    .array(
      z.object({
        title: text(120),
        count: z.number().int().min(1).max(5),
        seniority: z.enum(SENIORITY),
        responsibilities: z.array(text(250)).min(1).max(4),
        skills: z.array(text(80)).min(2).max(10),
        why: text(300),
      })
    )
    .min(2)
    .max(8),
  collaboration: z.array(text(300)).max(5),
  risks: z.array(text(300)).max(5),
  confidence,
});
export type TeamOutput = z.infer<typeof TeamOutput>;

export const AD_FINDING_CATEGORIES = [
  "exclusionary",
  "gender_coded",
  "inflated_requirement",
  "unclear",
  "missing_info",
  "tone",
] as const;

export const AdAuditOutput = z.object({
  overall: text(500),
  findings: z
    .array(
      z.object({
        category: z.enum(AD_FINDING_CATEGORIES),
        severity: z.enum(["high", "medium", "low"]),
        // The exact words from the ad; empty only for missing information.
        quote: text(300),
        issue: text(400),
        suggestion: text(400),
      })
    )
    .max(20),
  missing: z.array(text(200)).max(8),
  strengths: z.array(text(300)).max(5),
  rewritten_requirements: text(6000),
  confidence,
});
export type AdAuditOutput = z.infer<typeof AdAuditOutput>;

export const InterviewKitOutput = z.object({
  summary: text(400),
  competencies: z
    .array(
      z.object({
        name: text(80),
        why: text(300),
        questions: z
          .array(
            z.object({
              question: text(400),
              kind: z.enum(["behavioral", "situational", "technical"]),
              follow_ups: z.array(text(250)).max(3),
            })
          )
          .min(1)
          .max(3),
        // Behaviourally anchored rating scale, 1 (weak) … 4 (strong).
        anchors: z.array(text(300)).length(4),
      })
    )
    .min(3)
    .max(6),
  probes: z.array(text(300)).max(5),
  interviewer_tips: z.array(text(300)).max(5),
});
export type InterviewKitOutput = z.infer<typeof InterviewKitOutput>;

export const ONBOARDING_PHASES = ["days_1_30", "days_31_60", "days_61_90"] as const;

export const OnboardingOutput = z.object({
  summary: text(400),
  first_week: z.array(text(250)).min(3).max(8),
  phases: z
    .array(
      z.object({
        phase: z.enum(ONBOARDING_PHASES),
        goal: text(300),
        activities: z.array(text(250)).min(2).max(6),
        success_measures: z.array(text(250)).min(1).max(4),
        support: z.array(text(150)).max(4),
      })
    )
    .length(3),
  checkins: z.array(text(250)).min(2).max(5),
});
export type OnboardingOutput = z.infer<typeof OnboardingOutput>;

export const SERVICE_OUTPUTS = {
  job_need: JobNeedOutput,
  pay_grade: PayGradeOutput,
  team: TeamOutput,
  ad_audit: AdAuditOutput,
  interview_kit: InterviewKitOutput,
  onboarding: OnboardingOutput,
} as const;

// ============================================================
// Point-factor arithmetic (pay_grade)
// ============================================================
//
// A published, fixed plan: weights sum to 1000 points at level 6, levels are
// linear, and the 12 grades split the possible range evenly. Being fixed and
// shown to the user is the point — the same ratings always give the same
// grade, and anyone can check the sum.

export const FACTOR_WEIGHTS: Readonly<Record<PayFactor, number>> = {
  knowledge: 250,
  problem_solving: 200,
  accountability: 200,
  communication: 150,
  leadership: 150,
  working_conditions: 50,
};
export const MAX_LEVEL = 6;
export const GRADE_COUNT = 12;

export function factorPoints(factor: PayFactor, level: number): number {
  return Math.round((FACTOR_WEIGHTS[factor] * level) / MAX_LEVEL);
}

export function totalPoints(factors: ReadonlyArray<{ factor: PayFactor; level: number }>): number {
  return factors.reduce((sum, f) => sum + factorPoints(f.factor, f.level), 0);
}

const MIN_POINTS = Object.values(FACTOR_WEIGHTS).reduce((sum, w) => sum + Math.round(w / MAX_LEVEL), 0);
const MAX_POINTS = Object.values(FACTOR_WEIGHTS).reduce((sum, w) => sum + w, 0);

/** Grade 1–12 from total points: equal-width bands over the possible range. */
export function gradeForPoints(points: number): number {
  const width = (MAX_POINTS - MIN_POINTS + 1) / GRADE_COUNT;
  const grade = Math.floor((points - MIN_POINTS) / width) + 1;
  return Math.min(GRADE_COUNT, Math.max(1, grade));
}

/** The point range each grade covers, for the published table. */
export function gradeBands(): { grade: number; from: number; to: number }[] {
  const width = (MAX_POINTS - MIN_POINTS + 1) / GRADE_COUNT;
  return Array.from({ length: GRADE_COUNT }, (_, i) => ({
    grade: i + 1,
    from: Math.ceil(MIN_POINTS + i * width),
    to: Math.ceil(MIN_POINTS + (i + 1) * width) - 1,
  }));
}

/**
 * Where in the company's own range to place an offer, by how fully the
 * person meets the role — the same for everyone at that level. Thirds of
 * the range: entry in the lower third, fully competent around the middle,
 * expert in the upper third.
 */
export function positionInRange(min: number, max: number) {
  const span = max - min;
  const round = (n: number) => Math.round(n / 50) * 50;
  return {
    entry: { from: round(min), to: round(min + span / 3) },
    competent: { from: round(min + span / 3), to: round(min + (2 * span) / 3) },
    expert: { from: round(min + (2 * span) / 3), to: round(max) },
    midpoint: round(min + span / 2),
  };
}

// ============================================================
// Skill matching (team) — deterministic and explainable (D28's rule)
// ============================================================

/** Lower-cased, Arabic letter variants folded, punctuation collapsed. */
export function normalizeSkill(skill: string): string {
  return skill
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim();
}

/** The role skills a candidate has, matching whole normalised skills. */
export function matchedSkills(roleSkills: readonly string[], candidateSkills: readonly string[]): string[] {
  const have = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
  return roleSkills.filter((skill) => have.has(normalizeSkill(skill)));
}
