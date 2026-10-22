// Interviews built on a locked bank: create refusals and the allowance
// (D33), gap-probe planning, review, the plan drawn at lock, and erasure.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  InterviewBankView,
  InterviewView,
  type CreateInterviewRequest,
  type InterviewEvent,
} from "../src/contract/index.ts";
import { createPlannerWorker, runPlannerOnce } from "../src/planner/worker.ts";
import { computePlanHash } from "../src/planner/plan.ts";
import type { PlanItem } from "../src/db/interviews.ts";
import { DEFAULT_CEILINGS, type Ceilings } from "../src/orchestrator/budget.ts";
import { GAP_PROMPT_VERSION } from "../src/prompts/gap-probes.ts";
import { FakeLlm } from "./fake-llm.ts";
import {
  closeDb,
  createRequest,
  idem,
  OTHER_TENANT_REF,
  question,
  questions,
  seedBank,
  skipWithoutDb,
  tenant,
  testApp,
  TEXTS,
} from "./helpers.ts";

after(closeDb);

type Ctx = Awaited<ReturnType<typeof testApp>>;

function ceilings(patch: { interview?: Partial<Ceilings["interview"]> }): Ceilings {
  return { ...DEFAULT_CEILINGS, interview: { ...DEFAULT_CEILINGS.interview, ...patch.interview } };
}

// 1 warm-up + 4 technical + 2 behavioral + 2 gap probes.
function withGaps(bankId: string, overrides: Partial<CreateInterviewRequest> = {}): CreateInterviewRequest {
  const base = createRequest(bankId, overrides);
  return {
    ...base,
    config: {
      ...base.config,
      question_count: 9,
      mix: { technical: 4, behavioral: 2, gap_probe: 2, coding: 0, warmup: 1 },
    },
  };
}

function gapResponse(count: number) {
  return { json: { questions: questions({ gap_probe: count }) } };
}

async function create(ctx: Ctx, body: CreateInterviewRequest, key: string) {
  const response = await ctx.platform("POST", "/v1/platform/interviews", body, idem(key));
  return { status: response.status, body: (await response.json()) as { error?: string } };
}

async function counts(ctx: Ctx) {
  const [row] = await ctx.sql<{ interviews: number; used: number }[]>`
    select (select count(*) from interviews)::int as interviews,
           coalesce((select sum(used) from tenant_usage), 0)::int as used`;
  return { ...row! };
}

async function events(ctx: Ctx, interviewId: string) {
  return ctx.sql<{ type: string; payload: InterviewEvent }[]>`
    select type, payload from webhook_outbox where interview_id = ${interviewId} order by id`;
}

async function bankView(ctx: Ctx, interviewId: string) {
  const response = await ctx.platform("GET", `/v1/platform/interviews/${interviewId}/bank`);
  assert.equal(response.status, 200);
  return InterviewBankView.parse(await response.json());
}

// A planned interview with four gap probes awaiting review.
async function plannedInterview(options: Parameters<typeof testApp>[0] = {}) {
  const llm = options.llm instanceof FakeLlm ? options.llm : new FakeLlm();
  const ctx = await testApp({ ...options, llm });
  const bank = await seedBank(ctx.sql);
  llm.push(gapResponse(4));
  const created = await create(ctx, withGaps(bank.id), "planned-1");
  assert.equal(created.status, 201);
  const id = InterviewView.parse(created.body).id;
  await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
  return { ...ctx, llm, bank, id };
}

describe("interview create", { skip: skipWithoutDb }, () => {
  test("every refusal comes before anything is created", async () => {
    const llm = new FakeLlm();
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const unlocked = await seedBank(ctx.sql, { externalRef: "bank_unlocked_01", lock: false });
    const noWarmup = await seedBank(ctx.sql, {
      externalRef: "bank_nowarmup_01",
      counts: { technical: 8, behavioral: 4 },
    });

    const cases: [string, CreateInterviewRequest, number, string][] = [
      ["unknown bank", createRequest("00000000-0000-4000-8000-000000000000"), 404, "not_found"],
      ["another tenant's bank", createRequest(bank.id, { tenant: tenant(10, OTHER_TENANT_REF) }), 403, "tenant_mismatch"],
      ["bank not locked", createRequest(unlocked.id), 409, "bank_not_locked"],
      [
        "coding",
        (() => {
          const r = createRequest(bank.id);
          r.config.mix.coding = 1;
          r.config.question_count = 8;
          return r;
        })(),
        422,
        "coding_unavailable",
      ],
      [
        "voice",
        (() => {
          const r = createRequest(bank.id);
          r.config.modes = ["text", "voice"];
          return r;
        })(),
        422,
        "voice_unavailable",
      ],
      [
        "more technical questions than the bank has",
        (() => {
          const r = createRequest(bank.id);
          r.config.mix.technical = 9;
          r.config.question_count = 12;
          return r;
        })(),
        409,
        "insufficient_bank",
      ],
      [
        "more behavioral questions than behavioral + situational",
        (() => {
          const r = createRequest(bank.id);
          r.config.mix.behavioral = 7;
          r.config.question_count = 12;
          return r;
        })(),
        409,
        "insufficient_bank",
      ],
      ["a warm-up the bank lacks", createRequest(noWarmup.id), 409, "insufficient_bank"],
      ["allowance 0", createRequest(bank.id, { tenant: tenant(0) }), 402, "interviews_not_in_plan"],
    ];
    for (const [name, body, status, error] of cases) {
      const result = await create(ctx, body, `refuse-${name}`);
      assert.equal(result.status, status, name);
      assert.equal(result.body.error, error, name);
    }
    assert.deepEqual(await counts(ctx), { interviews: 0, used: 0 });
    assert.equal(llm.calls.length, 0);
  });

  test("situational questions fill the behavioral share", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql, { counts: { warmup: 1, technical: 4, situational: 2 } });
    assert.equal((await create(ctx, createRequest(bank.id), "sit-1")).status, 201);
  });

  test("allowance 0 with gap probes: 402, and no model call is ever made", async () => {
    const llm = new FakeLlm([gapResponse(4)]);
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const result = await create(ctx, withGaps(bank.id, { tenant: tenant(0) }), "zero-1");
    assert.equal(result.status, 402);
    assert.equal(result.body.error, "interviews_not_in_plan");
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.equal(llm.calls.length, 0);
    assert.deepEqual(await counts(ctx), { interviews: 0, used: 0 });
  });

  test("no model key: gap probes are refused with 503, an interview without them is not", async () => {
    const ctx = await testApp({ llm: null });
    const bank = await seedBank(ctx.sql);
    const refused = await create(ctx, withGaps(bank.id), "nokey-1");
    assert.equal(refused.status, 503);
    assert.equal(refused.body.error, "llm_not_configured");
    assert.deepEqual(await counts(ctx), { interviews: 0, used: 0 });
    assert.equal((await create(ctx, createRequest(bank.id), "nokey-2")).status, 201);
  });

  test("an exhausted allowance: 402 quota_exceeded, nothing created", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql);
    const one = tenant(1);
    assert.equal((await create(ctx, createRequest(bank.id, { tenant: one }), "q-1")).status, 201);
    const second = await create(ctx, createRequest(bank.id, { tenant: one, external_ref: "assignment_0002" }), "q-2");
    assert.equal(second.status, 402);
    assert.equal(second.body.error, "quota_exceeded");
    assert.deepEqual(await counts(ctx), { interviews: 1, used: 1 });
    const [period] = await ctx.sql<{ ok: boolean }[]>`
      select period_start = date_trunc('month', now() at time zone 'utc')::date as ok from tenant_usage`;
    assert.equal(period!.ok, true);
  });

  test("two concurrent creates for the last unit: exactly one wins", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql);
    const two = tenant(2);
    assert.equal((await create(ctx, createRequest(bank.id, { tenant: two }), "c-0")).status, 201);
    const results = await Promise.all([
      create(ctx, createRequest(bank.id, { tenant: two, external_ref: "assignment_000a" }), "c-a"),
      create(ctx, createRequest(bank.id, { tenant: two, external_ref: "assignment_000b" }), "c-b"),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 402]);
    assert.equal(results.find((r) => r.status === 402)!.body.error, "quota_exceeded");
    assert.deepEqual(await counts(ctx), { interviews: 2, used: 2 });
  });

  test("an uncapped plan is still counted", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql);
    const uncapped = tenant(null);
    assert.equal((await create(ctx, createRequest(bank.id, { tenant: uncapped }), "n-1")).status, 201);
    assert.equal((await create(ctx, createRequest(bank.id, { tenant: uncapped, external_ref: "assignment_0002" }), "n-2")).status, 201);
    assert.deepEqual(await counts(ctx), { interviews: 2, used: 2 });
  });

  test("the interview keeps the bank's job snapshot", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql);
    const view = InterviewView.parse((await create(ctx, createRequest(bank.id), "j-1")).body);
    const [row] = await ctx.sql<{ same: boolean; tenant_ref: string }[]>`
      select i.job = b.job as same, i.tenant_ref from interviews i
      join job_banks b on b.id = i.job_bank_id where i.id = ${view.id}`;
    assert.deepEqual({ ...row }, { same: true, tenant_ref: tenant().ref });
  });
});

describe("gap-probe planning", { skip: skipWithoutDb }, () => {
  test("success: probes stored for review, interview.planned in the outbox", async () => {
    const llm = new FakeLlm([
      { json: { questions: [...questions({ gap_probe: 4 }), question("technical", 0)] } },
    ]);
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "p-1")).body);
    assert.equal(created.status, "planning");

    assert.equal(await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings }), 1);
    const view = InterviewView.parse(await (await ctx.platform("GET", `/v1/platform/interviews/${created.id}`)).json());
    assert.equal(view.status, "awaiting_review");
    assert.equal(view.failure, null);

    const probes = await bankView(ctx, created.id);
    assert.equal(probes.gap_probes.length, 4);
    assert.ok(probes.gap_probes.every((q) => q.original.kind === "gap_probe" && q.status === "pending"));
    assert.equal(probes.job_bank_hash, bank.bank_hash);
    assert.equal(probes.plan, null);
    assert.equal(probes.regenerations_left, DEFAULT_CEILINGS.interview.regenerations);

    // mix.gap_probe + 2 asked for, the profile inside its delimiters.
    assert.equal(llm.calls.length, 1);
    assert.equal(llm.calls[0]!.tool, "generate_gap_probes");
    assert.equal(llm.calls[0]!.promptVersion, GAP_PROMPT_VERSION);
    assert.match(llm.calls[0]!.user, /exactly 4 gap_probe questions/);
    assert.match(llm.calls[0]!.user, /<candidate_profile>[\s\S]*<\/candidate_profile>/);

    const outbox = await events(ctx, created.id);
    assert.deepEqual(outbox.map((e) => e.type), ["interview.planned"]);
    assert.equal(outbox[0]!.payload.status, "awaiting_review");
    assert.deepEqual(outbox[0]!.payload.data, { gap_probes: 4 });

    const calls = await ctx.sql<{ interview_id: string; tool: string }[]>`select interview_id, tool from llm_calls`;
    assert.deepEqual(calls.map((c) => ({ ...c })), [{ interview_id: created.id, tool: "generate_gap_probes" }]);
  });

  test("failure: failed, reported, and the allowance unit given back", async () => {
    const llm = new FakeLlm([{ text: "[]" }, { text: "oops" }]);
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id, { tenant: tenant(1) }), "f-1")).body);
    assert.deepEqual(await counts(ctx), { interviews: 1, used: 1 });

    assert.equal(await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings }), 2);
    const view = InterviewView.parse(await (await ctx.platform("GET", `/v1/platform/interviews/${created.id}`)).json());
    assert.equal(view.status, "failed");
    assert.equal(view.failure, "invalid_output");
    assert.deepEqual(await counts(ctx), { interviews: 1, used: 0 });
    assert.equal((await bankView(ctx, created.id)).gap_probes.length, 0);

    const outbox = await events(ctx, created.id);
    assert.deepEqual(outbox.map((e) => e.type), ["interview.failed"]);
    assert.equal(outbox[0]!.payload.status, "failed");
    assert.deepEqual(outbox[0]!.payload.data, { reason: "invalid_output" });

    // The unit is back: the tenant may create another interview.
    llm.push(gapResponse(4));
    const again = await create(ctx, withGaps(bank.id, { tenant: tenant(1), external_ref: "assignment_0002" }), "f-2");
    assert.equal(again.status, 201);
  });

  test("a mix that needs more than the usual cap is asked for in full", async () => {
    const llm = new FakeLlm([{ text: "x" }, { text: "y" }]);
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const request = createRequest(bank.id);
    request.config.mix = { technical: 2, behavioral: 0, gap_probe: 12, coding: 0, warmup: 1 };
    request.config.question_count = 15;
    assert.equal((await create(ctx, request, "big-1")).status, 201);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.match(llm.calls[0]!.user, /exactly 12 gap_probe questions/);
  });

  test("too few probes survive the filters twice: insufficient_questions", async () => {
    const thin = {
      json: { questions: [question("gap_probe", 0), question("gap_probe", 1, { text_ar: "ما ديانتك وهل تؤثر في عملك؟" })] },
    };
    const llm = new FakeLlm([thin, thin]);
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "t-1")).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    const [row] = await ctx.sql<{ status: string; failure: string }[]>`
      select status, failure from interviews where id = ${created.id}`;
    assert.deepEqual({ ...row }, { status: "failed", failure: "insufficient_questions" });
  });

  test("the interview's call ceiling holds, and a refused call releases the unit", async () => {
    const llm = new FakeLlm([{ text: "garbage" }, gapResponse(4)]);
    const ctx = await testApp({ llm, ceilings: ceilings({ interview: { modelCalls: 1 } }) });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "b-1")).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.equal(llm.calls.length, 1);
    const [row] = await ctx.sql<{ status: string; failure: string; model_calls: number }[]>`
      select status, failure, model_calls from interviews where id = ${created.id}`;
    assert.deepEqual({ ...row }, { status: "failed", failure: "budget_exceeded", model_calls: 1 });
    assert.equal((await counts(ctx)).used, 0);
  });

  test("an abandoned last attempt is failed rather than left planning", async () => {
    const llm = new FakeLlm();
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "a-1")).body);
    await ctx.sql`
      update interviews set attempts = 2, lease_until = now() - interval '1 minute'
      where id = ${created.id}`;
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    const [row] = await ctx.sql<{ status: string; failure: string }[]>`
      select status, failure from interviews where id = ${created.id}`;
    assert.deepEqual({ ...row }, { status: "failed", failure: "model_error" });
    assert.equal((await counts(ctx)).used, 0);
    assert.equal(llm.calls.length, 0);
  });

  test("stopping the worker aborts the call and gives the attempt back", async () => {
    const llm = new FakeLlm([
      (request) =>
        new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        }),
    ]);
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "w-1")).body);
    const worker = createPlannerWorker({ sql: ctx.sql, llm, pollMs: 60_000 });
    worker.start();
    for (let i = 0; i < 200 && llm.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(llm.calls.length, 1);
    await worker.stop();
    const [row] = await ctx.sql<{ status: string; attempts: number; lease_until: Date | null }[]>`
      select status, attempts, lease_until from interviews where id = ${created.id}`;
    assert.deepEqual({ ...row }, { status: "planning", attempts: 0, lease_until: null });
  });
});

describe("gap-probe review", { skip: skipWithoutDb }, () => {
  test("edits are stored beside the original and filtered; kinds cannot change", async () => {
    const ctx = await plannedInterview();
    const probes = (await bankView(ctx, ctx.id)).gap_probes;
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/interviews/${ctx.id}/bank`, edit);
    const target = probes[0]!;
    const content = question("gap_probe", 5);
    const edited = await patch({ op: "edit", question_id: target.id, content });
    assert.equal(edited.status, 200);
    const after = InterviewBankView.parse(await edited.json()).gap_probes.find((q) => q.id === target.id)!;
    assert.deepEqual(after.edited, content);
    assert.deepEqual(after.original, target.original);
    assert.equal(after.status, "approved");

    const protectedEdit = await patch({
      op: "edit",
      question_id: target.id,
      content: question("gap_probe", 0, { text_ar: "هل لديك أطفال يؤثرون على تفرغك للعمل؟" }),
    });
    assert.equal(protectedEdit.status, 422);
    assert.equal((await protectedEdit.json()).error, "protected_category");
    const kind = await patch({ op: "edit", question_id: target.id, content: question("technical", 0) });
    assert.equal(kind.status, 422);
    assert.equal((await kind.json()).error, "kind_mismatch");
  });

  test("only this interview's gap probes can be reviewed here", async () => {
    const ctx = await plannedInterview();
    ctx.llm.push(gapResponse(4));
    const other = InterviewView.parse(
      (await create(ctx, withGaps(ctx.bank.id, { external_ref: "assignment_0002" }), "other-1")).body
    );
    await runPlannerOnce({ sql: ctx.sql, llm: ctx.llm, ceilings: ctx.ceilings });
    const foreign = (await bankView(ctx, other.id)).gap_probes[0]!;
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/interviews/${ctx.id}/bank`, edit);
    assert.equal((await patch({ op: "approve", question_id: foreign.id })).status, 404);
    // Core-bank questions were reviewed with the bank and are not editable here.
    assert.equal((await patch({ op: "remove", question_id: ctx.bank.questions[0]!.id })).status, 404);
    assert.equal((await patch({ op: "regenerate", question_id: foreign.id })).status, 404);
  });

  test("regenerate within the interview's allowance, then 429", async () => {
    const ctx = await plannedInterview({ ceilings: ceilings({ interview: { regenerations: 1 } }) });
    const probes = (await bankView(ctx, ctx.id)).gap_probes;
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/interviews/${ctx.id}/bank`, edit);
    ctx.llm.push({ json: { questions: [question("gap_probe", 5)] } });
    const response = await patch({ op: "regenerate", question_id: probes[1]!.id });
    assert.equal(response.status, 200);
    const view = InterviewBankView.parse(await response.json());
    assert.equal(view.gap_probes.find((q) => q.id === probes[1]!.id)!.status, "removed");
    const fresh = view.gap_probes.find((q) => q.replaces === probes[1]!.id)!;
    assert.equal(fresh.status, "pending");
    assert.equal(fresh.position, probes[1]!.position);
    assert.equal(view.regenerations_left, 0);
    assert.equal(ctx.llm.calls.at(-1)!.tool, "regenerate_gap_probe");
    assert.ok(ctx.llm.calls.at(-1)!.user.includes(TEXTS.gap_probe[0]!));

    const limited = await patch({ op: "regenerate", question_id: probes[2]!.id });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, "regeneration_limit");
  });

  test("no review while planning", async () => {
    const llm = new FakeLlm();
    const ctx = await testApp({ llm });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "pl-1")).body);
    const response = await ctx.platform("PATCH", `/v1/platform/interviews/${created.id}/bank`, {
      op: "approve",
      question_id: "00000000-0000-4000-8000-000000000000",
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "invalid_transition");
  });
});

describe("interview bank lock", { skip: skipWithoutDb }, () => {
  test("draws the plan: warm-up first, the mix's counts, core questions from the bank", async () => {
    const ctx = await plannedInterview();
    const probes = (await bankView(ctx, ctx.id)).gap_probes;
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/interviews/${ctx.id}/bank`, edit);
    await patch({ op: "remove", question_id: probes[0]!.id });

    const response = await ctx.platform("POST", `/v1/platform/interviews/${ctx.id}/bank/lock`);
    assert.equal(response.status, 200);
    const view = InterviewBankView.parse(await response.json());
    const plan = view.plan!;
    assert.equal(plan.length, 9);
    assert.equal(plan[0]!.kind, "warmup");
    assert.equal(plan.filter((p) => p.kind === "technical").length, 4);
    assert.equal(plan.filter((p) => p.kind === "behavioral" || p.kind === "situational").length, 2);
    assert.deepEqual(plan.slice(7).map((p) => p.kind), ["gap_probe", "gap_probe"]);

    const coreIds = new Set(ctx.bank.questions.map((q) => q.id));
    assert.ok(plan.slice(0, 7).every((p) => coreIds.has(p.question_id)));
    const liveGapIds = new Set(probes.slice(1).map((q) => q.id));
    assert.ok(plan.slice(7).every((p) => liveGapIds.has(p.question_id)));

    // Pending probes were approved by the lock; the removed one stays removed.
    assert.deepEqual(view.gap_probes.map((q) => q.status).sort(), ["approved", "approved", "approved", "removed"]);
    assert.match(view.plan_hash!, /^[0-9a-f]{64}$/);
    assert.notEqual(view.locked_at, null);
    assert.equal(view.status, "awaiting_review");

    const [row] = await ctx.sql<{ plan: PlanItem[]; plan_hash: string }[]>`
      select plan, plan_hash from interviews where id = ${ctx.id}`;
    assert.equal(row!.plan_hash, computePlanHash(ctx.bank.bank_hash!, row!.plan));
    assert.equal(row!.plan_hash, view.plan_hash);

    const interview = InterviewView.parse(await (await ctx.platform("GET", `/v1/platform/interviews/${ctx.id}`)).json());
    assert.equal(interview.plan_hash, view.plan_hash);
    assert.notEqual(interview.bank_locked_at, null);

    const outbox = await events(ctx, ctx.id);
    assert.deepEqual(outbox.map((e) => e.type), ["interview.planned", "interview.bank_locked"]);
    assert.deepEqual(outbox[1]!.payload.data, { plan_hash: view.plan_hash });

    // Locked: the API refuses, the database refuses, and locking again
    // answers the same plan.
    const late = await patch({ op: "approve", question_id: probes[0]!.id });
    assert.equal(late.status, 409);
    assert.equal((await late.json()).error, "bank_locked");
    const again = InterviewBankView.parse(await (await ctx.platform("POST", `/v1/platform/interviews/${ctx.id}/bank/lock`)).json());
    assert.equal(again.plan_hash, view.plan_hash);
    await assert.rejects(
      () => ctx.sql`update bank_questions set status = 'removed' where id = ${probes[1]!.id}`,
      (err: { code?: string }) => err.code === "HKL01"
    );
    await assert.rejects(
      () => ctx.sql`update interviews set plan_hash = ${"c".repeat(64)} where id = ${ctx.id}`,
      (err: { code?: string }) => err.code === "HKL01"
    );
  });

  test("too few gap probes left: 409 insufficient_bank and nothing changes", async () => {
    const ctx = await plannedInterview();
    const probes = (await bankView(ctx, ctx.id)).gap_probes;
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/interviews/${ctx.id}/bank`, edit);
    for (const q of probes.slice(0, 3)) await patch({ op: "remove", question_id: q.id });
    const response = await ctx.platform("POST", `/v1/platform/interviews/${ctx.id}/bank/lock`);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "insufficient_bank");
    const view = await bankView(ctx, ctx.id);
    assert.equal(view.locked_at, null);
    assert.equal(view.gap_probes.find((q) => q.id === probes[3]!.id)!.status, "pending");
    assert.equal((await events(ctx, ctx.id)).length, 1);
  });

  test("an interview without gap probes locks straight from the core bank", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, createRequest(bank.id), "ng-1")).body);
    const view = InterviewBankView.parse(
      await (await ctx.platform("POST", `/v1/platform/interviews/${created.id}/bank/lock`)).json()
    );
    assert.equal(view.plan!.length, 7);
    assert.equal(view.plan![0]!.kind, "warmup");
    assert.equal(view.gap_probes.length, 0);
  });

  test("no lock while planning", async () => {
    const ctx = await testApp({ llm: new FakeLlm() });
    const bank = await seedBank(ctx.sql);
    const created = InterviewView.parse((await create(ctx, withGaps(bank.id), "lp-1")).body);
    const response = await ctx.platform("POST", `/v1/platform/interviews/${created.id}/bank/lock`);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "invalid_transition");
  });
});

describe("erasure", { skip: skipWithoutDb }, () => {
  test("DELETE removes the interview's gap probes and model-call traces, even after lock", async () => {
    const ctx = await plannedInterview();
    assert.equal((await ctx.platform("POST", `/v1/platform/interviews/${ctx.id}/bank/lock`)).status, 200);
    const before = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from bank_questions where interview_id = ${ctx.id}`;
    assert.equal(before[0]!.n, 4);

    assert.equal((await ctx.platform("DELETE", `/v1/platform/interviews/${ctx.id}`)).status, 204);
    const [left] = await ctx.sql<{ probes: number; calls: number; outbox: number; core: number }[]>`
      select (select count(*) from bank_questions where interview_id = ${ctx.id})::int as probes,
             (select count(*) from llm_calls where interview_id = ${ctx.id})::int as calls,
             (select count(*) from webhook_outbox where interview_id = ${ctx.id})::int as outbox,
             (select count(*) from bank_questions where job_bank_id = ${ctx.bank.id})::int as core`;
    assert.deepEqual({ ...left }, { probes: 0, calls: 0, outbox: 0, core: ctx.bank.questions.length });
  });
});
