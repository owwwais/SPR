// Process entry: configuration, database, HTTP server, the event and
// planner workers, and a graceful stop. Migrations run separately (npm run
// migrate) so a deploy can apply them once rather than every instance
// racing at boot.
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createSql } from "./db/client.ts";
import { loadSessionKeys } from "./auth/session-token.ts";
import { createOutboxWorker } from "./webhooks/outbox.ts";
import { createGeminiClient } from "./llm/gemini.ts";
import { createPlannerWorker } from "./planner/worker.ts";
import { log } from "./lib/log.ts";

const config = loadConfig();
const sql = createSql(config.databaseUrl);
const sessionKeys = await loadSessionKeys(config.sessionSigningJwk);
const llm = config.geminiApiKey ? createGeminiClient(config.geminiApiKey) : null;
if (!llm) {
  log.warn("GEMINI_API_KEY is not set: question generation is unavailable");
}

const app = createApp({
  sql,
  hmacKeys: config.hmacKeys,
  sessionKeys,
  allowedOrigins: config.allowedOrigins,
  llm,
});

const worker = createOutboxWorker({
  sql,
  url: config.webhook.url,
  secret: config.webhook.secret,
  keyId: config.webhook.keyId,
  pollMs: config.outboxPollMs,
});

const planner = createPlannerWorker({ sql, llm, pollMs: config.plannerPollMs });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info("interview-agent listening", { port: info.port, llm: llm !== null });
});
worker.start();
planner.start();

// Expired nonces are useless past the signature window; sweep them hourly.
const sweeper = setInterval(() => {
  sql`delete from request_nonces where seen_at < now() - interval '15 minutes'`.catch(
    (err: Error) => log.warn("nonce sweep failed", { error: err.message })
  );
}, 60 * 60 * 1000);

async function shutdown(signal: string) {
  log.info("shutting down", { signal });
  worker.stop();
  clearInterval(sweeper);
  server.close();
  // An in-flight generation is aborted and its attempt given back, so the
  // next instance picks it up; wait for that before closing the pool.
  await planner.stop();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
