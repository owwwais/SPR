// Re-export only. The definition lives in supabase/functions/_shared/services.ts,
// shared with the hr-services Edge Function (same reason as evaluation.ts:
// Supabase bundles a function from inside supabase/functions only).
export * from "../../supabase/functions/_shared/services";
