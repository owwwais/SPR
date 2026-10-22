import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BankEdit,
  BankQuestionView,
  CreateInterviewRequest,
  CreateJobBankRequest,
  InterviewBankView,
  InterviewConfig,
  InterviewEvent,
  JobBankView,
  QuestionContent,
  TenantContext,
} from "../src/contract/index.ts";
import { createBankRequest, createRequest, question } from "./helpers.ts";

const BANK_ID = "3f0b6c1e-8a4d-4b7e-9c2a-1d5e6f7a8b9c";
const QUESTION_ID = "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const HASH = "a".repeat(64);
const NOW = "2026-10-18T09:00:00.000Z";

test("a well-formed request parses", () => {
  assert.equal(CreateInterviewRequest.safeParse(createRequest(BANK_ID)).success, true);
});

test("the question mix must add up to the question count", () => {
  const config = { ...createRequest(BANK_ID).config, question_count: 9 };
  assert.equal(InterviewConfig.safeParse(config).success, false);
});

test("modes must be unique", () => {
  const config = { ...createRequest(BANK_ID).config, modes: ["text", "text"] };
  assert.equal(InterviewConfig.safeParse(config).success, false);
});

test("a candidate profile carrying a name is refused (identity never crosses)", () => {
  const request = createRequest(BANK_ID);
  const withName = { ...request, candidate_profile: { ...request.candidate_profile, full_name: "سارة" } };
  assert.equal(CreateInterviewRequest.safeParse(withName).success, false);
});

test("refs must be opaque tokens", () => {
  assert.equal(CreateInterviewRequest.safeParse(createRequest(BANK_ID, { candidate_ref: "sara@example.com" })).success, false);
  assert.equal(CreateInterviewRequest.safeParse(createRequest(BANK_ID, { external_ref: "short" })).success, false);
});

test("an interview request names its bank and tenant, and carries no job", () => {
  const request = createRequest(BANK_ID);
  assert.equal(CreateInterviewRequest.safeParse({ ...request, job_bank_id: "not-a-uuid" }).success, false);
  const { tenant: _tenant, ...withoutTenant } = request;
  assert.equal(CreateInterviewRequest.safeParse(withoutTenant).success, false);
  assert.equal(CreateInterviewRequest.safeParse({ ...request, job: {} }).success, false);
});

test("tenant context: an allowance is a non-negative integer or null", () => {
  assert.equal(TenantContext.safeParse({ ref: "t_0123456789abcdef", monthly_interview_allowance: null }).success, true);
  assert.equal(TenantContext.safeParse({ ref: "t_0123456789abcdef", monthly_interview_allowance: 0 }).success, true);
  assert.equal(TenantContext.safeParse({ ref: "t_0123456789abcdef", monthly_interview_allowance: -1 }).success, false);
  assert.equal(TenantContext.safeParse({ ref: "t_0123456789abcdef", monthly_interview_allowance: 1.5 }).success, false);
  assert.equal(TenantContext.safeParse({ ref: "org name", monthly_interview_allowance: 1 }).success, false);
});

test("a job bank request parses, strictly", () => {
  assert.equal(CreateJobBankRequest.safeParse(createBankRequest()).success, true);
  assert.equal(CreateJobBankRequest.safeParse({ ...createBankRequest(), extra: 1 }).success, false);
  const noRequirements = { ...createBankRequest(), job: { ...createBankRequest().job, requirements: "" } };
  assert.equal(CreateJobBankRequest.safeParse(noRequirements).success, false);
});

test("question content: a warm-up needs no rubric, a scored question does", () => {
  assert.equal(QuestionContent.safeParse(question("warmup", 0)).success, true);
  assert.equal(QuestionContent.safeParse(question("technical", 0)).success, true);
  const unscored = question("technical", 0, { rubric: { criteria: [] } });
  assert.equal(QuestionContent.safeParse(unscored).success, false);
  assert.equal(QuestionContent.safeParse(question("technical", 0, { text_ar: "قصير" })).success, false);
  assert.equal(QuestionContent.safeParse({ ...question("technical", 0), difficulty: 4 }).success, false);
  assert.equal(QuestionContent.safeParse({ ...question("technical", 0), expected_points: [] }).success, false);
  assert.equal(QuestionContent.safeParse({ ...question("technical", 0), extra: true }).success, false);
});

test("bank edits are a closed set of operations", () => {
  assert.equal(BankEdit.safeParse({ op: "approve", question_id: QUESTION_ID }).success, true);
  assert.equal(BankEdit.safeParse({ op: "regenerate", question_id: QUESTION_ID }).success, true);
  assert.equal(BankEdit.safeParse({ op: "edit", question_id: QUESTION_ID, content: question("technical", 1) }).success, true);
  assert.equal(BankEdit.safeParse({ op: "edit", question_id: QUESTION_ID }).success, false);
  assert.equal(BankEdit.safeParse({ op: "delete", question_id: QUESTION_ID }).success, false);
  assert.equal(BankEdit.safeParse({ op: "approve", question_id: QUESTION_ID, status: "approved" }).success, false);
});

test("job bank and interview bank views parse", () => {
  const q = {
    id: QUESTION_ID,
    position: 0,
    status: "approved",
    original: question("technical", 0),
    edited: null,
    replaces: null,
    updated_at: NOW,
  };
  assert.equal(BankQuestionView.safeParse(q).success, true);
  const bank = {
    id: BANK_ID,
    external_ref: "bank_0001_abcdef",
    version: 1,
    status: "locked",
    bank_hash: HASH,
    locked_at: NOW,
    failure: null,
    questions: [q],
    regenerations_left: 15,
    created_at: NOW,
    updated_at: NOW,
  };
  assert.equal(JobBankView.safeParse(bank).success, true);
  assert.equal(JobBankView.safeParse({ ...bank, bank_hash: "xyz" }).success, false);
  assert.equal(JobBankView.safeParse({ ...bank, version: 0 }).success, false);

  const interviewBank = {
    interview_id: QUESTION_ID,
    status: "awaiting_review",
    job_bank_id: BANK_ID,
    job_bank_hash: HASH,
    gap_probes: [{ ...q, original: question("gap_probe", 0) }],
    plan: [{ question_id: QUESTION_ID, kind: "gap_probe" }],
    plan_hash: HASH,
    locked_at: NOW,
    regenerations_left: 5,
  };
  assert.equal(InterviewBankView.safeParse(interviewBank).success, true);
  assert.equal(InterviewBankView.safeParse({ ...interviewBank, plan: null, plan_hash: null, locked_at: null }).success, true);
});

test("events carry their type-specific data", () => {
  const event = {
    event_id: QUESTION_ID,
    type: "interview.bank_locked",
    interview_id: BANK_ID,
    external_ref: "assignment_0001",
    status: "awaiting_review",
    occurred_at: NOW,
    data: { plan_hash: HASH },
  };
  assert.equal(InterviewEvent.safeParse(event).success, true);
  assert.equal(InterviewEvent.safeParse({ ...event, type: "interview.whatever" }).success, false);
});
