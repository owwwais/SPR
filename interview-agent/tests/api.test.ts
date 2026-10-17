import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { InterviewView, SessionView } from "../src/contract/index.ts";
import { ALLOWED_ORIGIN, closeDb, createRequest, skipWithoutDb, testApp } from "./helpers.ts";

after(closeDb);

describe("platform API", { skip: skipWithoutDb }, () => {
  test("creates an interview, idempotently", async () => {
    const { platform } = await testApp();
    const body = createRequest();
    const first = await platform("POST", "/v1/platform/interviews", body, { headers: { "idempotency-key": "create-1" } });
    assert.equal(first.status, 201);
    const view = InterviewView.parse(await first.json());
    assert.equal(view.status, "draft");

    const retry = await platform("POST", "/v1/platform/interviews", body, { headers: { "idempotency-key": "create-1" } });
    assert.equal(retry.status, 201);
    assert.equal(InterviewView.parse(await retry.json()).id, view.id);

    const reused = await platform("POST", "/v1/platform/interviews", createRequest({ external_ref: "assignment_0002" }), { headers: { "idempotency-key": "create-1" } });
    assert.equal(reused.status, 409);
    assert.equal((await reused.json()).error, "idempotency_key_reused");

    const duplicate = await platform("POST", "/v1/platform/interviews", body, { headers: { "idempotency-key": "create-2" } });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, "external_ref_exists");

    const fetched = await platform("GET", `/v1/platform/interviews/${view.id}`);
    assert.equal(fetched.status, 200);
  });

  test("requires an idempotency key and a valid body", async () => {
    const { platform } = await testApp();
    assert.equal((await platform("POST", "/v1/platform/interviews", createRequest())).status, 400);

    const request = createRequest();
    const withName = { ...request, candidate_profile: { ...request.candidate_profile, full_name: "اسم سري" } };
    const response = await platform("POST", "/v1/platform/interviews", withName, { headers: { "idempotency-key": "bad-1" } });
    assert.equal(response.status, 400);
    const text = await response.text();
    // Validation errors say where, never echo what was sent.
    assert.equal(text.includes("اسم سري"), false);
  });

  test("refuses forged, stale and replayed requests", async () => {
    const { app, platform } = await testApp();
    assert.equal((await platform("GET", "/v1/platform/interviews/x", undefined, { secret: "wrong-secret-wrong-secret-wrong-secret!!" })).status, 401);
    const stale = await platform("GET", "/v1/platform/interviews/x", undefined, { timestamp: Math.floor(Date.now() / 1000) - 600 });
    assert.equal(stale.status, 401);
    assert.equal((await stale.json()).message, "stale_timestamp");

    const first = await platform("GET", "/v1/platform/interviews/00000000-0000-4000-8000-000000000000", undefined, { nonce: "fixed-nonce-1" });
    assert.equal(first.status, 404);
    const replay = await platform("GET", "/v1/platform/interviews/00000000-0000-4000-8000-000000000000", undefined, { nonce: "fixed-nonce-1" });
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).message, "replayed");

    assert.equal((await app.request("http://agent.test/v1/platform/interviews/x")).status, 401);
  });

  test("cancels once and reports it once", async () => {
    const { platform, sql } = await testApp();
    const created = InterviewView.parse(await (await platform("POST", "/v1/platform/interviews", createRequest(), { headers: { "idempotency-key": "c-1" } })).json());

    const cancelled = await platform("POST", `/v1/platform/interviews/${created.id}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(InterviewView.parse(await cancelled.json()).status, "cancelled");
    assert.equal((await platform("POST", `/v1/platform/interviews/${created.id}/cancel`)).status, 200);

    const events = await sql<{ type: string; payload: { status: string; external_ref: string } }[]>`
      select type, payload from webhook_outbox where interview_id = ${created.id}`;
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, "interview.cancelled");
    assert.equal(events[0]!.payload.status, "cancelled");
    assert.equal(events[0]!.payload.external_ref, "assignment_0001");

    const audit = await sql`select action from audit_log where interview_id = ${created.id} order by id`;
    assert.deepEqual(audit.map((row) => row.action), ["created", "cancelled"]);
  });

  test("erases an interview and everything under it", async () => {
    const { platform, sql } = await testApp();
    const created = InterviewView.parse(await (await platform("POST", "/v1/platform/interviews", createRequest(), { headers: { "idempotency-key": "d-1" } })).json());
    await platform("POST", `/v1/platform/interviews/${created.id}/cancel`);

    assert.equal((await platform("DELETE", `/v1/platform/interviews/${created.id}`)).status, 204);
    assert.equal((await platform("GET", `/v1/platform/interviews/${created.id}`)).status, 404);
    const [left] = await sql<{ n: number }[]>`
      select (select count(*) from audit_log where interview_id = ${created.id})::int
           + (select count(*) from webhook_outbox where interview_id = ${created.id})::int as n`;
    assert.equal(left!.n, 0);
    assert.equal((await platform("DELETE", `/v1/platform/interviews/${created.id}`)).status, 204);
  });
});

describe("candidate sessions", { skip: skipWithoutDb }, () => {
  async function scheduledInterview() {
    const ctx = await testApp();
    const created = InterviewView.parse(await (await ctx.platform("POST", "/v1/platform/interviews", createRequest(), { headers: { "idempotency-key": "s-1" } })).json());
    return { ...ctx, id: created.id };
  }

  test("no session before the interview is scheduled", async () => {
    const { platform, id } = await scheduledInterview();
    const response = await platform("POST", `/v1/platform/interviews/${id}/session-token`, { candidate_ref: "c_6f1c2a9b8d7e" });
    assert.equal(response.status, 409);
  });

  test("a session token works, and a second device supersedes the first", async () => {
    const { app, platform, sql, id } = await scheduledInterview();
    await sql`update interviews set status = 'scheduled' where id = ${id}`;

    const mismatch = await platform("POST", `/v1/platform/interviews/${id}/session-token`, { candidate_ref: "c_someone_else" });
    assert.equal(mismatch.status, 403);

    const first = (await (await platform("POST", `/v1/platform/interviews/${id}/session-token`, { candidate_ref: "c_6f1c2a9b8d7e" })).json()) as { token: string };
    const session = await app.request("http://agent.test/v1/session", { headers: { authorization: `Bearer ${first.token}` } });
    assert.equal(session.status, 200);
    const view = SessionView.parse(await session.json());
    assert.equal(view.status, "scheduled");
    assert.equal(view.remaining_seconds, null);

    const refreshed = await app.request("http://agent.test/v1/session/refresh", { method: "POST", headers: { authorization: `Bearer ${first.token}` } });
    assert.equal(refreshed.status, 200);

    await platform("POST", `/v1/platform/interviews/${id}/session-token`, { candidate_ref: "c_6f1c2a9b8d7e" });
    const superseded = await app.request("http://agent.test/v1/session", { headers: { authorization: `Bearer ${first.token}` } });
    assert.equal(superseded.status, 401);
    assert.equal((await superseded.json()).error, "session_superseded");

    assert.equal((await app.request("http://agent.test/v1/session")).status, 401);
  });

  test("CORS admits the platform origin only", async () => {
    const { app } = await testApp();
    const preflight = (origin: string) =>
      app.request("http://agent.test/v1/session", {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "GET" },
      });
    assert.equal((await preflight(ALLOWED_ORIGIN)).headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
    assert.equal((await preflight("https://evil.example")).headers.get("access-control-allow-origin"), null);
  });

  test("remaining time comes from the server clock and includes accommodations", async () => {
    const started = new Date("2026-10-16T10:00:00Z");
    const ctx = await testApp({ now: () => new Date(started.getTime() + 10 * 60 * 1000) });
    const request = createRequest();
    request.config.accommodations.extra_time_percent = 50;
    const created = InterviewView.parse(await (await ctx.platform("POST", "/v1/platform/interviews", request, { headers: { "idempotency-key": "t-1" }, timestamp: Math.floor((started.getTime() + 600_000) / 1000) })).json());
    await ctx.sql`update interviews set status = 'in_progress', started_at = ${started} where id = ${created.id}`;
    const token = (await (await ctx.platform("POST", `/v1/platform/interviews/${created.id}/session-token`, { candidate_ref: "c_6f1c2a9b8d7e" }, { timestamp: Math.floor((started.getTime() + 600_000) / 1000) })).json()) as { token: string };
    const view = SessionView.parse(await (await ctx.app.request("http://agent.test/v1/session", { headers: { authorization: `Bearer ${token.token}` } })).json());
    // 30 minutes + 50% = 45 minutes; 10 have passed.
    assert.equal(view.remaining_seconds, 35 * 60);
  });
});
