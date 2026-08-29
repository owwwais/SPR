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

// Postgres error codes that mean "the schema this call needs isn't there" —
// a table or function referenced by name does not exist. Almost always
// migrations 0012-0017 not having been applied yet, and worth telling apart
// from an ordinary runtime failure: the fix is "run the migrations", not
// "retry" or "check API keys".
const SCHEMA_MISSING_CODES = new Set(["42P01", "42883"]);

export function isSchemaMissingError(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && SCHEMA_MISSING_CODES.has(error.code));
}
