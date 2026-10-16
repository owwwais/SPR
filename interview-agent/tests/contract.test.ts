import { test } from "node:test";
import assert from "node:assert/strict";
import { CreateInterviewRequest, InterviewConfig } from "../src/contract/index.ts";
import { createRequest } from "./helpers.ts";

test("a well-formed request parses", () => {
  assert.equal(CreateInterviewRequest.safeParse(createRequest()).success, true);
});

test("the question mix must add up to the question count", () => {
  const config = { ...createRequest().config, question_count: 9 };
  assert.equal(InterviewConfig.safeParse(config).success, false);
});

test("modes must be unique", () => {
  const config = { ...createRequest().config, modes: ["text", "text"] };
  assert.equal(InterviewConfig.safeParse(config).success, false);
});

test("a candidate profile carrying a name is refused (identity never crosses)", () => {
  const request = createRequest();
  const withName = { ...request, candidate_profile: { ...request.candidate_profile, full_name: "سارة" } };
  assert.equal(CreateInterviewRequest.safeParse(withName).success, false);
});

test("refs must be opaque tokens", () => {
  assert.equal(CreateInterviewRequest.safeParse(createRequest({ candidate_ref: "sara@example.com" })).success, false);
  assert.equal(CreateInterviewRequest.safeParse(createRequest({ external_ref: "short" })).success, false);
});
