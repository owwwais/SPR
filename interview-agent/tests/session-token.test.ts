import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadSessionKeys,
  mintSessionToken,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "../src/auth/session-token.ts";
import { newSessionKeys } from "./helpers.ts";

const claims = { interviewId: "6f1c2a9b-8d7e-4c1a-9b2d-3e4f5a6b7c8d", candidateRef: "c_6f1c2a9b8d7e", epoch: 3 };

test("a minted token verifies and carries its claims", async () => {
  const keys = await newSessionKeys();
  const { token, expiresAt } = await mintSessionToken(keys, claims);
  assert.deepEqual(await verifySessionToken(keys, token), claims);
  assert.ok(expiresAt.getTime() - Date.now() <= SESSION_TTL_SECONDS * 1000);
});

test("an expired token is refused", async () => {
  const keys = await newSessionKeys();
  const issued = new Date("2026-10-16T10:00:00Z");
  const { token } = await mintSessionToken(keys, claims, issued);
  const later = new Date(issued.getTime() + (SESSION_TTL_SECONDS + 5) * 1000);
  await assert.rejects(verifySessionToken(keys, token, later));
});

test("a token from another key or a tampered token is refused", async () => {
  const keys = await newSessionKeys();
  const other = await newSessionKeys();
  const { token } = await mintSessionToken(other, claims);
  await assert.rejects(verifySessionToken(keys, token));
  const own = (await mintSessionToken(keys, claims)).token;
  const [h, p, s] = own.split(".");
  const tampered = [h, Buffer.from(JSON.stringify({ iid: claims.interviewId, ep: 99, sub: claims.candidateRef })).toString("base64url"), s].join(".");
  void p;
  await assert.rejects(verifySessionToken(keys, tampered));
});

test("only a private Ed25519 JWK is accepted as the signing key", async () => {
  await assert.rejects(loadSessionKeys(JSON.stringify({ kty: "oct", k: "abc" })));
});
