// Re-export only. The definition lives in supabase/functions/_shared/application.ts.
//
// It has to: Supabase bundles a function from inside supabase/functions and
// nothing above it, so an Edge Function importing ../../../lib/... fails to
// deploy with "Module not found". That import shipped in S1 and had never
// been deployable.
//
// Both sides must agree on this contract exactly — it is the boundary
// between the apply form and submit-application — so it stays one file
// rather than two that can drift. Application code keeps importing
// @/lib/validations/application as before.
export * from "../../supabase/functions/_shared/application";

// What a browser may send through a Next.js server action. Lower than
// CV_MAX_BYTES (what submit-application and talent-upload accept) because
// the file crosses the web tier first, and Vercel refuses a request body over
// 4.5 MB before the action runs — the user then saw the generic error page
// instead of an Arabic message. 4 MB leaves room for the multipart envelope.
export const CV_FORM_MAX_BYTES = 4 * 1024 * 1024;
