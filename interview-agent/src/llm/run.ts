// callTool(): the harness wrapper every model call goes through (design
// §4.1). In order: reserve budget or refuse before spending anything, call
// with a timeout, trace the call (identifiers, hashes, counts — never text,
// D8), settle the real token use, and validate the envelope (D5). Nothing
// from an invalid response leaves this function.
import { createHash } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db/client.ts";
import {
  reserveCall,
  settleCall,
  type BudgetOwner,
  type Ceilings,
  type Reservation,
} from "../orchestrator/budget.ts";
import type { LlmClient, LlmSchema, LlmTool } from "./types.ts";

export const LLM_TIMEOUT_MS = 45_000;

export type LlmOutcome = "ok" | "invalid_output" | "model_error" | "timeout";

// A failed call, by machine-readable reason. The message never carries
// model output or prompt text.
export class LlmCallError extends Error {
  readonly outcome: Exclude<LlmOutcome, "ok">;
  readonly code: string;
  constructor(outcome: Exclude<LlmOutcome, "ok">, code: string) {
    super(`model call failed: ${outcome} (${code})`);
    this.name = "LlmCallError";
    this.outcome = outcome;
    this.code = code;
  }
}

export type CallToolDeps = { sql: Sql; llm: LlmClient; ceilings: Ceilings };

export type CallToolInput<T extends z.ZodType> = {
  owner: BudgetOwner;
  tool: LlmTool;
  promptVersion: string;
  system: string;
  user: string;
  responseSchema: LlmSchema;
  envelope: T;
  maxOutputTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

// An upper bound on the input's token count: a tokenizer with byte fallback
// never produces more tokens than there are UTF-8 bytes, plus a margin for
// the turn markers. Over-reserving only delays the moment a ceiling bites;
// under-reserving would let a call cross it.
export function inputTokenBound(system: string, user: string): number {
  return Buffer.byteLength(system, "utf8") + Buffer.byteLength(user, "utf8") + 256;
}

function errorCode(
  err: unknown,
  caller: AbortSignal | undefined,
  timeout: AbortSignal
): { outcome: "model_error" | "timeout"; code: string } {
  if (caller?.aborted) return { outcome: "model_error", code: "aborted" };
  if (timeout.aborted) return { outcome: "timeout", code: "timeout" };
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "TimeoutError") return { outcome: "timeout", code: "timeout" };
  if (name === "AbortError") return { outcome: "timeout", code: "timeout" };
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return { outcome: "model_error", code: `http_${status}` };
  return { outcome: "model_error", code: "error" };
}

export async function callTool<T extends z.ZodType>(
  deps: CallToolDeps,
  input: CallToolInput<T>
): Promise<z.infer<T>> {
  const reservation: Reservation = {
    inputTokens: inputTokenBound(input.system, input.user),
    outputTokens: input.maxOutputTokens,
  };
  // Throws BudgetExceededError before anything is spent. Its own statement,
  // committed at once: a model call must never sit inside an open
  // transaction.
  await reserveCall(deps.sql, input.owner, deps.ceilings, reservation);

  const inputHash = createHash("sha256")
    .update(input.system)
    .update("\u0000")
    .update(input.user)
    .digest("hex");
  const timeout = AbortSignal.timeout(input.timeoutMs ?? LLM_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const started = performance.now();

  let outcome: LlmOutcome = "ok";
  let code: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let value: z.infer<T> | undefined;

  try {
    const response = await deps.llm.generateJson({
      tool: input.tool,
      promptVersion: input.promptVersion,
      system: input.system,
      user: input.user,
      responseSchema: input.responseSchema,
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens,
      signal,
    });
    usage = {
      inputTokens: Math.max(0, Math.round(response.usage.inputTokens)),
      outputTokens: Math.max(0, Math.round(response.usage.outputTokens)),
    };
    let json: unknown;
    try {
      json = JSON.parse(response.text);
    } catch {
      outcome = "invalid_output";
      code = "json_parse";
    }
    if (outcome === "ok") {
      const parsed = input.envelope.safeParse(json);
      if (parsed.success) value = parsed.data;
      else {
        outcome = "invalid_output";
        code = "schema";
      }
    }
  } catch (err) {
    const failure = errorCode(err, input.signal, timeout);
    outcome = failure.outcome;
    code = failure.code;
  }

  const durationMs = Math.max(0, Math.round(performance.now() - started));
  const owner = input.owner;
  await deps.sql.begin(async (tx) => {
    await tx`
      insert into llm_calls (
        job_bank_id, interview_id, tool, model, prompt_version, input_sha256,
        input_tokens, output_tokens, duration_ms, outcome, error_code
      ) values (
        ${owner.kind === "job_bank" ? owner.id : null},
        ${owner.kind === "interview" ? owner.id : null},
        ${input.tool}, ${deps.llm.model}, ${input.promptVersion}, ${inputHash},
        ${usage.inputTokens}, ${usage.outputTokens}, ${durationMs}, ${outcome}, ${code}
      )`;
    await settleCall(tx, owner, reservation, usage);
  });

  if (outcome !== "ok" || value === undefined) {
    throw new LlmCallError(outcome === "ok" ? "invalid_output" : outcome, code ?? "error");
  }
  return value;
}
