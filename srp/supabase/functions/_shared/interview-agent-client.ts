// Signed calls from the platform to the interview agent (D30). Shared by
// interview-gateway (staff actions) and housekeeping (retention erasure), so
// the signing, the timeout and the key choice live in one place.
//
// Secrets: INTERVIEW_AGENT_URL and INTERVIEW_AGENT_KEYS ("k1:<secret>",
// shared with the agent's PLATFORM_HMAC_KEYS).
import { hmacSha256Hex, parseKeyring, signRequest } from "./interview-hmac.ts";

export type AgentClient = {
  call(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<Response>;
  candidateRef(applicationId: string): Promise<string>;
  tenantRef(orgId: string): Promise<string>;
};

// null when the agent is not configured for this project — callers decide
// whether that is an error (the gateway) or a reason to wait (retention).
export function agentClient(): AgentClient | null {
  const base = Deno.env.get("INTERVIEW_AGENT_URL");
  const keys = Deno.env.get("INTERVIEW_AGENT_KEYS");
  if (!base || !keys) return null;
  const keyring = parseKeyring(keys);
  // The first entry signs; the agent accepts any live one, which is what
  // lets a key be rotated without downtime.
  const [keyId, secret] = keyring.entries().next().value as [string, string];
  const root = new URL(base);

  return {
    async call(method, path, body, idempotencyKey) {
      const url = new URL(path, root);
      const raw = body === undefined ? "" : JSON.stringify(body);
      const headers = await signRequest({
        secret,
        keyId,
        method,
        path: url.pathname + url.search,
        body: raw,
      });
      return fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : raw,
        signal: AbortSignal.timeout(15_000),
      });
    },
    // Stable per application and meaningless without the secret: the agent
    // can tell two sessions are the same candidate, never who they are.
    async candidateRef(applicationId) {
      const digest = await hmacSha256Hex(secret, `candidate:${applicationId}`);
      return `c_${digest.slice(0, 32)}`;
    },
    // Who pays, without saying who (contract TenantContext): the agent counts
    // interviews and checks bank ownership per organization but never learns
    // which one. Its own label and prefix keep it from ever equalling a
    // candidate reference, even for an id that is both an org and an
    // application id. Like candidateRef it is keyed by the signing secret,
    // so rotating that secret changes every reference.
    async tenantRef(orgId) {
      const digest = await hmacSha256Hex(secret, `tenant:${orgId}`);
      return `t_${digest.slice(0, 32)}`;
    },
  };
}
