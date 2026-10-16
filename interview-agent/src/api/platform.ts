// /v1/platform/* — called by the platform only, every request HMAC-signed
// (design §3.2). The platform's interview-gateway Edge Function is the only
// holder of the signing secret.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Sql } from "../db/client.ts";
import type { AppEnv } from "./http.ts";
import { errorReply, idempotent, parseJson, send, UUID_RE } from "./http.ts";
import { verifyRequest } from "../auth/hmac.ts";
import { mintSessionToken, type SessionKeys } from "../auth/session-token.ts";
import {
  CreateInterviewRequest,
  SessionTokenRequest,
  type SessionTokenResponse,
} from "../contract/index.ts";
import {
  bumpSessionEpoch,
  deleteInterview,
  findInterview,
  insertInterview,
  toView,
  transition,
  type InterviewRow,
} from "../db/interviews.ts";
import { acceptsCandidate, canTransition } from "../orchestrator/state-machine.ts";
import { enqueueEvent } from "../webhooks/outbox.ts";

export type PlatformDeps = {
  sql: Sql;
  hmacKeys: ReadonlyMap<string, string>;
  sessionKeys: SessionKeys;
  now: () => Date;
};

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export function platformRoutes(deps: PlatformDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

  // Signature first, then the replay guard. Nothing below this middleware
  // runs for an unsigned, stale, forged or replayed request.
  app.use("*", async (c, next) => {
    const raw = await c.req.text();
    const url = new URL(c.req.url);
    const verdict = await verifyRequest({
      secrets: deps.hmacKeys,
      headers: c.req.raw.headers,
      method: c.req.method,
      path: url.pathname + url.search,
      body: raw,
      nowSeconds: Math.floor(deps.now().getTime() / 1000),
    });
    if (!verdict.ok) return send(c, errorReply(401, "unauthorized", verdict.reason));

    const fresh = await deps.sql`
      insert into request_nonces (nonce) values (${verdict.nonce})
      on conflict do nothing
      returning nonce`;
    if (fresh.length === 0) return send(c, errorReply(401, "unauthorized", "replayed"));

    c.set("rawBody", raw);
    await next();
  });

  app.post("/interviews", async (c) => {
    const key = c.req.header("idempotency-key");
    if (!key || key.length > 200) {
      return send(c, errorReply(400, "idempotency_key_required"));
    }
    const raw = c.get("rawBody");
    const parsed = parseJson(raw, CreateInterviewRequest);
    if (!parsed.ok) return send(c, parsed.reply);

    const reply = await idempotent(deps.sql, "create_interview", key, raw, async () => {
      try {
        const row = await deps.sql.begin((tx) => insertInterview(tx, parsed.data));
        return { status: 201, body: toView(row) };
      } catch (err) {
        if (isUniqueViolation(err)) return errorReply(409, "external_ref_exists");
        throw err;
      }
    });
    return send(c, reply);
  });

  app.get("/interviews/:id", async (c) => {
    const id = c.req.param("id");
    const row = UUID_RE.test(id) ? await findInterview(deps.sql, id) : null;
    if (!row) return send(c, errorReply(404, "not_found"));
    return c.json(toView(row));
  });

  app.post("/interviews/:id/cancel", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const [locked] = await tx<InterviewRow[]>`
        select id from interviews where id = ${id} for update`;
      if (!locked) return errorReply(404, "not_found");
      const row = (await findInterview(tx, id))!;
      // Cancelling twice is not an error, and does not report twice.
      if (row.status === "cancelled") return { status: 200 as const, body: toView(row) };
      if (!canTransition(row.status, "cancelled")) {
        return errorReply(409, "invalid_transition", `cannot cancel from ${row.status}`);
      }
      const moved = (await transition(tx, id, row.status, "cancelled", "platform", "cancelled"))!;
      await enqueueEvent(tx, {
        type: "interview.cancelled",
        interviewId: id,
        externalRef: moved.external_ref,
        status: moved.status,
      });
      return { status: 200 as const, body: toView(moved) };
    });
    return send(c, reply);
  });

  // Erasure (design §8.1). Idempotent: deleting what is already gone is a
  // success, so the platform's retention job can simply retry.
  app.delete("/interviews/:id", async (c) => {
    const id = c.req.param("id");
    if (UUID_RE.test(id)) await deleteInterview(deps.sql, id);
    return c.body(null, 204);
  });

  // Issued only after the platform has verified that the signed-in user owns
  // this interview; the candidate_ref must match what the interview was
  // created with, so a platform bug cannot hand one candidate another's room.
  app.post("/interviews/:id/session-token", async (c) => {
    const id = c.req.param("id");
    const parsed = parseJson(c.get("rawBody"), SessionTokenRequest);
    if (!parsed.ok) return send(c, parsed.reply);
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const row = await findInterview(tx, id);
      if (!row) return errorReply(404, "not_found");
      if (row.candidate_ref !== parsed.data.candidate_ref) {
        return errorReply(403, "candidate_mismatch");
      }
      if (!acceptsCandidate(row.status)) {
        return errorReply(409, "not_accepting_candidates", row.status);
      }
      const epoch = await bumpSessionEpoch(tx, id);
      const { token, expiresAt } = await mintSessionToken(
        deps.sessionKeys,
        { interviewId: id, candidateRef: row.candidate_ref, epoch },
        deps.now()
      );
      const body: SessionTokenResponse = { token, expires_at: expiresAt.toISOString() };
      return { status: 200 as const, body };
    });
    return send(c, reply);
  });

  return app;
}
