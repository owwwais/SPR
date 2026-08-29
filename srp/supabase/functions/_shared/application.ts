import { z } from "zod";

// Shared by the apply form and the submit-application Edge Function (D15),
// so it must stay free of Next.js path aliases and of UI strings: Deno
// imports this file directly, and an API boundary has no business emitting
// Arabic copy. Issues are identified by their `path`; the Arabic wording
// lives in lib/i18n/ar.ts and is applied by the caller.

// Prefix of the public tracking code every applicant receives and types back
// into /track. It is the product's Latin short form (PRODUCT_SLUG in
// lib/i18n/ar.ts, kept as a separate literal because this module is imported
// by Deno and must stay free of the Arabic dictionary). Codes already issued
// under an older prefix keep working: lookup is an exact match on a stored
// value, so only newly generated codes change.
export const REF_CODE_PREFIX = "HKM";

/** Placeholder shown to applicants, e.g. "HKM-XXXXXXXX". */
export const REF_CODE_EXAMPLE = `${REF_CODE_PREFIX}-XXXXXXXX`;

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
  full_name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/),
  cover_note: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length > 0 ? v : null)),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// The field names the form and the Edge Function agree on. Anything outside
// this set that comes back from the function is treated as a generic error
// rather than shown against an input.
export const APPLICATION_FIELDS = [
  "full_name",
  "email",
  "phone",
  "cover_note",
  "cv",
] as const;

export type ApplicationField = (typeof APPLICATION_FIELDS)[number];
