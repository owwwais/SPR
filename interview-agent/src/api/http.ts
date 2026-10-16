import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import { jsonb, type Sql } from "../db/client.ts";
import { sha256Hex } from "../auth/hmac.ts";
import type { InterviewRow } from "../db/interviews.ts";
import type { SessionClaims } from "../auth/session-token.ts";

export type AppEnv = {
  Variables: {
    rawBody: string;
    session: { claims: SessionClaims; interview: InterviewRow };
  };
};

export type Reply = { status: ContentfulStatusCode; body: unknown };

export function errorReply(
  status: ContentfulStatusCode,
  error: string,
  message?: string
): Reply {
  return { status, body: message ? { error, message } : { error } };
}

export function send(c: Context, reply: Reply) {
  return c.json(reply.body as object, reply.status);
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parses the already-verified raw body. Validation errors report where and
// what, never the submitted values — those can be CV content.
export function parseJson<T extends z.ZodType>(
  raw: string,
  schema: T
): { ok: true; data: z.infer<T> } | { ok: false; reply: Reply } {
  let value: unknown;
  try {
    value = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return { ok: false, reply: errorReply(400, "invalid_json") };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, reply: errorReply(400, "invalid_request", message) };
  }
  return { ok: true, data: parsed.data };
}

// Runs `handler` once per Idempotency-Key. A retry with the same key and the
// same body gets the stored reply; the same key with a different body is a
// client bug and is refused. If the handler throws, the key is released so
// the platform can retry.
export async function idempotent(
  sql: Sql,
  scope: string,
  key: string,
  rawBody: string,
  handler: () => Promise<Reply>
): Promise<Reply> {
  const storageKey = `${scope}:${key}`;
  const requestHash = await sha256Hex(rawBody);

  const claimed = await sql`
    insert into idempotency_keys (key, request_hash)
    values (${storageKey}, ${requestHash})
    on conflict (key) do nothing
    returning key`;

  if (claimed.length === 0) {
    const [existing] = await sql<
      { request_hash: string; response_status: number | null; response_body: unknown }[]
    >`select request_hash, response_status, response_body
      from idempotency_keys where key = ${storageKey}`;
    if (!existing || existing.request_hash !== requestHash) {
      return errorReply(409, "idempotency_key_reused");
    }
    if (existing.response_status === null) {
      return errorReply(409, "request_in_progress");
    }
    return {
      status: existing.response_status as ContentfulStatusCode,
      body: existing.response_body,
    };
  }

  try {
    const reply = await handler();
    await sql`
      update idempotency_keys
      set response_status = ${reply.status},
          response_body = ${sql.json(jsonb(reply.body))}
      where key = ${storageKey}`;
    return reply;
  } catch (err) {
    await sql`delete from idempotency_keys where key = ${storageKey}`;
    throw err;
  }
}
