// Re-export only. The definition lives in supabase/functions/_shared/evaluation.ts.
//
// It has to: Supabase bundles a function from inside supabase/functions and
// nothing above it, so an Edge Function importing ../../../lib/... fails to
// deploy with "Module not found". That import shipped in S1 and had never
// been deployable.
//
// Both sides must agree on this contract exactly — it is the boundary
// between the apply form and submit-application — so it stays one file
// rather than two that can drift. Application code keeps importing
// @/lib/validations/evaluation as before.
export * from "../../supabase/functions/_shared/evaluation";
