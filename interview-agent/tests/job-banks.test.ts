// A job's core bank end to end: create, generate (fake model, real
// Postgres), review, lock — and every refusal on the way.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { JobBankView, type QuestionContent } from "../src/contract/index.ts";
import { runPlannerOnce } from "../src/planner/worker.ts";
import { computeBankHash, type QuestionRow } from "../src/db/banks.ts";
import { DEFAULT_CEILINGS, type Ceilings } from "../src/orchestrator/budget.ts";
import { BANK_PROMPT_VERSION } from "../src/prompts/bank.ts";
import { FakeLlm } from "./fake-llm.ts";
import {
  closeDb,
  createBankRequest,
  idem,
  jobContext,
  question,
  questions,
  seedBank,
  skipWithoutDb,
  testApp,
  TEXTS,
} from "./helpers.ts";

after(closeDb);

// 25 questions: 20 good ones (2 warm-up, 10 technical, 5 behavioral, 3
// situational) and five the filters must drop — two touching a protected
// category (one only in its expected points), one generic, one
// near-duplicate and one that fails the contract.
function bankResponse(): { questions: unknown[] } {
  const firstTechnical = question("technical", 0);
  return {
    questions: [
      ...questions({ warmup: 2 }),
      ...questions({ technical: 10 }),
      question("technical", 10, { expected_points: ["يذكر عمره وسنوات خبرته"] }),
      { ...firstTechnical, text_ar: firstTechnical.text_ar.replace(".", "؟") },
      ...questions({ behavioral: 5 }),
      question("behavioral", 5, { text_ar: "هل أنت متزوج؟ وكيف توازن بين العمل والحياة؟" }),
      question("behavioral", 6, { text_ar: "حدثنا عن نفسك وعن مسيرتك المهنية باختصار." }),
      ...questions({ situational: 3 }),
      { kind: "situational", text_ar: "سؤال" },
    ],
  };
}

function ceilings(patch: {
  bank?: Partial<Ceilings["bank"]>;
  interview?: Partial<Ceilings["interview"]>;
  dailyGenerations?: number;
}): Ceilings {
  return {
    bank: { ...DEFAULT_CEILINGS.bank, ...patch.bank },
    interview: { ...DEFAULT_CEILINGS.interview, ...patch.interview },
    dailyGenerations: patch.dailyGenerations ?? DEFAULT_CEILINGS.dailyGenerations,
  };
}

async function readBank(platform: Awaited<ReturnType<typeof testApp>>["platform"], id: string) {
  const response = await platform("GET", `/v1/platform/job-banks/${id}`);
  assert.equal(response.status, 200);
  return JobBankView.parse(await response.json());
}

async function createBank(
  ctx: Awaited<ReturnType<typeof testApp>>,
  key = "bank-1",
  body = createBankRequest()
) {
  const response = await ctx.platform("POST", "/v1/platform/job-banks", body, idem(key));
  return { response, body: (await response.json()) as unknown };
}

async function storedQuestions(sql: Awaited<ReturnType<typeof testApp>>["sql"], bankId: string) {
  return sql<QuestionRow[]>`
    select * from bank_questions where job_bank_id = ${bankId} order by position, created_at`;
}

describe("job bank generation", { skip: skipWithoutDb }, () => {
  test("happy path: filtered, stored in order, awaiting review, traced without text", async () => {
    const llm = new FakeLlm([{ json: bankResponse() }]);
    const ctx = await testApp({ llm });
    const { response, body } = await createBank(ctx);
    assert.equal(response.status, 202);
    const created = JobBankView.parse(body);
    assert.equal(created.status, "generating");
    assert.equal(created.version, 1);
    assert.deepEqual(created.questions, []);

    assert.equal(await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings }), 1);
    const bank = await readBank(ctx.platform, created.id);
    assert.equal(bank.status, "awaiting_review");
    assert.equal(bank.failure, null);
    assert.equal(bank.questions.length, 20);
    assert.deepEqual(bank.questions.map((q) => q.position), [...Array(20).keys()]);
    assert.ok(bank.questions.every((q) => q.status === "pending" && q.edited === null));
    const kinds = bank.questions.map((q) => q.original.kind);
    assert.deepEqual(kinds, [
      ...Array(2).fill("warmup"),
      ...Array(10).fill("technical"),
      ...Array(5).fill("behavioral"),
      ...Array(3).fill("situational"),
    ]);
    assert.equal(bank.regenerations_left, DEFAULT_CEILINGS.bank.regenerations);

    // One call, with the bank prompt and the job inside its delimiters.
    assert.equal(llm.calls.length, 1);
    assert.equal(llm.calls[0]!.tool, "generate_bank");
    assert.equal(llm.calls[0]!.promptVersion, BANK_PROMPT_VERSION);
    assert.match(llm.calls[0]!.user, /<job>[\s\S]*مطوّر واجهات أمامية[\s\S]*<\/job>/);

    const columns = await ctx.sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_name = 'llm_calls' order by column_name`;
    assert.deepEqual(
      columns.map((c) => c.column_name),
      [
        "created_at", "duration_ms", "error_code", "id", "input_sha256", "input_tokens",
        "interview_id", "job_bank_id", "model", "outcome", "output_tokens", "prompt_version", "tool",
      ]
    );
    const calls = await ctx.sql`select * from llm_calls`;
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.job_bank_id, created.id);
    assert.equal(call.interview_id, null);
    assert.equal(call.tool, "generate_bank");
    assert.equal(call.model, "fake-model");
    assert.equal(call.prompt_version, "bank-1.0");
    assert.equal(call.outcome, "ok");
    assert.match(call.input_sha256 as string, /^[0-9a-f]{64}$/);
    assert.equal(call.input_tokens, 1200);
    assert.equal(call.output_tokens, 3400);
    // Nothing from the prompt or the answer is kept (D8).
    const serialized = JSON.stringify(calls);
    for (const fragment of ["مطوّر", "<job>", TEXTS.technical[0]!, "React"]) {
      assert.equal(serialized.includes(fragment), false, `llm_calls holds ${fragment}`);
    }

    // The settled budget is the call's real use, not its reservation.
    const [usage] = await ctx.sql<{ model_calls: number; input_tokens: number; output_tokens: number }[]>`
      select model_calls, input_tokens, output_tokens from job_banks where id = ${created.id}`;
    assert.deepEqual({ ...usage }, { model_calls: 1, input_tokens: 1200, output_tokens: 3400 });

    // Nothing left to do.
    assert.equal(await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings }), 0);
  });

  test("failure path: garbage twice fails the bank, stores nothing, traces both calls", async () => {
    const llm = new FakeLlm([{ text: "not json at all" }, { text: '{"questions": "nope"}' }]);
    const ctx = await testApp({ llm });
    const created = JobBankView.parse((await createBank(ctx)).body);
    assert.equal(await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings }), 2);

    const bank = await readBank(ctx.platform, created.id);
    assert.equal(bank.status, "failed");
    assert.equal(bank.failure, "invalid_output");
    assert.equal(bank.questions.length, 0);
    assert.equal((await storedQuestions(ctx.sql, created.id)).length, 0);
    const calls = await ctx.sql<{ outcome: string; error_code: string }[]>`
      select outcome, error_code from llm_calls where job_bank_id = ${created.id} order by id`;
    assert.deepEqual(
      calls.map((c) => [c.outcome, c.error_code]),
      [["invalid_output", "json_parse"], ["invalid_output", "schema"]]
    );
  });

  test("a second attempt that succeeds is kept", async () => {
    const llm = new FakeLlm([{ text: "{" }, { json: bankResponse() }]);
    const ctx = await testApp({ llm });
    const created = JobBankView.parse((await createBank(ctx)).body);
    assert.equal(await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings }), 2);
    const bank = await readBank(ctx.platform, created.id);
    assert.equal(bank.status, "awaiting_review");
    assert.equal(bank.questions.length, 20);
  });

  test("too few usable questions twice fails as insufficient_questions", async () => {
    const thin = { questions: questions({ warmup: 1, technical: 5, behavioral: 2 }) };
    const llm = new FakeLlm([{ json: thin }, { json: thin }]);
    const ctx = await testApp({ llm });
    const created = JobBankView.parse((await createBank(ctx)).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    const bank = await readBank(ctx.platform, created.id);
    assert.equal(bank.status, "failed");
    assert.equal(bank.failure, "insufficient_questions");
    assert.equal(bank.questions.length, 0);
  });

  test("provider errors fail as model_error, with the HTTP status as the code", async () => {
    const error = Object.assign(new Error("upstream unavailable"), { status: 503 });
    const llm = new FakeLlm([{ error }, { error }]);
    const ctx = await testApp({ llm });
    const created = JobBankView.parse((await createBank(ctx)).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.equal((await readBank(ctx.platform, created.id)).failure, "model_error");
    const codes = await ctx.sql<{ error_code: string }[]>`select error_code from llm_calls order by id`;
    assert.deepEqual(codes.map((c) => c.error_code), ["http_503", "http_503"]);
  });

  test("a failed bank can be retried, and generates again", async () => {
    const llm = new FakeLlm([{ text: "x" }, { text: "y" }]);
    const ctx = await testApp({ llm });
    const created = JobBankView.parse((await createBank(ctx)).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });

    const retried = await ctx.platform("POST", `/v1/platform/job-banks/${created.id}/retry`);
    assert.equal(retried.status, 202);
    const view = JobBankView.parse(await retried.json());
    assert.equal(view.status, "generating");
    assert.equal(view.failure, null);

    llm.push({ json: bankResponse() });
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    const bank = await readBank(ctx.platform, created.id);
    assert.equal(bank.status, "awaiting_review");

    const again = await ctx.platform("POST", `/v1/platform/job-banks/${created.id}/retry`);
    assert.equal(again.status, 409);
    assert.equal((await again.json()).error, "invalid_transition");
  });

  test("the bank's call ceiling holds: the call that would cross it is never made", async () => {
    const llm = new FakeLlm([{ text: "garbage" }, { json: bankResponse() }]);
    const ctx = await testApp({ llm, ceilings: ceilings({ bank: { modelCalls: 1 } }) });
    const created = JobBankView.parse((await createBank(ctx)).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });

    assert.equal(llm.calls.length, 1);
    const bank = await readBank(ctx.platform, created.id);
    assert.equal(bank.status, "failed");
    assert.equal(bank.failure, "budget_exceeded");
    const [row] = await ctx.sql<{ model_calls: number }[]>`select model_calls from job_banks`;
    assert.equal(row!.model_calls, 1);
  });

  test("the token ceiling is reserved up front: a call that could exceed it is refused", async () => {
    const llm = new FakeLlm([{ json: bankResponse() }]);
    const ctx = await testApp({ llm, ceilings: ceilings({ bank: { outputTokens: 1000 } }) });
    const created = JobBankView.parse((await createBank(ctx)).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.equal(llm.calls.length, 0);
    assert.equal((await readBank(ctx.platform, created.id)).failure, "budget_exceeded");
    const [row] = await ctx.sql<{ model_calls: number; output_tokens: number }[]>`
      select model_calls, output_tokens from job_banks`;
    assert.deepEqual({ ...row }, { model_calls: 0, output_tokens: 0 });
  });
});

describe("job bank create refusals", { skip: skipWithoutDb }, () => {
  test("no model key: 503 before anything is created", async () => {
    const ctx = await testApp({ llm: null });
    const { response, body } = await createBank(ctx);
    assert.equal(response.status, 503);
    assert.equal((body as { error: string }).error, "llm_not_configured");
    const [n] = await ctx.sql<{ banks: number; log: number }[]>`
      select (select count(*) from job_banks)::int as banks,
             (select count(*) from tenant_generation_log)::int as log`;
    assert.deepEqual({ ...n }, { banks: 0, log: 0 });
  });

  test("a plan without interviews: 402 and no model call", async () => {
    const llm = new FakeLlm([{ json: bankResponse() }]);
    const ctx = await testApp({ llm });
    const request = createBankRequest({ tenant: { ref: "t_0123456789abcdef0123456789abcdef", monthly_interview_allowance: 0 } });
    const { response, body } = await createBank(ctx, "bank-0", request);
    assert.equal(response.status, 402);
    assert.equal((body as { error: string }).error, "interviews_not_in_plan");
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.equal(llm.calls.length, 0);
    const [n] = await ctx.sql<{ n: number }[]>`select count(*)::int as n from job_banks`;
    assert.equal(n!.n, 0);
  });

  test("an uncapped plan may generate", async () => {
    const ctx = await testApp({ llm: new FakeLlm() });
    const request = createBankRequest({ tenant: { ref: "t_0123456789abcdef0123456789abcdef", monthly_interview_allowance: null } });
    assert.equal((await createBank(ctx, "bank-u", request)).response.status, 202);
  });

  test("idempotent create; a second version waits for the first", async () => {
    const ctx = await testApp({ llm: new FakeLlm() });
    const first = await createBank(ctx, "bank-1");
    const retry = await createBank(ctx, "bank-1");
    assert.equal(retry.response.status, 202);
    assert.equal(JobBankView.parse(retry.body).id, JobBankView.parse(first.body).id);

    const second = await createBank(ctx, "bank-2");
    assert.equal(second.response.status, 409);
    assert.equal((second.body as { error: string }).error, "bank_in_progress");
  });

  test("after a version is locked, the next one is version 2", async () => {
    const ctx = await testApp({ llm: new FakeLlm() });
    await seedBank(ctx.sql, { externalRef: createBankRequest().external_ref });
    const next = await createBank(ctx, "bank-v2");
    assert.equal(next.response.status, 202);
    assert.equal(JobBankView.parse(next.body).version, 2);
  });

  test("ten generation starts per tenant per day, retries included", async () => {
    const llm = new FakeLlm([{ text: "x" }, { text: "y" }]);
    const ctx = await testApp({ llm, ceilings: ceilings({ dailyGenerations: 2 }) });
    const a = JobBankView.parse((await createBank(ctx, "k-a", createBankRequest({ external_ref: "bank_aaaaaaaa" }))).body);
    await runPlannerOnce({ sql: ctx.sql, llm, ceilings: ctx.ceilings });
    assert.equal((await readBank(ctx.platform, a.id)).status, "failed");

    assert.equal((await createBank(ctx, "k-b", createBankRequest({ external_ref: "bank_bbbbbbbb" }))).response.status, 202);
    const third = await createBank(ctx, "k-c", createBankRequest({ external_ref: "bank_cccccccc" }));
    assert.equal(third.response.status, 429);
    assert.equal((third.body as { error: string }).error, "rate_limited");

    const retry = await ctx.platform("POST", `/v1/platform/job-banks/${a.id}/retry`);
    assert.equal(retry.status, 429);
    assert.equal((await retry.json()).error, "rate_limited");
    assert.equal((await readBank(ctx.platform, a.id)).status, "failed");

    // Another tenant has its own limit.
    const other = createBankRequest({
      external_ref: "bank_dddddddd",
      tenant: { ref: "t_fedcba9876543210fedcba9876543210", monthly_interview_allowance: 5 },
    });
    assert.equal((await createBank(ctx, "k-d", other)).response.status, 202);
  });

  test("unknown bank: 404; malformed request: 400", async () => {
    const ctx = await testApp({ llm: new FakeLlm() });
    assert.equal((await ctx.platform("GET", "/v1/platform/job-banks/00000000-0000-4000-8000-000000000000")).status, 404);
    assert.equal((await ctx.platform("GET", "/v1/platform/job-banks/not-a-uuid")).status, 404);
    assert.equal((await ctx.platform("POST", "/v1/platform/job-banks", createBankRequest())).status, 400);
    const bad = { ...createBankRequest(), job: { ...jobContext(), type: "gig" } };
    assert.equal((await ctx.platform("POST", "/v1/platform/job-banks", bad, idem("bad"))).status, 400);
  });
});

describe("job bank review", { skip: skipWithoutDb }, () => {
  async function reviewable(options: Parameters<typeof testApp>[0] = {}) {
    const ctx = await testApp(options);
    const bank = await seedBank(ctx.sql, { lock: false, status: "pending" });
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/job-banks/${bank.id}`, edit);
    return { ...ctx, bank, patch };
  }

  test("an edit is stored beside the original, which never changes", async () => {
    const { bank, patch, sql } = await reviewable();
    const target = bank.questions.find((q) => q.kind === "technical")!;
    const content = question("technical", 12);
    const response = await patch({ op: "edit", question_id: target.id, content });
    assert.equal(response.status, 200);
    const view = JobBankView.parse(await response.json());
    const edited = view.questions.find((q) => q.id === target.id)!;
    assert.deepEqual(edited.edited, content);
    assert.deepEqual(edited.original, target.original);
    assert.equal(edited.status, "approved");
    const [row] = await sql<QuestionRow[]>`select * from bank_questions where id = ${target.id}`;
    assert.deepEqual(row!.original, target.original);
  });

  test("an edit is filtered like a generated question, and keeps its kind", async () => {
    const { bank, patch, platform } = await reviewable();
    const target = bank.questions.find((q) => q.kind === "technical")!;
    const protectedEdit = await patch({
      op: "edit",
      question_id: target.id,
      content: question("technical", 0, { text_ar: "ما جنسيتك، وكم سنة عملت بـ React؟" }),
    });
    assert.equal(protectedEdit.status, 422);
    assert.equal((await protectedEdit.json()).error, "protected_category");

    const generic = await patch({
      op: "edit",
      question_id: target.id,
      content: question("technical", 0, { text_ar: "حدثنا عن نفسك باختصار من فضلك." }),
    });
    assert.equal(generic.status, 422);
    assert.equal((await generic.json()).error, "generic_question");

    const kind = await patch({ op: "edit", question_id: target.id, content: question("behavioral", 0) });
    assert.equal(kind.status, 422);
    assert.equal((await kind.json()).error, "kind_mismatch");

    // Refused edits leave the question exactly as it was.
    const unchanged = (await readBank(platform, bank.id)).questions.find((q) => q.id === target.id)!;
    assert.equal(unchanged.edited, null);
    assert.equal(unchanged.status, "pending");
  });

  test("approve, remove and restore move the status; a removed question cannot be approved", async () => {
    const { bank, patch } = await reviewable();
    const id = bank.questions[0]!.id;
    const status = async (response: Response) => {
      assert.equal(response.status, 200);
      return JobBankView.parse(await response.json()).questions.find((q) => q.id === id)!.status;
    };
    assert.equal(await status(await patch({ op: "approve", question_id: id })), "approved");
    assert.equal(await status(await patch({ op: "remove", question_id: id })), "removed");
    const refused = await patch({ op: "approve", question_id: id });
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).error, "question_not_editable");
    assert.equal(await status(await patch({ op: "restore", question_id: id })), "pending");
    assert.equal(await status(await patch({ op: "restore", question_id: id })), "pending");
    assert.equal((await patch({ op: "approve", question_id: "00000000-0000-4000-8000-000000000000" })).status, 404);
    assert.equal((await patch({ op: "approve" })).status, 400);
  });

  test("regenerate: one call, the old question removed and linked, the new one pending in its place", async () => {
    const llm = new FakeLlm([{ json: { questions: [question("technical", 13)] } }]);
    const { bank, patch, sql } = await reviewable({ llm });
    const target = bank.questions.find((q) => q.kind === "technical")!;
    const response = await patch({ op: "regenerate", question_id: target.id });
    assert.equal(response.status, 200);
    const view = JobBankView.parse(await response.json());

    const old = view.questions.find((q) => q.id === target.id)!;
    assert.equal(old.status, "removed");
    const fresh = view.questions.find((q) => q.replaces === target.id)!;
    assert.equal(fresh.status, "pending");
    assert.equal(fresh.position, target.position);
    assert.deepEqual(fresh.original, question("technical", 13));
    assert.equal(view.questions.length, bank.questions.length + 1);
    assert.equal(view.regenerations_left, DEFAULT_CEILINGS.bank.regenerations - 1);

    assert.equal(llm.calls.length, 1);
    assert.equal(llm.calls[0]!.tool, "regenerate_question");
    // The model is shown what already exists, so it does not repeat it.
    assert.ok(llm.calls[0]!.user.includes(TEXTS.technical[1]!));
    const [call] = await sql<{ tool: string; job_bank_id: string }[]>`select tool, job_bank_id from llm_calls`;
    assert.deepEqual({ ...call }, { tool: "regenerate_question", job_bank_id: bank.id });
  });

  test("a replacement that repeats the bank or fails the model leaves the original as it was", async () => {
    const llm = new FakeLlm([
      { json: { questions: [question("technical", 1)] } },
      { error: Object.assign(new Error("boom"), { status: 500 }) },
      { json: { questions: [question("behavioral", 2)] } },
    ]);
    const { bank, patch, platform } = await reviewable({ llm });
    const target = bank.questions.find((q) => q.kind === "technical")!;
    for (let i = 0; i < 3; i++) {
      const response = await patch({ op: "regenerate", question_id: target.id });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, "generation_failed");
    }
    const view = await readBank(platform, bank.id);
    assert.equal(view.questions.length, bank.questions.length);
    assert.equal(view.questions.find((q) => q.id === target.id)!.status, "pending");
  });

  test("the regeneration allowance runs out: 429 regeneration_limit", async () => {
    const llm = new FakeLlm([
      { json: { questions: [question("technical", 12)] } },
      { json: { questions: [question("technical", 13)] } },
    ]);
    const { bank, patch } = await reviewable({ llm, ceilings: ceilings({ bank: { regenerations: 2 } }) });
    const technical = bank.questions.filter((q) => q.kind === "technical");
    assert.equal((await patch({ op: "regenerate", question_id: technical[0]!.id })).status, 200);
    const second = await patch({ op: "regenerate", question_id: technical[1]!.id });
    assert.equal(JobBankView.parse(await second.json()).regenerations_left, 0);
    const third = await patch({ op: "regenerate", question_id: technical[2]!.id });
    assert.equal(third.status, 429);
    assert.equal((await third.json()).error, "regeneration_limit");
    assert.equal(llm.calls.length, 2);
  });

  test("regenerate without a model key: 503, nothing spent", async () => {
    const { bank, patch, sql } = await reviewable({ llm: null });
    const response = await patch({ op: "regenerate", question_id: bank.questions[1]!.id });
    assert.equal(response.status, 503);
    const [row] = await sql<{ regenerations: number }[]>`select regenerations from job_banks`;
    assert.equal(row!.regenerations, 0);
  });
});

describe("job bank lock", { skip: skipWithoutDb }, () => {
  test("pending questions block the lock; too few approved block it too", async () => {
    const ctx = await testApp();
    const pending = await seedBank(ctx.sql, { lock: false, status: "pending" });
    const refused = await ctx.platform("POST", `/v1/platform/job-banks/${pending.id}/lock`);
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).error, "pending_questions");

    const small = await seedBank(ctx.sql, {
      externalRef: "bank_small_000001",
      lock: false,
      counts: { warmup: 1, technical: 3, behavioral: 1 },
    });
    const tooFew = await ctx.platform("POST", `/v1/platform/job-banks/${small.id}/lock`);
    assert.equal(tooFew.status, 409);
    assert.equal((await tooFew.json()).error, "too_few_questions");
  });

  test("locking fingerprints the approved set and freezes the bank, in the API and in the database", async () => {
    const ctx = await testApp({ llm: new FakeLlm() });
    const bank = await seedBank(ctx.sql, { lock: false, status: "pending" });
    const patch = (edit: unknown) => ctx.platform("PATCH", `/v1/platform/job-banks/${bank.id}`, edit);
    const [removed, edited, ...rest] = bank.questions;
    await patch({ op: "remove", question_id: removed!.id });
    await patch({ op: "edit", question_id: edited!.id, content: { ...edited!.original, text_ar: "ما آخر أداة تطوير جرّبتها وأعجبتك في عملك؟" } });
    for (const q of rest) await patch({ op: "approve", question_id: q.id });

    const response = await ctx.platform("POST", `/v1/platform/job-banks/${bank.id}/lock`);
    assert.equal(response.status, 200);
    const locked = JobBankView.parse(await response.json());
    assert.equal(locked.status, "locked");
    assert.match(locked.bank_hash!, /^[0-9a-f]{64}$/);
    assert.notEqual(locked.locked_at, null);
    // The hash can be recomputed from what is stored.
    assert.equal(locked.bank_hash, computeBankHash(await storedQuestions(ctx.sql, bank.id)));

    // Locking again answers the same bank.
    const again = JobBankView.parse(await (await ctx.platform("POST", `/v1/platform/job-banks/${bank.id}/lock`)).json());
    assert.equal(again.bank_hash, locked.bank_hash);

    const late = await patch({ op: "approve", question_id: removed!.id });
    assert.equal(late.status, 409);
    assert.equal((await late.json()).error, "bank_locked");
    const lateRegen = await patch({ op: "regenerate", question_id: rest[0]!.id });
    assert.equal(lateRegen.status, 409);
    assert.equal((await lateRegen.json()).error, "bank_locked");
    assert.equal((await ctx.platform("POST", `/v1/platform/job-banks/${bank.id}/retry`)).status, 409);

    // The database refuses on its own, whatever the API does.
    const refusals: [string, () => Promise<unknown>][] = [
      ["update", () => ctx.sql`update bank_questions set status = 'removed' where id = ${rest[0]!.id}`],
      ["edit", () => ctx.sql`update bank_questions set edited = null where id = ${edited!.id}`],
      ["delete", () => ctx.sql`delete from bank_questions where id = ${rest[0]!.id}`],
      [
        "insert",
        () => ctx.sql`
          insert into bank_questions (job_bank_id, position, kind, original)
          values (${bank.id}, 99, 'technical', ${ctx.sql.json(question("technical", 9) as never)})`,
      ],
      ["rehash", () => ctx.sql`update job_banks set bank_hash = ${"b".repeat(64)} where id = ${bank.id}`],
      ["unlock", () => ctx.sql`update job_banks set status = 'awaiting_review', locked_at = null where id = ${bank.id}`],
    ];
    for (const [name, attempt] of refusals) {
      await assert.rejects(attempt, (err: { code?: string }) => err.code === "HKL01", name);
    }
  });

  test("the model's original is immutable even before the lock", async () => {
    const ctx = await testApp();
    const bank = await seedBank(ctx.sql, { lock: false });
    const target = bank.questions[0]!;
    const replacement: QuestionContent = question("warmup", 2);
    await assert.rejects(
      () => ctx.sql`update bank_questions set original = ${ctx.sql.json(replacement as never)} where id = ${target.id}`,
      (err: { code?: string }) => err.code === "HKI01"
    );
    await assert.rejects(
      () => ctx.sql`update bank_questions set kind = 'technical' where id = ${target.id}`,
      (err: { code?: string }) => err.code === "HKI01" || err.code === "23514"
    );
  });
});
