import { Type, type Schema } from "@google/genai";
import type { ServiceKind } from "../_shared/services.ts";

// Gemini structured-output schemas (D5) mirroring _shared/services.ts. Gemini
// enforces shape, enums and required keys; zod re-validates everything after
// (lengths, ranges, counts) before anything is stored.

const str: Schema = { type: Type.STRING };
const strList: Schema = { type: Type.ARRAY, items: str };
const enumOf = (values: readonly string[]): Schema => ({ type: Type.STRING, enum: [...values] });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: Type.OBJECT,
  properties,
  required: Object.keys(properties),
});
const list = (items: Schema): Schema => ({ type: Type.ARRAY, items });

const confidence = enumOf(["high", "medium", "low"]);
const seniority = enumOf(["entry", "mid", "senior", "lead"]);
const basis = enumOf(["stated", "typical"]);

const jobNeed = obj({
  role_summary: str,
  title_suggestions: strList,
  seniority,
  min_years_experience: { type: Type.INTEGER },
  years_rationale: str,
  key_tasks: list(obj({ task: str, importance: enumOf(["core", "supporting"]), basis })),
  must_have: list(
    obj({
      requirement: str,
      kind: enumOf(["knowledge", "skill", "ability", "other"]),
      why: str,
      evidence_in_cv: str,
      basis,
    })
  ),
  nice_to_have: list(obj({ requirement: str, why: str })),
  skills: strList,
  competencies: list(obj({ name: str, definition: str, indicators: strList })),
  first_90_days: strList,
  interview_focus: strList,
  screening_questions: strList,
  clarity_warnings: list(obj({ kind: enumOf(["contradiction", "inflated", "vague"]), message: str })),
  fairness_flags: strList,
  confidence,
});

const payGrade = obj({
  role_summary: str,
  factors: list(
    obj({
      factor: enumOf([
        "knowledge",
        "problem_solving",
        "accountability",
        "communication",
        "leadership",
        "working_conditions",
      ]),
      level: { type: Type.INTEGER },
      rationale: str,
    })
  ),
  level_guidance: obj({ entry: str, competent: str, expert: str }),
  confidence,
});

const team = obj({
  team_summary: str,
  roles: list(
    obj({
      title: str,
      count: { type: Type.INTEGER },
      seniority,
      responsibilities: strList,
      skills: strList,
      why: str,
    })
  ),
  collaboration: strList,
  risks: strList,
  confidence,
});

const adAudit = obj({
  overall: str,
  findings: list(
    obj({
      category: enumOf([
        "exclusionary",
        "gender_coded",
        "inflated_requirement",
        "unclear",
        "missing_info",
        "tone",
      ]),
      severity: enumOf(["high", "medium", "low"]),
      quote: str,
      issue: str,
      suggestion: str,
    })
  ),
  missing: strList,
  strengths: strList,
  rewritten_requirements: str,
  confidence,
});

const interviewKit = obj({
  summary: str,
  competencies: list(
    obj({
      name: str,
      why: str,
      questions: list(
        obj({ question: str, kind: enumOf(["behavioral", "situational", "technical"]), follow_ups: strList })
      ),
      anchors: strList,
    })
  ),
  probes: strList,
  interviewer_tips: strList,
});

const onboarding = obj({
  summary: str,
  first_week: strList,
  phases: list(
    obj({
      phase: enumOf(["days_1_30", "days_31_60", "days_61_90"]),
      goal: str,
      activities: strList,
      success_measures: strList,
      support: strList,
    })
  ),
  checkins: strList,
});

export const RESPONSE_SCHEMAS: Record<ServiceKind, Schema> = {
  job_need: jobNeed,
  pay_grade: payGrade,
  team,
  ad_audit: adAudit,
  interview_kit: interviewKit,
  onboarding,
};
