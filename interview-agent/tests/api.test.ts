import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { InterviewView, SessionView } from "../src/contract/index.ts";
import {
  ALLOWED_ORIGIN,
  closeDb,
  createRequest,
  idem,
  seedBank,
  skipWithoutDb,
  testApp,
} from "./helpers.ts";

after(closeDb);

async function appWithBank(options: Parameters<typeof testApp>[0] = {}) {
  const ctx = await testApp(options);
  const bank = await seedBank(ctx.sql);
  return { ...ctx, bankId: bank.id };
}

describe("platform API", { skip: skipWithoutDb }, () => {
  test("creates an interview, idempotently", async () => {
    const { platform, bankId } = await appWithBank();
    const body = createRequest(bankId);
    const first = await platform("POST", "/v1/platform/interviews", body, idem("create-1"));
    assert.equal(first.status, 201);
    const view = InterviewView.parse(await first.json());
    // No gap probes: nothing candidate-specific to write, so it is ready
    // for its lock at once.
    assert.equal(view.status, "awaiting_review");
    assert.equal(view.job_bank_id, bankId);
    assert.equal(view.bank_locked_at, null);

    const retry = await platform("POST", "/v1/platform/interviews", body, idem("create-1"));
    assert.equal(retry.status, 201);
    assert.equal(InterviewView.parse(await retry.json()).id, view.id);

    const reused = await platform(
      "POST",
      "/v1/platform/interviews",
      createRequest(bankId, { external_ref: "assignment_0002" }),
      idem("create-1")
    );
    assert.equal(reused.status, 409);
    assert.equal((await reused.json()).error, "idempotency_key_reused");

    const duplicate = await platform("POST", "/v1/platform/interviews", body, idem("create-2"));
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, "external_ref_exists");

    const fetched = await platform("GET", `/v1/platform/interviews/${view.id}`);
    assert.equal(fetched.status, 200);
  });

  test("a refused duplicate gives its allowance unit back", async () => {
    const { platform, sql, bankId } = await appWithBank();
    await platform("POST", "/v1/platform/interviews", createRequest(bankId), idem("u-1"));
    await platform("POST", "/v1/platform/interviews", createRequest(bankId), idem("u-2"));
    const [usage] = await sql<{ used: number }[]>`select used from tenant_usage`;
    assert.equal(usage!.used, 1);
  });

  test("requires an idempotency key and a valid body", async () => {
    const { platform, bankId } = await appWithBank();
    assert.equal((await platform("POST", "/v1/platform/interviews", createRequest(bankId))).status, 400);

    const request = createRequest(bankId);
    const withName = { ...request, candidate_profile: { ...request.candidate_profile, full_name: "اسم سري" } };
    const response = await platform("POST", "/v1/platform/interviews", withName, idem("bad-1"));
    assert.equal(response.status, 400);
    const text = await response.text();
    // Validation errors say where, never echo what was sent.
    assert.equal(text.includes("اسم سري"), false);

    // The I0 shape (a job in the request) is no longer accepted: the job
    // comes from the locked bank.
    const legacy = { ...request, job: { title: "x" } };
    assert.equal((await platform("POST", "/v1/platform/interviews", legacy, idem("bad-2"))).status, 400);
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
    assert.equal((await app.request("http://agent.test/v1/platform/job-banks/x")).status, 401);
  });

  test("cancels once and reports it once, keeping the allowance unit", async () => {
    const { platform, sql, bankId } = await appWithBank();
    const created = InterviewView.parse(await (await platform("POST", "/v1/platform/interviews", createRequest(bankId), idem("c-1"))).json());

    const cancelled = await platform("POST", `/v1/platform/interviews/${created.id}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(InterviewView.parse(await cancelled.json()).status, "cancelled");
    assert.equal((await platform("POST", `/v1/platform/interviews/${created.id}/cancel`)).status, 200);

    const events = await sql<{ type: string; payload: { status: string; external_ref: string } }[]>`
      select type, payload from webhook_outbox where interview_id = ${created.id} order by id`;
    assert.deepEqual(events.map((e) => e.type), ["interview.planned", "interview.cancelled"]);
    assert.equal(events[1]!.payload.status, "cancelled");
    assert.equal(events[1]!.payload.external_ref, "assignment_0001");

    const audit = await sql`select action from audit_log where interview_id = ${created.id} order by id`;
    assert.deepEqual(audit.map((row) => row.action), ["created", "planning_started", "planned", "cancelled"]);

    // Cancelling is the company's decision: the unit is not given back (D33).
    const [usage] = await sql<{ used: number }[]>`select used from tenant_usage`;
    assert.equal(usage!.used, 1);
  });

  test("erases an interview and everything under it", async () => {
    const { platform, sql, bankId } = await appWithBank();
    const created = InterviewView.parse(await (await platform("POST", "/v1/platform/interviews", createRequest(bankId), idem("d-1"))).json());
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
    const ctx = await appWithBank();
    const created = InterviewView.parse(await (await ctx.platform("POST", "/v1/platform/interviews", createRequest(ctx.bankId), idem("s-1"))).json());
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
    const ctx = await appWithBank({ now: () => new Date(started.getTime() + 10 * 60 * 1000) });
    const request = createRequest(ctx.bankId);
    request.config.accommodations.extra_time_percent = 50;
    const timestamp = Math.floor((started.getTime() + 600_000) / 1000);
    const created = InterviewView.parse(await (await ctx.platform("POST", "/v1/platform/interviews", request, { ...idem("t-1"), timestamp })).json());
    await ctx.sql`update interviews set status = 'in_progress', started_at = ${started} where id = ${created.id}`;
    const token = (await (await ctx.platform("POST", `/v1/platform/interviews/${created.id}/session-token`, { candidate_ref: "c_6f1c2a9b8d7e" }, { timestamp })).json()) as { token: string };
    const view = SessionView.parse(await (await ctx.app.request("http://agent.test/v1/session", { headers: { authorization: `Bearer ${token.token}` } })).json());
    // 30 minutes + 50% = 45 minutes; 10 have passed.
    assert.equal(view.remaining_seconds, 35 * 60);
  });
});
