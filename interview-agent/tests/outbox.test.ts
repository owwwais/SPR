import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { verifyRequest } from "../src/auth/hmac.ts";
import { InterviewEvent } from "../src/contract/index.ts";
import { backoffSeconds, createOutboxWorker, enqueueEvent, MAX_ATTEMPTS } from "../src/webhooks/outbox.ts";
import { closeDb, createRequest, skipWithoutDb, testDb } from "./helpers.ts";
import { insertInterview } from "../src/db/interviews.ts";

const WEBHOOK_SECRET = "webhook-secret-for-tests-0123456789abcdef";

after(closeDb);

test("backoff doubles and caps at an hour", () => {
  assert.deepEqual([1, 2, 3, 4].map(backoffSeconds), [10, 20, 40, 80]);
  assert.equal(backoffSeconds(30), 3600);
});

describe("webhook outbox", { skip: skipWithoutDb }, () => {
  let server: Server | null = null;
  after(() => server?.close());

  test("delivers signed events, retrying after a failure", async () => {
    const sql = await testDb();
    const received: unknown[] = [];
    const statuses = [500, 200];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        const verdict = await verifyRequest({
          secrets: new Map([["k1", WEBHOOK_SECRET]]),
          headers: { get: (name) => (req.headers[name] as string | undefined) ?? null },
          method: req.method!,
          path: req.url!,
          body,
        });
        if (!verdict.ok) {
          res.writeHead(401).end();
          return;
        }
        received.push(JSON.parse(body));
        res.writeHead(statuses.shift() ?? 200).end();
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const row = await sql.begin((tx) => insertInterview(tx, createRequest()));
    await sql.begin((tx) =>
      enqueueEvent(tx, { type: "interview.cancelled", interviewId: row.id, externalRef: row.external_ref, status: "cancelled" })
    );

    const worker = createOutboxWorker({ sql, url: `http://127.0.0.1:${port}/functions/v1/interview-webhook?v=1`, secret: WEBHOOK_SECRET, keyId: "k1", pollMs: 1000 });

    assert.equal(await worker.tick(), 1);
    const [afterFailure] = await sql<{ attempts: number; delivered_at: Date | null; last_error: string; next_attempt_at: Date }[]>`
      select attempts, delivered_at, last_error, next_attempt_at from webhook_outbox`;
    assert.equal(afterFailure!.attempts, 1);
    assert.equal(afterFailure!.delivered_at, null);
    assert.equal(afterFailure!.last_error, "http 500");
    assert.ok(afterFailure!.next_attempt_at.getTime() > Date.now());

    // Not due yet: nothing is attempted.
    assert.equal(await worker.tick(), 0);

    await sql`update webhook_outbox set next_attempt_at = now()`;
    assert.equal(await worker.tick(), 1);
    const [delivered] = await sql<{ attempts: number; delivered_at: Date | null }[]>`select attempts, delivered_at from webhook_outbox`;
    assert.equal(delivered!.attempts, 2);
    assert.notEqual(delivered!.delivered_at, null);

    assert.equal(received.length, 2);
    const event = InterviewEvent.parse(received[1]);
    assert.equal(event.type, "interview.cancelled");
    assert.equal(event.interview_id, row.id);
  });

  test("an event that keeps failing is eventually declared dead", async () => {
    const sql = await testDb();
    const row = await sql.begin((tx) => insertInterview(tx, createRequest()));
    await sql.begin((tx) =>
      enqueueEvent(tx, { type: "interview.cancelled", interviewId: row.id, externalRef: row.external_ref, status: "cancelled" })
    );
    await sql`update webhook_outbox set attempts = ${MAX_ATTEMPTS - 1}`;
    const worker = createOutboxWorker({
      sql, url: "http://127.0.0.1:9/unreachable", secret: WEBHOOK_SECRET, keyId: "k1", pollMs: 1000,
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    await worker.tick();
    const [dead] = await sql<{ dead_at: Date | null }[]>`select dead_at from webhook_outbox`;
    assert.notEqual(dead!.dead_at, null);
    await sql`update webhook_outbox set next_attempt_at = now()`;
    assert.equal(await worker.tick(), 0);
  });
});
