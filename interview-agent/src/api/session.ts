// /v1/session/* — called from the candidate's browser with a session token
// (design §3.3). CORS admits the platform's origin only. I0 covers reading
// the session and refreshing the token; questions and answers arrive in I2.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { Sql } from "../db/client.ts";
import type { AppEnv } from "./http.ts";
import { errorReply, send } from "./http.ts";
import {
  mintSessionToken,
  verifySessionToken,
  type SessionKeys,
} from "../auth/session-token.ts";
import type { SessionTokenResponse, SessionView } from "../contract/index.ts";
import { findInterview } from "../db/interviews.ts";
import { acceptsCandidate } from "../orchestrator/state-machine.ts";
import { remainingSeconds } from "../orchestrator/timing.ts";

export type SessionDeps = {
  sql: Sql;
  sessionKeys: SessionKeys;
  allowedOrigins: readonly string[];
  now: () => Date;
};

export function sessionRoutes(deps: SessionDeps) {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: (origin) => (deps.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST"],
      allowHeaders: ["authorization", "content-type"],
      maxAge: 600,
    })
  );
  app.use("*", bodyLimit({ maxSize: 64 * 1024 }));

  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const header = c.req.header("authorization") ?? "";
    if (!header.startsWith("Bearer ")) return send(c, errorReply(401, "unauthorized"));

    let claims;
    try {
      claims = await verifySessionToken(deps.sessionKeys, header.slice(7), deps.now());
    } catch {
      return send(c, errorReply(401, "unauthorized"));
    }
    const interview = await findInterview(deps.sql, claims.interviewId);
    if (!interview || interview.candidate_ref !== claims.candidateRef) {
      return send(c, errorReply(401, "unauthorized"));
    }
    // A newer token was issued (another device opened the interview).
    if (interview.session_epoch !== claims.epoch) {
      return send(c, errorReply(401, "session_superseded"));
    }
    c.set("session", { claims, interview });
    await next();
  });

  app.get("/", (c) => {
    const { interview } = c.get("session");
    const now = deps.now();
    const view: SessionView = {
      interview_id: interview.id,
      status: interview.status,
      modes: interview.config.modes,
      duration_minutes: interview.config.duration_minutes,
      opens_at: interview.opens_at?.toISOString() ?? null,
      closes_at: interview.closes_at?.toISOString() ?? null,
      server_time: now.toISOString(),
      remaining_seconds: remainingSeconds(interview, now),
    };
    return c.json(view);
  });

  // Same epoch: refreshing keeps this device's session, it does not start a
  // new one.
  app.post("/refresh", async (c) => {
    const { claims, interview } = c.get("session");
    if (!acceptsCandidate(interview.status)) {
      return send(c, errorReply(409, "not_accepting_candidates", interview.status));
    }
    const { token, expiresAt } = await mintSessionToken(deps.sessionKeys, claims, deps.now());
    const body: SessionTokenResponse = { token, expires_at: expiresAt.toISOString() };
    return c.json(body);
  });

  return app;
}
