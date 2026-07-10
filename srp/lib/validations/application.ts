import { z } from "zod";
import { ar } from "@/lib/i18n/ar";

export const CV_MAX_BYTES = 5 * 1024 * 1024; // D8: 5MB cap

// mime -> storage extension; keys must stay in sync with the DB check
// constraint on applications.cv_mime and the cvs bucket whitelist.
export const CV_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
} as const;

export type CvMime = keyof typeof CV_MIME_TYPES;

export const applicationSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, ar.apply.errors.fullName)
    .max(120, ar.apply.errors.fullName),
  email: z
    .email(ar.apply.errors.email)
    .max(200, ar.apply.errors.email)
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s()-]{7,20}$/, ar.apply.errors.phone),
  cover_note: z
    .string()
    .trim()
    .max(2000, ar.apply.errors.coverNote)
    .transform((v) => (v.length > 0 ? v : null)),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
