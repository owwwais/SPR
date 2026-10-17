import { z } from "zod";
import { parseKeyring } from "./auth/hmac.ts";

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  // Secrets the platform signs with: "k1:<secret>,k2:<secret>" (two during
  // rotation). Shared with the platform's interview-gateway function.
  PLATFORM_HMAC_KEYS: z.string().min(1),
  // Where events go: the platform's interview-webhook function.
  WEBHOOK_URL: z.url(),
  WEBHOOK_SECRET: z.string().min(32),
  WEBHOOK_KEY_ID: z.string().min(1).default("k1"),
  // Private Ed25519 JWK for candidate session tokens (npm run keygen).
  SESSION_SIGNING_JWK: z.string().min(1),
  // Origins allowed to call /v1/session from a browser (the platform's).
  ALLOWED_ORIGINS: z.string().default(""),
  OUTBOX_POLL_MS: z.coerce.number().int().min(200).default(2000),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // Names only — never print a value from the environment.
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`invalid configuration: ${missing}`);
  }
  const value = parsed.data;
  return {
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    hmacKeys: parseKeyring(value.PLATFORM_HMAC_KEYS),
    webhook: {
      url: value.WEBHOOK_URL,
      secret: value.WEBHOOK_SECRET,
      keyId: value.WEBHOOK_KEY_ID,
    },
    sessionSigningJwk: value.SESSION_SIGNING_JWK,
    allowedOrigins: value.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    outboxPollMs: value.OUTBOX_POLL_MS,
  };
}
