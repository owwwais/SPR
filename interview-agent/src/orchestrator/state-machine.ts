// The interview lifecycle (design §1.3). The harness decides what happens
// next by consulting this table — never the model (D30). Every transition
// the code makes goes through assertTransition(), and the database update
// is guarded on the expected current status, so two workers racing on the
// same interview cannot both move it.
import type { InterviewStatus } from "../contract/index.ts";

const TRANSITIONS: Record<InterviewStatus, readonly InterviewStatus[]> = {
  draft: ["planning", "cancelled", "failed"],
  planning: ["awaiting_review", "cancelled", "failed"],
  // HR may ask for a regeneration, which plans again.
  awaiting_review: ["planning", "scheduled", "cancelled"],
  scheduled: ["open", "cancelled", "expired"],
  open: ["in_progress", "cancelled", "expired"],
  in_progress: ["submitted", "cancelled", "failed"],
  submitted: ["evaluating"],
  evaluating: ["evaluated", "failed"],
  evaluated: [],
  expired: [],
  cancelled: [],
  // Retryable: a failed plan is planned again, a failed evaluation is
  // evaluated again (D4's spirit — an AI failure never strands the record).
  failed: ["planning", "evaluating"],
};

export class InvalidTransitionError extends Error {
  readonly from: InterviewStatus;
  readonly to: InterviewStatus;
  constructor(from: InterviewStatus, to: InterviewStatus) {
    super(`invalid transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: InterviewStatus, to: InterviewStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: InterviewStatus, to: InterviewStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(status: InterviewStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

// Statuses in which a candidate may hold a session at all.
export function acceptsCandidate(status: InterviewStatus): boolean {
  return status === "scheduled" || status === "open" || status === "in_progress";
}
