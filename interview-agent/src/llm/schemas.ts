// Structured-output schemas sent to the model (D5), mirroring the zod
// contract's QuestionContent. The model's shape is enforced twice: by the
// response schema here, and by zod after — the envelope as a whole in
// callTool(), then every question on its own in planner/validate.ts, where a
// broken question is dropped without taking the others with it.
import { z } from "zod";
import type { QuestionKind } from "../contract/index.ts";
import type { LlmSchema } from "./types.ts";

const QUESTION_FIELDS = [
  "kind",
  "text_ar",
  "competency",
  "difficulty",
  "expected_points",
  "rubric",
  "time_limit_sec",
  "follow_up_policy",
] as const;

const RUBRIC_FIELDS = ["name", "weight", "excellent", "acceptable", "weak"] as const;

const rubricCriterion: LlmSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Short Arabic name of what is assessed." },
    weight: { type: "INTEGER", minimum: 1, maximum: 5 },
    excellent: { type: "STRING", description: "Arabic: what an excellent answer shows." },
    acceptable: { type: "STRING", description: "Arabic: what an acceptable answer shows." },
    weak: { type: "STRING", description: "Arabic: what a weak answer looks like." },
  },
  required: [...RUBRIC_FIELDS],
  propertyOrdering: [...RUBRIC_FIELDS],
};

export function questionSchema(kinds: readonly QuestionKind[]): LlmSchema {
  return {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: [...kinds] },
      text_ar: { type: "STRING", description: "The question in Modern Standard Arabic." },
      competency: {
        type: "STRING",
        description: "The stated job requirement this question tests.",
      },
      difficulty: { type: "INTEGER", minimum: 1, maximum: 3 },
      expected_points: {
        type: "ARRAY",
        items: { type: "STRING" },
        minItems: 1,
        maxItems: 6,
      },
      rubric: {
        type: "OBJECT",
        properties: {
          criteria: { type: "ARRAY", items: rubricCriterion, maxItems: 5 },
        },
        required: ["criteria"],
      },
      time_limit_sec: { type: "INTEGER", nullable: true, minimum: 30, maximum: 1200 },
      follow_up_policy: { type: "STRING", enum: ["none", "on_vague", "probe_claim"] },
    },
    required: [...QUESTION_FIELDS],
    propertyOrdering: [...QUESTION_FIELDS],
  };
}

// Every question-producing tool answers { questions: [...] }.
export function questionsResponseSchema(
  kinds: readonly QuestionKind[],
  maxItems: number
): LlmSchema {
  return {
    type: "OBJECT",
    properties: {
      questions: { type: "ARRAY", items: questionSchema(kinds), minItems: 1, maxItems },
    },
    required: ["questions"],
  };
}

// The envelope zod checks in callTool(). Items stay `unknown` on purpose:
// each one is validated separately so a single malformed question costs
// that question, not the whole response.
export function questionsEnvelope(maxItems: number) {
  return z.object({ questions: z.array(z.unknown()).min(1).max(maxItems) });
}
export type QuestionsEnvelope = z.infer<ReturnType<typeof questionsEnvelope>>;
