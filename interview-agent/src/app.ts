import { Hono } from "hono";
import type { Sql } from "./db/client.ts";
import type { SessionKeys } from "./auth/session-token.ts";
import type { AppEnv } from "./api/http.ts";
import { errorReply, send } from "./api/http.ts";
import { platformRoutes } from "./api/platform.ts";
import { sessionRoutes } from "./api/session.ts";
import { CONTRACT_VERSION } from "./contract/index.ts";
import { InvalidTransitionError } from "./orchestrator/state-machine.ts";
import { log } from "./lib/log.ts";

export type AppDeps = {
  sql: Sql;
  hmacKeys: ReadonlyMap<string, string>;
  sessionKeys: SessionKeys;
  allowedOrigins: readonly string[];
  now?: () => Date;
};

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ ok: true, contract: CONTRACT_VERSION }));
  app.get("/health/ready", async (c) => {
    await deps.sql`select 1`;
    return c.json({ ok: true });
  });

  app.route("/v1/platform", platformRoutes({ ...deps, now }));
  app.route("/v1/session", sessionRoutes({ ...deps, now }));

  app.notFound((c) => send(c, errorReply(404, "not_found")));
  app.onError((err, c) => {
    if (err instanceof InvalidTransitionError) {
      return send(c, errorReply(409, "invalid_transition", err.message));
    }
    // The message only: request bodies can carry CV content (D8 parity).
    log.error("unhandled error", { path: c.req.path, error: err.message.slice(0, 300) });
    return send(c, errorReply(500, "internal"));
  });

  return app;
}
