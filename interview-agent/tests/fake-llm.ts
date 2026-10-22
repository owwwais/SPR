// A scripted stand-in for the model (design §2.3: scenarios run against a
// fake). Each call takes the next scripted answer and is recorded, so a test
// can assert both what was returned and how many calls were made.
import type { LlmClient, LlmRequest, LlmResponse, LlmUsage } from "../src/llm/types.ts";

export type Scripted =
  // Returned as the response text, verbatim (use for malformed output).
  | { text: string; usage?: Partial<LlmUsage> }
  // Serialised as the response text.
  | { json: unknown; usage?: Partial<LlmUsage> }
  // Thrown, as a provider error would be.
  | { error: Error & { status?: number } }
  // Computed from the request.
  | ((request: LlmRequest) => LlmResponse | Promise<LlmResponse>);

export const DEFAULT_USAGE: LlmUsage = { inputTokens: 1200, outputTokens: 3400 };

export class FakeLlm implements LlmClient {
  readonly model = "fake-model";
  readonly calls: LlmRequest[] = [];
  #queue: Scripted[];

  constructor(scripts: Scripted[] = []) {
    this.#queue = [...scripts];
  }

  push(...scripts: Scripted[]): this {
    this.#queue.push(...scripts);
    return this;
  }

  get pending(): number {
    return this.#queue.length;
  }

  async generateJson(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const next = this.#queue.shift();
    if (!next) throw new Error("fake LLM: no scripted response left");
    if (typeof next === "function") return next(request);
    if ("error" in next) throw next.error;
    const usage = { ...DEFAULT_USAGE, ...next.usage };
    return "text" in next
      ? { text: next.text, usage }
      : { text: JSON.stringify(next.json), usage };
  }
}
