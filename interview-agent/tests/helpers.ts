import { generateKeyPair } from "jose";
import { signRequest } from "../src/auth/hmac.ts";
import { exportPrivateJwk, loadSessionKeys, type SessionKeys } from "../src/auth/session-token.ts";
import { createApp } from "../src/app.ts";
import { createSql, type Sql } from "../src/db/client.ts";
import { migrate } from "../src/db/migrate.ts";
import type { CreateInterviewRequest } from "../src/contract/index.ts";

export const PLATFORM_KEY_ID = "k1";
export const PLATFORM_SECRET = "platform-secret-for-tests-0123456789abcdef";
export const ALLOWED_ORIGIN = "https://hakeem.example";

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const skipWithoutDb = hasDatabase ? false : "DATABASE_URL not set (run npm test)";

export async function newSessionKeys(): Promise<SessionKeys> {
  const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  return loadSessionKeys(JSON.stringify(await exportPrivateJwk(privateKey, "test-key")));
}

let shared: Sql | null = null;
export async function testDb(): Promise<Sql> {
  if (!shared) {
    shared = createSql(process.env.DATABASE_URL!, 4);
    await migrate(shared);
  }
  await shared`
    truncate interviews, audit_log, webhook_outbox, idempotency_keys, request_nonces
    restart identity cascade`;
  return shared;
}
export async function closeDb() {
  await shared?.end();
  shared = null;
}

export async function testApp(options: { now?: () => Date } = {}) {
  const sql = await testDb();
  const sessionKeys = await newSessionKeys();
  const app = createApp({
    sql,
    hmacKeys: new Map([[PLATFORM_KEY_ID, PLATFORM_SECRET]]),
    sessionKeys,
    allowedOrigins: [ALLOWED_ORIGIN],
    now: options.now,
  });

  async function platform(
    method: string,
    path: string,
    body?: unknown,
    extra: { headers?: Record<string, string>; secret?: string; timestamp?: number; nonce?: string } = {}
  ) {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const signed = await signRequest({
      secret: extra.secret ?? PLATFORM_SECRET,
      keyId: PLATFORM_KEY_ID,
      method,
      path,
      body: raw,
      timestamp: extra.timestamp,
      nonce: extra.nonce,
    });
    return app.request(`http://agent.test${path}`, {
      method,
      headers: { "content-type": "application/json", ...signed, ...extra.headers },
      body: body === undefined ? undefined : raw,
    });
  }

  return { app, sql, sessionKeys, platform };
}

export function createRequest(overrides: Partial<CreateInterviewRequest> = {}): CreateInterviewRequest {
  return {
    external_ref: "assignment_0001",
    candidate_ref: "c_6f1c2a9b8d7e",
    job: {
      title: "مطوّر واجهات أمامية",
      type: "full_time",
      location: "الرياض",
      min_years_experience: 3,
      skills: ["React", "TypeScript"],
      requirements: "خبرة لا تقل عن ثلاث سنوات في React.",
      description: "تطوير واجهات المنتج.",
    },
    candidate_profile: {
      total_years_experience: 4,
      experiences: [
        { title: "مطوّر واجهات", company: null, start: "2021-01", end: null, summary: "React" },
      ],
      education: [{ degree: "بكالوريوس", field: "علوم الحاسب", institution: null, year: "2020" }],
      skills: ["React", "TypeScript"],
      languages: ["العربية", "English"],
      cv_language: "ar",
    },
    config: {
      question_count: 10,
      mix: { technical: 4, behavioral: 2, gap_probe: 2, coding: 1, warmup: 1 },
      modes: ["text", "voice"],
      duration_minutes: 30,
      language: "ar",
      paste_policy: "record",
      candidate_result: "completion",
      accommodations: { extra_time_percent: 0 },
    },
    ...overrides,
  };
}
