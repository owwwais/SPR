// The model gateway's interface (design §2, src/llm/ is the only place a
// model is called from). Everything above this line — the planner, the API,
// the tests — sees an LlmClient, never a vendor SDK, so tests inject a
// scripted fake and a provider change stays inside src/llm/.

// A structured-output schema in the OpenAPI subset Gemini accepts (D5).
// Declared here rather than imported so that only src/llm/gemini.ts depends
// on @google/genai.
export type LlmSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN";
  description?: string;
  nullable?: boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: LlmSchema;
  properties?: Record<string, LlmSchema>;
  required?: string[];
  propertyOrdering?: string[];
};

// What the harness calls a model for. Each tool has its own prompt and its
// own row in llm_calls.
export type LlmTool =
  | "generate_bank"
  | "regenerate_question"
  | "generate_gap_probes"
  | "regenerate_gap_probe";

export type LlmRequest = {
  tool: LlmTool;
  promptVersion: string;
  system: string;
  user: string;
  responseSchema: LlmSchema;
  temperature: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResponse = { text: string; usage: LlmUsage };

export interface LlmClient {
  readonly model: string;
  generateJson(request: LlmRequest): Promise<LlmResponse>;
}
