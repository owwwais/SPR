// A short id attached to one request, threaded through every log line and
// every JSON response for the talent functions.
//
// Without this, "the upload was rejected" is the entire report a user can
// give: every failure path returned the same generic message and nothing
// tied a support conversation back to a specific log line. With it, the
// error the browser shows carries a code the log search box on this exact
// request lands on directly — Supabase Dashboard → Edge Functions →
// <function> → Logs → search the trace id.
//
// step() logs progress even on the success path, deliberately: the silent
// case (a request that produced no client-visible error but also never
// completed — an email that never arrived, say) is invisible without it.
export function newTraceId(): string {
  const bytes = new Uint8Array(5); // 40 bits, printed as 10 hex chars
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function makeLogger(fn: string, trace: string) {
  const line = (level: "log" | "error", step: string, extra?: Record<string, unknown>) =>
    console[level](JSON.stringify({ fn, trace, step, ...extra }));
  return {
    trace,
    step: (step: string, extra?: Record<string, unknown>) => line("log", step, extra),
    fail: (step: string, message: string, extra?: Record<string, unknown>) =>
      line("error", step, { message, ...extra }),
  };
}

// Error codes that mean "the schema this call needs isn't there".
//
// Two different layers can report this, and testing against only one is
// exactly the mistake this shipped with the first time: a table or function
// missing FROM POSTGRES ITSELF surfaces the raw SQLSTATE (42P01 relation,
// 42883 function) — verified directly with psql. But supabase-js's .rpc()
// and .from() go through PostgREST, and PostgREST keeps its own schema
// cache; a function or table it has never indexed is rejected AT THAT LAYER
// with a PGRST-prefixed code (PGRST202 function, PGRST205 table) and the
// request never reaches Postgres at all, so the SQLSTATE it never sees.
// Every talent RPC call goes through PostgREST, so PGRST202/205 is the one
// that actually matters in production; 42883/42P01 stays as a fallback for
// anything called a different way.
//
// The message text is checked too, as a version-independent safety net:
// PostgREST's wording for both cases contains "schema cache" and has been
// stable across releases even where exact codes have not.
const SCHEMA_MISSING_CODES = new Set([
  "42P01", "42883",       // raw Postgres: relation / function does not exist
  "PGRST202", "PGRST205", // PostgREST schema cache: function / table
]);

export function isSchemaMissingError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code && SCHEMA_MISSING_CODES.has(error.code)) return true;
  return Boolean(error.message?.toLowerCase().includes("schema cache"));
}
