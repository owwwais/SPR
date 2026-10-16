import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  HEADER_NONCE,
  HEADER_SIGNATURE,
  parseKeyring,
  signRequest,
  verifyRequest,
} from "../src/auth/hmac.ts";

const SECRET = "s".repeat(40);
const keys = new Map([["k1", SECRET]]);
const NOW = 1_800_000_000;

function headersOf(record: Record<string, string>) {
  return new Headers(record);
}

test("signature matches an independent node:crypto implementation", async () => {
  const body = JSON.stringify({ hello: "مرحبا" });
  const signed = await signRequest({
    secret: SECRET, keyId: "k1", method: "post", path: "/v1/platform/interviews?x=1",
    body, timestamp: NOW, nonce: "abc123",
  });
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = ["v1", String(NOW), "abc123", "POST", "/v1/platform/interviews?x=1", bodyHash].join("\n");
  const expected = createHmac("sha256", SECRET).update(canonical, "utf8").digest("hex");
  assert.equal(signed[HEADER_SIGNATURE], `v1=${expected}`);
});

test("a correct signature verifies", async () => {
  const signed = await signRequest({ secret: SECRET, keyId: "k1", method: "POST", path: "/p", body: "{}", timestamp: NOW });
  const result = await verifyRequest({ secrets: keys, headers: headersOf(signed), method: "POST", path: "/p", body: "{}", nowSeconds: NOW + 10 });
  assert.equal(result.ok, true);
});

test("tampering with body, path or method fails", async () => {
  const signed = await signRequest({ secret: SECRET, keyId: "k1", method: "POST", path: "/p", body: "{}", timestamp: NOW });
  for (const [method, path, body] of [["POST", "/p", "{ }"], ["POST", "/q", "{}"], ["PUT", "/p", "{}"]] as const) {
    const result = await verifyRequest({ secrets: keys, headers: headersOf(signed), method, path, body, nowSeconds: NOW });
    assert.deepEqual(result, { ok: false, reason: "bad_signature" });
  }
});

test("a timestamp outside five minutes is stale", async () => {
  const signed = await signRequest({ secret: SECRET, keyId: "k1", method: "GET", path: "/p", body: "", timestamp: NOW });
  const result = await verifyRequest({ secrets: keys, headers: headersOf(signed), method: "GET", path: "/p", body: "", nowSeconds: NOW + 301 });
  assert.deepEqual(result, { ok: false, reason: "stale_timestamp" });
});

test("unknown key and missing headers are refused", async () => {
  const signed = await signRequest({ secret: SECRET, keyId: "k9", method: "GET", path: "/p", body: "", timestamp: NOW });
  assert.deepEqual(
    await verifyRequest({ secrets: keys, headers: headersOf(signed), method: "GET", path: "/p", body: "", nowSeconds: NOW }),
    { ok: false, reason: "unknown_key" }
  );
  const { [HEADER_NONCE]: _nonce, ...withoutNonce } = signed;
  assert.deepEqual(
    await verifyRequest({ secrets: keys, headers: headersOf(withoutNonce), method: "GET", path: "/p", body: "", nowSeconds: NOW }),
    { ok: false, reason: "missing_headers" }
  );
});

test("keyrings refuse short secrets and empty input", () => {
  assert.throws(() => parseKeyring("k1:short"));
  assert.throws(() => parseKeyring(""));
  assert.equal(parseKeyring(`k1:${SECRET}, k2:${SECRET}`).size, 2);
});
