// callTool(): the one wrapper every model call goes through.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { callTool, LlmCallError } from "../src/llm/run.ts";
import { purgeOldLlmCalls } from "../src/planner/worker.ts";
import { questionsEnvelope, questionsResponseSchema } from "../src/llm/schemas.ts";
import { BudgetExceededError, DEFAULT_CEILINGS, type Ceilings } from "../src/orchestrator/budget.ts";
import { FakeLlm } from "./fake-llm.ts";
import { closeDb, question, seedBank, skipWithoutDb, testDb } from "./helpers.ts";

after(closeDb);

const SYSTEM = "system prompt text";
const USER = "<job>\nسرّي\n</job>";

function input(ownerId: string, timeoutMs?: number) {
  return {
    owner: { kind: "job_bank" as const, id: ownerId },
    tool: "regenerate_question" as const,
    promptVersion: "bank-1.0",
    system: SYSTEM,
    user: USER,
    responseSchema: questionsResponseSchema(["technical"], 3),
    envelope: questionsEnvelope(3),
    maxOutputTokens: 1000,
    timeoutMs,
  };
}

describe("callTool", { skip: skipWithoutDb }, () => {
  test("returns the validated envelope and traces one call", async () => {
    const sql = await testDb();
    const bank = await seedBank(sql, { lock: false });
    const llm = new FakeLlm([{ json: { questions: [question("technical", 0)] }, usage: { inputTokens: 10, outputTokens: 20 } }]);
    const result = await callTool({ sql, llm, ceilings: DEFAULT_CEILINGS }, input(bank.id));
    assert.equal(result.questions.length, 1);
    assert.equal(llm.calls[0]!.temperature, 0.2);
    assert.equal(llm.calls[0]!.maxOutputTokens, 1000);
    const [row] = await sql`select outcome, input_tokens, output_tokens from llm_calls`;
    assert.deepEqual({ ...row }, { outcome: "ok", input_tokens: 10, output_tokens: 20 });
  });

  test("a call past its timeout is aborted and traced as a timeout", async () => {
    const sql = await testDb();
    const bank = await seedBank(sql, { lock: false });
    const llm = new FakeLlm([
      (request) =>
        new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () => reject(request.signal!.reason));
        }),
    ]);
    await assert.rejects(
      () => callTool({ sql, llm, ceilings: DEFAULT_CEILINGS }, input(bank.id, 30)),
      (err: unknown) => err instanceof LlmCallError && err.outcome === "timeout"
    );
    const [row] = await sql`select outcome, error_code from llm_calls`;
    assert.deepEqual({ ...row }, { outcome: "timeout", error_code: "timeout" });
  });

  test("an exhausted budget refuses before the model is called, and traces nothing", async () => {
    const sql = await testDb();
    const bank = await seedBank(sql, { lock: false });
    const llm = new FakeLlm([{ json: { questions: [question("technical", 0)] } }]);
    const tight: Ceilings = { ...DEFAULT_CEILINGS, bank: { ...DEFAULT_CEILINGS.bank, modelCalls: 0 } };
    await assert.rejects(
      () => callTool({ sql, llm, ceilings: tight }, input(bank.id)),
      (err: unknown) => err instanceof BudgetExceededError
    );
    assert.equal(llm.calls.length, 0);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from llm_calls`;
    assert.equal(n!.n, 0);
  });

  test("concurrent calls never cross the call ceiling", async () => {
    const sql = await testDb();
    const bank = await seedBank(sql, { lock: false });
    const answer = { json: { questions: [question("technical", 0)] } };
    const llm = new FakeLlm(Array.from({ length: 6 }, () => answer));
    const three: Ceilings = { ...DEFAULT_CEILINGS, bank: { ...DEFAULT_CEILINGS.bank, modelCalls: 3 } };
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => callTool({ sql, llm, ceilings: three }, input(bank.id)))
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    assert.equal(llm.calls.length, 3);
    const [row] = await sql<{ model_calls: number }[]>`select model_calls from job_banks`;
    assert.equal(row!.model_calls, 3);
  });

  test("traces older than 90 days are purged, newer ones kept", async () => {
    const sql = await testDb();
    const bank = await seedBank(sql, { lock: false });
    for (const days of [91, 89]) {
      await sql`
        insert into llm_calls (job_bank_id, tool, model, prompt_version, input_sha256, duration_ms, outcome, created_at)
        values (${bank.id}, 'generate_bank', 'fake-model', 'bank-1.0', ${"0".repeat(64)}, 1, 'ok',
                now() - make_interval(days => ${days}))`;
    }
    assert.equal(await purgeOldLlmCalls(sql), 1);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from llm_calls`;
    assert.equal(n!.n, 1);
  });
});
