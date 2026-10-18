// The planner's model calls (design §4.2): one call writes a job's core bank,
// one writes a candidate's gap probes, and staff's "generate a replacement"
// is one call for one question. Every call goes through callTool() — budget,
// timeout, trace, envelope validation — and every question through the
// filters before anything is stored.
import type { Sql } from "../db/client.ts";
import type { CandidateProfile, JobContext, QuestionContent } from "../contract/index.ts";
import type { LlmClient } from "../llm/types.ts";
import { callTool } from "../llm/run.ts";
import { questionsEnvelope, questionsResponseSchema } from "../llm/schemas.ts";
import type { BudgetOwner, Ceilings } from "../orchestrator/budget.ts";
import {
  BANK_COMPOSITION,
  BANK_PROMPT_VERSION,
  BANK_SYSTEM_PROMPT,
  BANK_TARGET_SIZE,
  CORE_KINDS,
  bankUserMessage,
  replacementUserMessage,
  type CoreKind,
} from "../prompts/bank.ts";
import {
  GAP_PROMPT_VERSION,
  GAP_SYSTEM_PROMPT,
  gapProbeUserMessage,
  gapReplacementUserMessage,
} from "../prompts/gap-probes.ts";
import {
  CORE_BANK_KINDS,
  GAP_PROBE_KINDS,
  filterQuestions,
  type FilterStats,
} from "./validate.ts";

// Output caps per call. Thinking counts against them, and the budget
// reserves them in full before each call.
export const BANK_MAX_OUTPUT_TOKENS = 32_000;
export const GAP_MAX_OUTPUT_TOKENS = 16_000;
export const REPLACEMENT_MAX_OUTPUT_TOKENS = 6_000;

// A bank staff can work with (design §4.2 asks for 20–30 before review; the
// floor leaves room for the filters).
export const BANK_MINIMUM = { total: 15, warmup: 1, technical: 6, behavioral: 4 } as const;

export type GenerationDeps = {
  sql: Sql;
  llm: LlmClient;
  ceilings: Ceilings;
  signal?: AbortSignal;
};

export type Generated = { accepted: QuestionContent[]; stats: FilterStats };

const KIND_ORDER: Record<CoreKind, number> = {
  warmup: 0,
  technical: 1,
  behavioral: 2,
  situational: 3,
};

// Groups the accepted questions by kind (the review screen's order) and
// keeps at most the requested number of each.
export function shapeBank(accepted: readonly QuestionContent[]): QuestionContent[] {
  const taken: Record<CoreKind, number> = { warmup: 0, technical: 0, behavioral: 0, situational: 0 };
  const kept: QuestionContent[] = [];
  for (const question of accepted) {
    const kind = question.kind as CoreKind;
    if (!(kind in BANK_COMPOSITION) || taken[kind] >= BANK_COMPOSITION[kind]) continue;
    taken[kind]++;
    kept.push(question);
  }
  return kept
    .map((question, index) => ({ question, index }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.question.kind as CoreKind] - KIND_ORDER[b.question.kind as CoreKind] ||
        a.index - b.index
    )
    .map(({ question }) => question);
}

export function meetsBankMinimum(questions: readonly QuestionContent[]): boolean {
  const count = (pred: (q: QuestionContent) => boolean) => questions.filter(pred).length;
  return (
    questions.length >= BANK_MINIMUM.total &&
    count((q) => q.kind === "warmup") >= BANK_MINIMUM.warmup &&
    count((q) => q.kind === "technical") >= BANK_MINIMUM.technical &&
    count((q) => q.kind === "behavioral" || q.kind === "situational") >= BANK_MINIMUM.behavioral
  );
}

export async function generateCoreBank(
  deps: GenerationDeps,
  bank: { id: string; job: JobContext }
): Promise<Generated> {
  // Room above the target, so an over-eager response is filtered rather
  // than rejected whole.
  const maxItems = BANK_TARGET_SIZE + 16;
  const envelope = await callTool(deps, {
    owner: { kind: "job_bank", id: bank.id },
    tool: "generate_bank",
    promptVersion: BANK_PROMPT_VERSION,
    system: BANK_SYSTEM_PROMPT,
    user: bankUserMessage(bank.job),
    responseSchema: questionsResponseSchema(CORE_KINDS, maxItems),
    envelope: questionsEnvelope(maxItems),
    maxOutputTokens: BANK_MAX_OUTPUT_TOKENS,
    signal: deps.signal,
  });
  const { accepted, stats } = filterQuestions(envelope.questions, {
    allowedKinds: CORE_BANK_KINDS,
  });
  return { accepted: shapeBank(accepted), stats };
}

// One replacement of the same kind. null when the model's candidate did not
// survive the filters (the caller answers 502 generation_failed).
export async function generateCoreReplacement(
  deps: GenerationDeps,
  bank: { id: string; job: JobContext },
  wanted: { kind: CoreKind; competency: string },
  existingTexts: readonly string[]
): Promise<QuestionContent | null> {
  return replacement(deps, { kind: "job_bank", id: bank.id }, {
    tool: "regenerate_question",
    promptVersion: BANK_PROMPT_VERSION,
    system: BANK_SYSTEM_PROMPT,
    user: replacementUserMessage(bank.job, wanted, existingTexts),
    kind: wanted.kind,
    existingTexts,
  });
}

export async function generateGapProbes(
  deps: GenerationDeps,
  interview: { id: string; job: JobContext; candidate_profile: CandidateProfile },
  count: number
): Promise<Generated> {
  const maxItems = count + 4;
  const envelope = await callTool(deps, {
    owner: { kind: "interview", id: interview.id },
    tool: "generate_gap_probes",
    promptVersion: GAP_PROMPT_VERSION,
    system: GAP_SYSTEM_PROMPT,
    user: gapProbeUserMessage(interview.job, interview.candidate_profile, count),
    responseSchema: questionsResponseSchema(GAP_PROBE_KINDS, maxItems),
    envelope: questionsEnvelope(maxItems),
    maxOutputTokens: GAP_MAX_OUTPUT_TOKENS,
    signal: deps.signal,
  });
  const { accepted, stats } = filterQuestions(envelope.questions, {
    allowedKinds: GAP_PROBE_KINDS,
  });
  return { accepted: accepted.slice(0, count), stats };
}

export async function generateGapReplacement(
  deps: GenerationDeps,
  interview: { id: string; job: JobContext; candidate_profile: CandidateProfile },
  existingTexts: readonly string[]
): Promise<QuestionContent | null> {
  return replacement(deps, { kind: "interview", id: interview.id }, {
    tool: "regenerate_gap_probe",
    promptVersion: GAP_PROMPT_VERSION,
    system: GAP_SYSTEM_PROMPT,
    user: gapReplacementUserMessage(interview.job, interview.candidate_profile, existingTexts),
    kind: "gap_probe",
    existingTexts,
  });
}

async function replacement(
  deps: GenerationDeps,
  owner: BudgetOwner,
  call: {
    tool: "regenerate_question" | "regenerate_gap_probe";
    promptVersion: string;
    system: string;
    user: string;
    kind: QuestionContent["kind"];
    existingTexts: readonly string[];
  }
): Promise<QuestionContent | null> {
  const maxItems = 3;
  const envelope = await callTool(deps, {
    owner,
    tool: call.tool,
    promptVersion: call.promptVersion,
    system: call.system,
    user: call.user,
    responseSchema: questionsResponseSchema([call.kind], maxItems),
    envelope: questionsEnvelope(maxItems),
    maxOutputTokens: REPLACEMENT_MAX_OUTPUT_TOKENS,
    signal: deps.signal,
  });
  // The kind must be the replaced question's, and the replacement must not
  // repeat anything already in the bank.
  const { accepted } = filterQuestions(envelope.questions, {
    allowedKinds: [call.kind],
    existingTexts: call.existingTexts,
  });
  return accepted[0] ?? null;
}
