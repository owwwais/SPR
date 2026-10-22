// Request signing between the platform and the interview agent (D30,
// docs/INTERVIEW-AGENT-DESIGN.md §3.1). Used in both directions: the
// platform signs calls to the agent, the agent signs webhooks to the
// platform, each with its own secret.
//
// THIS FILE EXISTS TWICE, BYTE FOR BYTE:
//   interview-agent/src/auth/hmac.ts                 (source of truth)
//   srp/supabase/functions/_shared/interview-hmac.ts (copy for Deno)
// It uses Web Crypto only, so the same text runs under Node and Deno. Edit
// the first and run `npm run contract:sync`; a test fails if they differ.
//
// Signed string (one field per line):
//   v1 / unix timestamp (seconds) / nonce / METHOD / path+query / sha256(body)
// The timestamp bounds replay to a short window; the nonce lets the receiver
// refuse an exact replay inside that window.

export const SIGNATURE_VERSION = "v1";
export const MAX_SKEW_SECONDS = 300;

export const HEADER_KEY_ID = "x-hakeem-key-id";
export const HEADER_TIMESTAMP = "x-hakeem-timestamp";
export const HEADER_NONCE = "x-hakeem-nonce";
export const HEADER_SIGNATURE = "x-hakeem-signature";

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

export async function hmacSha256Hex(
  secret: string,
  message: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export function canonicalString(parts: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodyHash: string;
}): string {
  return [
    SIGNATURE_VERSION,
    parts.timestamp,
    parts.nonce,
    parts.method.toUpperCase(),
    parts.path,
    parts.bodyHash,
  ].join("\n");
}

// Constant-time comparison: the time taken must not reveal how many leading
// characters of a forged signature were right.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function signRequest(input: {
  secret: string;
  keyId: string;
  method: string;
  path: string;
  body: string;
  timestamp?: number;
  nonce?: string;
}): Promise<Record<string, string>> {
  const timestamp = String(
    input.timestamp ?? Math.floor(Date.now() / 1000)
  );
  const nonce = input.nonce ?? randomNonce();
  const signature = await hmacSha256Hex(
    input.secret,
    canonicalString({
      timestamp,
      nonce,
      method: input.method,
      path: input.path,
      bodyHash: await sha256Hex(input.body),
    })
  );
  return {
    [HEADER_KEY_ID]: input.keyId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: `${SIGNATURE_VERSION}=${signature}`,
  };
}

export type VerifyResult =
  | { ok: true; keyId: string; nonce: string }
  | {
      ok: false;
      reason:
        | "missing_headers"
        | "unknown_key"
        | "stale_timestamp"
        | "bad_signature";
    };

// `secrets` maps key id -> secret, so two keys can be live during rotation.
export async function verifyRequest(input: {
  secrets: ReadonlyMap<string, string>;
  headers: { get(name: string): string | null };
  method: string;
  path: string;
  body: string;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const keyId = input.headers.get(HEADER_KEY_ID);
  const timestamp = input.headers.get(HEADER_TIMESTAMP);
  const nonce = input.headers.get(HEADER_NONCE);
  const signature = input.headers.get(HEADER_SIGNATURE);
  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, reason: "missing_headers" };
  }

  const secret = input.secrets.get(keyId);
  if (!secret) return { ok: false, reason: "unknown_key" };

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now - ts) > MAX_SKEW_SECONDS
  ) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = await hmacSha256Hex(
    secret,
    canonicalString({
      timestamp,
      nonce,
      method: input.method,
      path: input.path,
      bodyHash: await sha256Hex(input.body),
    })
  );
  if (!timingSafeEqual(signature, `${SIGNATURE_VERSION}=${expected}`)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, keyId, nonce };
}

// "k1:secret,k2:secret" -> Map. Secrets shorter than 32 characters are
// refused outright rather than accepted and regretted.
export function parseKeyring(value: string): Map<string, string> {
  const keyring = new Map<string, string>();
  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    const id = trimmed.slice(0, separator);
    const secret = trimmed.slice(separator + 1);
    if (separator < 1 || secret.length < 32) {
      throw new Error("keyring entries must be id:secret with a 32+ char secret");
    }
    keyring.set(id, secret);
  }
  if (keyring.size === 0) throw new Error("keyring is empty");
  return keyring;
}
