// The files that exist in both codebases, byte for byte (design §3).
// Paths are relative to interview-agent/.
export const SHARED_FILES = [
  ["src/contract/index.ts", "../srp/supabase/functions/_shared/interview-contract.ts"],
  ["src/auth/hmac.ts", "../srp/supabase/functions/_shared/interview-hmac.ts"],
] as const;
