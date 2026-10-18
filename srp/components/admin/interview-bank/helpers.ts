// Pure display helpers shared by the job-bank page and the applicant's
// virtual-interview panel. Safe on both sides: no server imports, only
// type-only imports from lib/interviews.
import type {
  BankQuestionView,
  QuestionContent,
  QuestionKind,
} from "@/lib/interviews";
import { ar } from "@/lib/i18n/ar";

/** Mirrors MIN_APPROVED_TO_LOCK in the agent (src/api/job-banks.ts). */
export const MIN_APPROVED_TO_LOCK = 6;

/** Fills `{name}` placeholders in an ar.ts template. */
export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

/** What the interviewer will actually use: staff's version, else the model's. */
export function effective(question: BankQuestionView): QuestionContent {
  return question.edited ?? question.original;
}

/** A fingerprint short enough to read aloud, long enough to tell apart. */
export function shortHash(hash: string | null) {
  return hash ? hash.slice(0, 12) : "—";
}

export function difficultyLabel(level: 1 | 2 | 3) {
  const labels = ar.interviewBank.difficulty;
  return level === 1 ? labels["1"] : level === 2 ? labels["2"] : labels["3"];
}

export function formatSeconds(seconds: number | null) {
  const t = ar.interviewBank.question;
  if (seconds === null) return t.noTimeLimit;
  if (seconds % 60 === 0) {
    const n = seconds / 60;
    // Arabic counted nouns: two takes the dual, three to ten the plural,
    // everything else the singular («5 دقائق», «15 دقيقة»).
    if (n === 2) return t.minutesTwo;
    return fill(n >= 3 && n <= 10 ? t.minutesFew : t.minutes, { n });
  }
  return fill(t.seconds, { n: seconds });
}

export type QuestionGroupKey = "warmup" | "technical" | "behavioral" | "gap_probe" | "other";

const GROUP_OF: Record<QuestionKind, QuestionGroupKey> = {
  warmup: "warmup",
  technical: "technical",
  // Situational questions are drawn from the behavioral share of the mix.
  behavioral: "behavioral",
  situational: "behavioral",
  gap_probe: "gap_probe",
  coding: "other",
};

const GROUP_ORDER: QuestionGroupKey[] = [
  "warmup",
  "technical",
  "behavioral",
  "gap_probe",
  "other",
];

// Position order within each group; a replaced (removed) question sits after
// the replacement that took its position.
export function groupQuestions(questions: BankQuestionView[]) {
  const sorted = [...questions].sort(
    (a, b) =>
      a.position - b.position ||
      Number(a.status === "removed") - Number(b.status === "removed")
  );
  return GROUP_ORDER.map((key) => ({
    key,
    questions: sorted.filter((q) => GROUP_OF[q.original.kind] === key),
  })).filter((group) => group.questions.length > 0);
}

export function countByStatus(questions: BankQuestionView[]) {
  return {
    pending: questions.filter((q) => q.status === "pending").length,
    approved: questions.filter((q) => q.status === "approved").length,
    removed: questions.filter((q) => q.status === "removed").length,
  };
}

/** Approved questions per share of an interview's mix. */
export function approvedByShare(questions: BankQuestionView[]) {
  const approved = questions.filter((q) => q.status === "approved");
  return {
    warmup: approved.filter((q) => q.original.kind === "warmup").length,
    technical: approved.filter((q) => q.original.kind === "technical").length,
    behavioral: approved.filter(
      (q) => q.original.kind === "behavioral" || q.original.kind === "situational"
    ).length,
  };
}
