// Candidate session tokens (design §3.1). The browser of the candidate talks
// to the agent directly with one of these and holds nothing else: no
// platform secret, no long-lived credential.
//
// - Ed25519-signed JWT, 15 minutes, refreshed while the session is live.
// - Bound to one interview, one opaque candidate ref and one epoch. Minting a
//   new token bumps the interview's epoch, so opening the interview on a
//   second device ends the first one (design §4.4) — the old token still has
//   a valid signature but names an epoch that is no longer current.
import {
  SignJWT,
  exportJWK,
  importJWK,
  jwtVerify,
  type CryptoKey,
  type JWK,
} from "jose";

export const SESSION_ISSUER = "hakeem-interview-agent";
export const SESSION_AUDIENCE = "hakeem-interview-session";
export const SESSION_TTL_SECONDS = 15 * 60;
const ALG = "EdDSA";

export type SessionKeys = {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
};

export type SessionClaims = {
  interviewId: string;
  candidateRef: string;
  epoch: number;
};

// The signing key arrives as a private Ed25519 JWK (see
// scripts/generate-session-key.ts). The public half is derived from it, so
// there is one secret to manage, not two to keep in sync.
export async function loadSessionKeys(privateJwkJson: string): Promise<SessionKeys> {
  const jwk = JSON.parse(privateJwkJson) as JWK;
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d || !jwk.x) {
    throw new Error("SESSION_SIGNING_JWK must be a private Ed25519 JWK");
  }
  const { d: _private, ...publicJwk } = jwk;
  const privateKey = (await importJWK(jwk, ALG)) as CryptoKey;
  const publicKey = (await importJWK(publicJwk, ALG)) as CryptoKey;
  return { kid: jwk.kid ?? "session-1", privateKey, publicKey };
}

export async function mintSessionToken(
  keys: SessionKeys,
  claims: SessionClaims,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((issuedAt + SESSION_TTL_SECONDS) * 1000);
  const token = await new SignJWT({ iid: claims.interviewId, ep: claims.epoch })
    .setProtectedHeader({ alg: ALG, kid: keys.kid, typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(claims.candidateRef)
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(keys.privateKey);
  return { token, expiresAt };
}

// Throws on any failure (signature, issuer, audience, expiry, shape). The
// caller still has to compare the epoch with the interview's current one.
export async function verifySessionToken(
  keys: SessionKeys,
  token: string,
  now: Date = new Date()
): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, keys.publicKey, {
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
    algorithms: [ALG],
    currentDate: now,
  });
  const interviewId = payload.iid;
  const epoch = payload.ep;
  if (
    typeof interviewId !== "string" ||
    typeof epoch !== "number" ||
    typeof payload.sub !== "string"
  ) {
    throw new Error("malformed session token");
  }
  return { interviewId, candidateRef: payload.sub, epoch };
}

export async function exportPrivateJwk(key: CryptoKey, kid: string): Promise<JWK> {
  return { ...(await exportJWK(key)), kid, alg: ALG };
}
