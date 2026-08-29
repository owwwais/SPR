import { z } from "zod";

// Screening questions (jobs.screening_questions) and applicant answers
// (applications.screening_answers) + the interview Q&A record
// (applications.interview_qa). Kept dependency-free (zod only) so the
// analyze-application Edge Function can share it.

export const QUESTION_TYPES = [
  "text",
  "yes_no",
  "single_choice",
  "multiple_choice",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ScreeningQuestion = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().trim().min(3).max(300),
    type: z.enum(QUESTION_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  })
  .superRefine((question, ctx) => {
    if (
      (question.type === "single_choice" ||
        question.type === "multiple_choice") &&
      question.options.length < 2
    ) {
      ctx.addIssue({
        code: "custom",
        message: "choice questions need at least 2 options",
        path: ["options"],
      });
    }
  });

export const ScreeningQuestions = z.array(ScreeningQuestion).max(10);
export type ScreeningQuestionType = z.infer<typeof ScreeningQuestion>;

// Answers are denormalized with label + type so they stay readable in the
// dashboard and the AI prompt even if the job's questions change later.
export const ScreeningAnswer = z.object({
  question_id: z.string().min(1).max(40),
  label: z.string().min(1).max(300),
  type: z.enum(QUESTION_TYPES),
  answer: z.union([
    z.string().max(2000),
    z.array(z.string().max(200)).max(10),
  ]),
});

export const ScreeningAnswers = z.array(ScreeningAnswer).max(10);
export type ScreeningAnswerType = z.infer<typeof ScreeningAnswer>;

export const InterviewQaEntry = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(4000),
  source: z.enum(["ai", "hr"]),
});

export const InterviewQa = z.array(InterviewQaEntry).max(30);
export type InterviewQaEntryType = z.infer<typeof InterviewQaEntry>;
