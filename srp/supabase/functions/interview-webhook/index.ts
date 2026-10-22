// interview-webhook — signed events from the interview agent (D30, design
// §3.4). Deployed with verify_jwt = false (config.toml): the agent holds no
// Supabase credential; the HMAC signature below is the authentication.
//
// Order of checks: signature (with a five-minute timestamp window), then
// schema, then apply_interview_event(), which records the event id and moves
// the status in one transaction. A redelivered event is acknowledged and
// ignored; an older event arriving after a newer one changes nothing.
//
// Secret: INTERVIEW_WEBHOOK_SECRETS ("k1:<secret>"), shared with the agent's
// WEBHOOK_SECRET. Different from the gateway's key on purpose: a leak of one
// direction does not forge the other.
import { createClient } from "@supabase/supabase-js";
import { InterviewEvent } from "../_shared/interview-contract.ts";
import { parseKeyring, verifyRequest } from "../_shared/interview-hmac.ts";

const MAX_BODY_BYTES = 256 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// The agent signs the path of the URL it was given, which includes the
// /functions/v1 prefix. Inside the function the platform may present the
// path with or without that prefix, so both spellings of THIS endpoint are
// accepted — the signature still binds the request to this function.
function candidatePaths(url: URL): string[] {
  const path = url.pathname + url.search;
  const prefixed = path.startsWith("/functions/v1/") ? path : `/functions/v1${path}`;
  return [...new Set([path, prefixed])];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const secrets = Deno.env.get("INTERVIEW_WEBHOOK_SECRETS");
  if (!secrets) {
    console.error("interview-webhook: INTERVIEW_WEBHOOK_SECRETS not set");
    return json(503, { error: "not_configured" });
  }
  const keyring = parseKeyring(secrets);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

  const url = new URL(req.url);
  let verified = false;
  let reason = "bad_signature";
  for (const path of candidatePaths(url)) {
    const verdict = await verifyRequest({
      secrets: keyring,
      headers: req.headers,
      method: req.method,
      path,
      body: raw,
    });
    if (verdict.ok) {
      verified = true;
      break;
    }
    reason = verdict.reason;
  }
  if (!verified) {
    console.error("interview-webhook: rejected", reason);
    return json(401, { error: "unauthorized" });
  }

  let event;
  try {
    event = InterviewEvent.parse(JSON.parse(raw));
  } catch {
    return json(400, { error: "invalid_event" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: outcome, error } = await admin.rpc("apply_interview_event", {
    p_event_id: event.event_id,
    p_type: event.type,
    p_interview_id: event.interview_id,
    p_assignment_id: event.external_ref,
    p_status: event.status,
    p_occurred_at: event.occurred_at,
    // interview.failed carries the planner's failure code; the function
    // stores it only if it looks like a code.
    p_reason:
      event.type === "interview.failed" && typeof event.data.reason === "string"
        ? event.data.reason
        : null,
  });
  if (error) {
    // 500 makes the agent retry with backoff; nothing was recorded.
    console.error("apply_interview_event failed:", error.message);
    return json(500, { error: "apply_failed" });
  }

  // Ids only — events carry no candidate content, and the log never will.
  console.log(`interview event ${event.type} ${event.event_id}: ${outcome}`);
  // 'unknown' is acknowledged too: an interview erased by retention should
  // not keep the agent retrying for nine hours.
  return json(200, { ok: true, outcome });
});
