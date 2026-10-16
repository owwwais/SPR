// Prints a fresh private Ed25519 JWK for SESSION_SIGNING_JWK. Store it as a
// secret in the agent's environment; it never goes in the repository.
import { generateKeyPair } from "jose";
import { exportPrivateJwk } from "../src/auth/session-token.ts";

const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const kid = `session-${new Date().toISOString().slice(0, 10)}`;
console.log(JSON.stringify(await exportPrivateJwk(privateKey, kid)));
