// Drawing an interview's plan at lock (design §4.4): the warm-up first, then
// the mix's technical and behavioral questions drawn from the locked core
// bank in a random interleaving, then the candidate's gap probes. The order
// differs between candidates (leak resistance, §4.5) while the structure —
// how many of each kind, from the same reviewed bank — is identical, which
// is what makes candidates for one job comparable.
import { randomInt } from "node:crypto";
import type { QuestionContent, QuestionKind } from "../contract/index.ts";
import type { PlanItem } from "../db/interviews.ts";
import { canonicalHash } from "../lib/canonical.ts";

export type PlanCandidate = { id: string; kind: QuestionKind; content: QuestionContent };

export type PlanMix = { warmup: number; technical: number; behavioral: number; gap_probe: number };

// Cryptographic randomness: a predictable order would let one candidate
// tell the next what comes when.
export type RandomInt = (maxExclusive: number) => number;
const cryptoRandom: RandomInt = (max) => randomInt(max);

export function shuffle<T>(items: readonly T[], random: RandomInt = cryptoRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function sample<T>(items: readonly T[], count: number, random: RandomInt): T[] {
  return shuffle(items, random).slice(0, count);
}

// null when the approved questions cannot cover the mix.
export function drawPlan(
  input: { core: readonly PlanCandidate[]; gapProbes: readonly PlanCandidate[]; mix: PlanMix },
  random: RandomInt = cryptoRandom
): PlanItem[] | null {
  const { core, gapProbes, mix } = input;
  const warmups = core.filter((q) => q.kind === "warmup");
  const technical = core.filter((q) => q.kind === "technical");
  const behavioral = core.filter((q) => q.kind === "behavioral" || q.kind === "situational");
  if (
    warmups.length < mix.warmup ||
    technical.length < mix.technical ||
    behavioral.length < mix.behavioral ||
    gapProbes.length < mix.gap_probe
  ) {
    return null;
  }

  const middle = shuffle(
    [...sample(technical, mix.technical, random), ...sample(behavioral, mix.behavioral, random)],
    random
  );
  const ordered = [
    ...sample(warmups, mix.warmup, random),
    ...middle,
    ...sample(gapProbes, mix.gap_probe, random),
  ];
  return ordered.map((q) => ({ question_id: q.id, kind: q.kind, content: q.content }));
}

// plan_hash: binds the plan to the exact core bank it was drawn from.
export function computePlanHash(jobBankHash: string, plan: readonly PlanItem[]): string {
  return canonicalHash({
    job_bank_hash: jobBankHash,
    plan: plan.map((item) => ({
      question_id: item.question_id,
      kind: item.kind,
      content: item.content,
    })),
  });
}
