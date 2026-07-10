import { z } from "zod";
import { ScreeningQuestions } from "./screening";

export const JOB_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "remote",
  "internship",
] as const;

// Shared by the admin job form action (create + update).
// `requirements` may be empty while a job is a draft; publishing separately
// enforces non-empty requirements (FR-01).
export const jobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  department: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v)),
  location: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v)),
  type: z.enum(JOB_TYPES),
  description: z.string().trim().min(1).max(20000),
  requirements: z.string().trim().max(20000),
  skills: z
    .string()
    .max(2000)
    .transform((v) =>
      v
        .split(/[,،\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  min_years_experience: z.coerce.number().int().min(0).max(50),
  closes_at: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .transform((v) => (v === "" ? null : v)),
  // Serialized by the questions builder as JSON in a hidden field.
  screening_questions: z
    .string()
    .max(20000)
    .transform((v, ctx) => {
      try {
        return JSON.parse(v === "" ? "[]" : v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "invalid questions JSON" });
        return z.NEVER;
      }
    })
    .pipe(ScreeningQuestions),
});

export type JobInput = z.infer<typeof jobSchema>;
