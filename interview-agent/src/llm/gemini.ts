// The only module that imports @google/genai (design §2.2). The key lives in
// this server's environment and nowhere else (D3 exception for the agent).
import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import type { LlmClient, LlmRequest, LlmResponse, LlmSchema } from "./types.ts";

// D2: one model for every text task, the same one CV analysis uses.
export const MODEL = "gemini-3.5-flash";
export const DEFAULT_TEMPERATURE = 0.2;

const TYPES: Record<LlmSchema["type"], Type> = {
  OBJECT: Type.OBJECT,
  ARRAY: Type.ARRAY,
  STRING: Type.STRING,
  INTEGER: Type.INTEGER,
  NUMBER: Type.NUMBER,
  BOOLEAN: Type.BOOLEAN,
};

// The SDK's Schema spells int64 bounds as strings; ours are numbers.
export function toGeminiSchema(schema: LlmSchema): Schema {
  const out: Schema = { type: TYPES[schema.type] };
  if (schema.description !== undefined) out.description = schema.description;
  if (schema.nullable !== undefined) out.nullable = schema.nullable;
  if (schema.enum !== undefined) out.enum = [...schema.enum];
  if (schema.minimum !== undefined) out.minimum = schema.minimum;
  if (schema.maximum !== undefined) out.maximum = schema.maximum;
  if (schema.minItems !== undefined) out.minItems = String(schema.minItems);
  if (schema.maxItems !== undefined) out.maxItems = String(schema.maxItems);
  if (schema.items !== undefined) out.items = toGeminiSchema(schema.items);
  if (schema.properties !== undefined) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
  }
  if (schema.required !== undefined) out.required = [...schema.required];
  if (schema.propertyOrdering !== undefined) out.propertyOrdering = [...schema.propertyOrdering];
  return out;
}

export function createGeminiClient(apiKey: string): LlmClient {
  // No retryOptions: the SDK then makes exactly one HTTP request per call,
  // which is what the harness budgets and traces (one llm_calls row each).
  const ai = new GoogleGenAI({ apiKey });

  return {
    model: MODEL,
    async generateJson(request: LlmRequest): Promise<LlmResponse> {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        config: {
          systemInstruction: request.system,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(request.responseSchema),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: request.signal,
        },
      });
      const usage = response.usageMetadata;
      return {
        text: response.text ?? "",
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          // Thinking is billed as output, so it counts against the ceiling.
          outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        },
      };
    },
  };
}
