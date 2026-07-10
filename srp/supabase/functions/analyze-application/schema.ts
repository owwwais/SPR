import { Type, type Schema } from "@google/genai";

// Gemini structured-output schema (D5) mirroring lib/validations/evaluation.ts.
// Gemini enforces shape/enums/required; zod re-validates everything after
// (including numeric ranges and array lengths) before anything is persisted.

const extractedCV: Schema = {
  type: Type.OBJECT,
  properties: {
    full_name: { type: Type.STRING, nullable: true },
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
        required: ["title", "company", "start", "end", "summary"],
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
        required: ["degree", "field", "institution", "year"],
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
    cv_language: { type: Type.STRING, enum: ["ar", "en", "mixed"] },
  },
  required: [
    "full_name",
    "total_years_experience",
    "experiences",
    "education",
    "skills",
    "languages",
    "cv_language",
  ],
};

const scoreBreakdown: Schema = {
  type: Type.OBJECT,
  properties: {
    required_skills: { type: Type.NUMBER },
    experience_relevance: { type: Type.NUMBER },
    experience_years: { type: Type.NUMBER },
    education_fit: { type: Type.NUMBER },
    bonus_signals: { type: Type.NUMBER },
  },
  required: [
    "required_skills",
    "experience_relevance",
    "experience_years",
    "education_fit",
    "bonus_signals",
  ],
};

export const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    extracted: extractedCV,
    score_breakdown: scoreBreakdown,
    fit_score: { type: Type.INTEGER },
    justification: {
      type: Type.OBJECT,
      properties: {
        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
        gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
        red_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["strengths", "gaps", "red_flags"],
    },
    interview_questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            enum: ["technical", "behavioral", "gap_probe"],
          },
          rationale: { type: Type.STRING },
        },
        required: ["question", "kind", "rationale"],
      },
    },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: [
    "extracted",
    "score_breakdown",
    "fit_score",
    "justification",
    "interview_questions",
    "confidence",
  ],
};
