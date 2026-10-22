import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptsCandidate,
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isTerminal,
} from "../src/orchestrator/state-machine.ts";
import { INTERVIEW_STATUSES } from "../src/contract/index.ts";

test("the happy path is a chain of legal moves", () => {
  const path = ["draft", "planning", "awaiting_review", "scheduled", "open", "in_progress", "submitted", "evaluating", "evaluated"] as const;
  for (let i = 1; i < path.length; i++) assert.equal(canTransition(path[i - 1]!, path[i]!), true);
});

test("terminal states go nowhere", () => {
  for (const status of ["evaluated", "expired", "cancelled"] as const) {
    assert.equal(isTerminal(status), true);
    for (const to of INTERVIEW_STATUSES) assert.equal(canTransition(status, to), false);
  }
});

test("illegal moves throw", () => {
  assert.throws(() => assertTransition("draft", "evaluated"), InvalidTransitionError);
  assert.throws(() => assertTransition("submitted", "cancelled"), InvalidTransitionError);
});

test("failures are retryable, not terminal", () => {
  assert.equal(isTerminal("failed"), false);
  assert.equal(canTransition("failed", "planning"), true);
  assert.equal(canTransition("failed", "evaluating"), true);
});

test("only scheduled, open and in-progress interviews accept a candidate", () => {
  const accepting = INTERVIEW_STATUSES.filter(acceptsCandidate);
  assert.deepEqual(accepting, ["scheduled", "open", "in_progress"]);
});
