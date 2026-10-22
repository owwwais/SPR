// /v1/platform/* — called by the platform only, every request HMAC-signed
// (design §3.2). The platform's interview-gateway Edge Function is the only
// holder of the signing secret.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { jsonb, type Sql, type Tx } from "../db/client.ts";
import type { AppEnv, Reply } from "./http.ts";
import { errorReply, idempotent, parseJson, send, UUID_RE } from "./http.ts";
import { verifyRequest } from "../auth/hmac.ts";
import { mintSessionToken, type SessionKeys } from "../auth/session-token.ts";
import {
  BankEdit,
  CreateInterviewRequest,
  SessionTokenRequest,
  type InterviewBankView,
  type SessionTokenResponse,
} from "../contract/index.ts";
import {
  bumpSessionEpoch,
  deleteInterview,
  findInterview,
  findPlanningInterview,
  insertInterview,
  toView,
  transition,
  type InterviewRow,
} from "../db/interviews.ts";
import {
  approvedCounts,
  effectiveContent,
  findJobBank,
  findQuestion,
  listQuestions,
  toQuestionView,
} from "../db/banks.ts";
import { acceptsCandidate, canTransition } from "../orchestrator/state-machine.ts";
import {
  claimInterviewUnit,
  regenerationsLeft,
  type Ceilings,
} from "../orchestrator/budget.ts";
import { enqueueEvent } from "../webhooks/outbox.ts";
import type { LlmClient } from "../llm/types.ts";
import { CODING_AVAILABLE, VOICE_AVAILABLE } from "../capabilities.ts";
import { generateGapReplacement } from "../planner/generate.ts";
import { computePlanHash, drawPlan } from "../planner/plan.ts";
import { jobBankRoutes } from "./job-banks.ts";
import { applySimpleEdit, regenerateQuestion } from "./review.ts";

export type PlatformDeps = {
  sql: Sql;
  hmacKeys: ReadonlyMap<string, string>;
  sessionKeys: SessionKeys;
  llm: LlmClient | null;
  ceilings: Ceilings;
  now: () => Date;
};

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

// Gap probes may be reviewed while the interview awaits review and its
// questions are not yet locked (review is optional, design §12.6).
function gapReviewGate(row: InterviewRow): Reply | null {
  if (!row.job_bank_id) return errorReply(404, "not_found");
  if (row.bank_locked_at) return errorReply(409, "bank_locked");
  if (row.status !== "awaiting_review") {
    return errorReply(409, "invalid_transition", `interview is ${row.status}`);
  }
  return null;
}

export function platformRoutes(deps: PlatformDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

  // Signature first, then the replay guard. Nothing below this middleware
  // runs for an unsigned, stale, forged or replayed request.
  app.use("*", async (c, next) => {
    const raw = await c.req.text();
    const url = new URL(c.req.url);
    const verdict = await verifyRequest({
      secrets: deps.hmacKeys,
      headers: c.req.raw.headers,
      method: c.req.method,
      path: url.pathname + url.search,
      body: raw,
      nowSeconds: Math.floor(deps.now().getTime() / 1000),
    });
    if (!verdict.ok) return send(c, errorReply(401, "unauthorized", verdict.reason));

    const fresh = await deps.sql`
      insert into request_nonces (nonce) values (${verdict.nonce})
      on conflict do nothing
      returning nonce`;
    if (fresh.length === 0) return send(c, errorReply(401, "unauthorized", "replayed"));

    c.set("rawBody", raw);
    await next();
  });

  app.route("/job-banks", jobBankRoutes(deps));

  async function interviewBankView(sql: Sql | Tx, row: InterviewRow): Promise<Reply> {
    const bank = row.job_bank_id ? await findJobBank(sql, row.job_bank_id) : null;
    if (!bank || !bank.bank_hash) return errorReply(404, "not_found");
    const gapProbes = await listQuestions(sql, { interviewId: row.id });
    const body: InterviewBankView = {
      interview_id: row.id,
      status: row.status,
      job_bank_id: bank.id,
      job_bank_hash: bank.bank_hash,
      gap_probes: gapProbes.map(toQuestionView),
      plan: row.plan?.map(({ question_id, kind }) => ({ question_id, kind })) ?? null,
      plan_hash: row.plan_hash,
      locked_at: row.bank_locked_at?.toISOString() ?? null,
      regenerations_left: regenerationsLeft(
        { regenerations: row.gap_regenerations, modelCalls: row.model_calls },
        deps.ceilings.interview
      ),
    };
    return { status: 200, body };
  }

  // Creating an interview from a locked bank. Every refusal is decided
  // before anything is written; the allowance unit (D33) is claimed in the
  // same transaction as the insert, so a refused claim creates nothing and
  // a failed insert gives the unit back.
  app.post("/interviews", async (c) => {
    const key = c.req.header("idempotency-key");
    if (!key || key.length > 200) {
      return send(c, errorReply(400, "idempotency_key_required"));
    }
    const raw = c.get("rawBody");
    const parsed = parseJson(raw, CreateInterviewRequest);
    if (!parsed.ok) return send(c, parsed.reply);
    const request = parsed.data;
    const mix = request.config.mix;

    const reply = await idempotent(deps.sql, "create_interview", key, raw, async () => {
      const bank = await findJobBank(deps.sql, request.job_bank_id);
      if (!bank) return errorReply(404, "not_found");
      if (bank.tenant_ref !== request.tenant.ref) return errorReply(403, "tenant_mismatch");
      if (bank.status !== "locked") return errorReply(409, "bank_not_locked");
      if (mix.coding > 0 && !CODING_AVAILABLE) return errorReply(422, "coding_unavailable");
      if (request.config.modes.includes("voice") && !VOICE_AVAILABLE) {
        return errorReply(422, "voice_unavailable");
      }
      const counts = await approvedCounts(deps.sql, bank.id);
      if (
        counts.warmup < mix.warmup ||
        counts.technical < mix.technical ||
        counts.behavioral < mix.behavioral
      ) {
        return errorReply(409, "insufficient_bank");
      }
      if (mix.gap_probe > 0 && !deps.llm) return errorReply(503, "llm_not_configured");
      if (request.tenant.monthly_interview_allowance === 0) {
        return errorReply(402, "interviews_not_in_plan");
      }

      try {
        return await deps.sql.begin(async (tx) => {
          const claim = await claimInterviewUnit(
            tx,
            request.tenant.ref,
            request.tenant.monthly_interview_allowance
          );
          if (!claim.ok) return errorReply(402, "quota_exceeded");
          const draft = await insertInterview(tx, request, bank, claim.period);
          let row = (await transition(tx, draft.id, "draft", "planning", "platform", "planning_started"))!;
          // Nothing candidate-specific to write: the core bank is already
          // reviewed, so the interview is ready for its lock at once.
          if (mix.gap_probe === 0) {
            row = (await transition(tx, row.id, "planning", "awaiting_review", "system", "planned"))!;
            await enqueueEvent(tx, {
              type: "interview.planned",
              interviewId: row.id,
              externalRef: row.external_ref,
              status: row.status,
              data: { gap_probes: 0 },
            });
          }
          return { status: 201 as const, body: toView(row) };
        });
      } catch (err) {
        if (isUniqueViolation(err)) return errorReply(409, "external_ref_exists");
        throw err;
      }
    });
    return send(c, reply);
  });

  app.get("/interviews/:id", async (c) => {
    const id = c.req.param("id");
    const row = UUID_RE.test(id) ? await findInterview(deps.sql, id) : null;
    if (!row) return send(c, errorReply(404, "not_found"));
    return c.json(toView(row));
  });

  app.get("/interviews/:id/bank", async (c) => {
    const id = c.req.param("id");
    const row = UUID_RE.test(id) ? await findInterview(deps.sql, id) : null;
    if (!row) return send(c, errorReply(404, "not_found"));
    return send(c, await interviewBankView(deps.sql, row));
  });

  // Review of the candidate's gap probes. Core-bank questions are not
  // editable here: they were reviewed and locked with the job's bank.
  app.patch("/interviews/:id/bank", async (c) => {
    const id = c.req.param("id");
    const parsed = parseJson(c.get("rawBody"), BankEdit);
    if (!parsed.ok) return send(c, parsed.reply);
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));
    const edit = parsed.data;

    const row = await findInterview(deps.sql, id);
    if (!row) return send(c, errorReply(404, "not_found"));
    const gate = gapReviewGate(row);
    if (gate) return send(c, gate);

    if (edit.op === "regenerate") {
      if (!deps.llm) return send(c, errorReply(503, "llm_not_configured"));
      const llm = deps.llm;
      const planning = (await findPlanningInterview(deps.sql, id))!;
      const failed = await regenerateQuestion(
        deps,
        {
          owner: { kind: "interview", id },
          parent: { interviewId: id },
          lockParent: async (tx) => {
            const current = await findInterview(tx, id, { forUpdate: true });
            return current ? gapReviewGate(current) : errorReply(404, "not_found");
          },
          generate: (_question, existingTexts) =>
            generateGapReplacement(
              { sql: deps.sql, llm, ceilings: deps.ceilings },
              planning,
              existingTexts
            ),
        },
        edit.question_id
      );
      if (failed) return send(c, failed);
    } else {
      const failed = await deps.sql.begin(async (tx) => {
        const current = await findInterview(tx, id, { forUpdate: true });
        if (!current) return errorReply(404, "not_found");
        const blocked = gapReviewGate(current);
        if (blocked) return blocked;
        const question = await findQuestion(tx, { interviewId: id }, edit.question_id);
        if (!question) return errorReply(404, "not_found");
        return applySimpleEdit(tx, question, edit);
      });
      if (failed) return send(c, failed);
    }

    const updated = (await findInterview(deps.sql, id))!;
    return send(c, await interviewBankView(deps.sql, updated));
  });

  // Locks this interview's questions and draws its plan: the warm-up first,
  // the mix's technical and behavioral questions from the locked core bank
  // in a random interleaving, then the gap probes. The plan's hash binds it
  // to the core bank's hash. Dispatch to the candidate arrives with I2, so
  // the status stays awaiting_review.
  app.post("/interviews/:id/bank/lock", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const row = await findInterview(tx, id, { forUpdate: true });
      if (!row || !row.job_bank_id) return errorReply(404, "not_found");
      if (row.bank_locked_at) return interviewBankView(tx, row);
      if (row.status !== "awaiting_review") {
        return errorReply(409, "invalid_transition", `interview is ${row.status}`);
      }
      const bank = await findJobBank(tx, row.job_bank_id);
      if (!bank || bank.status !== "locked" || !bank.bank_hash) {
        return errorReply(409, "bank_not_locked");
      }
      const mix = row.config.mix;
      const gap = (await listQuestions(tx, { interviewId: id })).filter(
        (q) => q.status !== "removed"
      );
      // Checked before anything is written: an early return here commits.
      if (gap.length < mix.gap_probe) return errorReply(409, "insufficient_bank");
      const core = (await listQuestions(tx, { jobBankId: bank.id })).filter(
        (q) => q.status === "approved"
      );
      const plan = drawPlan({
        core: core.map((q) => ({ id: q.id, kind: q.kind, content: effectiveContent(q) })),
        gapProbes: gap.map((q) => ({ id: q.id, kind: q.kind, content: effectiveContent(q) })),
        mix,
      });
      if (!plan) return errorReply(409, "insufficient_bank");

      // Reviewing gap probes is optional: locking approves what is pending.
      await tx`
        update bank_questions set status = 'approved', updated_at = now()
        where interview_id = ${id} and status = 'pending'`;
      const planHash = computePlanHash(bank.bank_hash, plan);
      const [locked] = await tx<{ id: string }[]>`
        update interviews
        set bank_locked_at = now(), plan = ${tx.json(jsonb(plan))}, plan_hash = ${planHash},
            updated_at = now()
        where id = ${id}
        returning id`;
      await tx`
        insert into audit_log (interview_id, actor, action)
        values (${locked!.id}, 'platform', 'bank_locked')`;
      await enqueueEvent(tx, {
        type: "interview.bank_locked",
        interviewId: id,
        externalRef: row.external_ref,
        status: row.status,
        data: { plan_hash: planHash },
      });
      return interviewBankView(tx, (await findInterview(tx, id))!);
    });
    return send(c, reply);
  });

  app.post("/interviews/:id/cancel", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const row = await findInterview(tx, id, { forUpdate: true });
      if (!row) return errorReply(404, "not_found");
      // Cancelling twice is not an error, and does not report twice.
      if (row.status === "cancelled") return { status: 200 as const, body: toView(row) };
      if (!canTransition(row.status, "cancelled")) {
        return errorReply(409, "invalid_transition", `cannot cancel from ${row.status}`);
      }
      // The allowance unit is not given back: a cancellation is the
      // company's decision, not a failure of the service (D33).
      const moved = (await transition(tx, id, row.status, "cancelled", "platform", "cancelled"))!;
      await enqueueEvent(tx, {
        type: "interview.cancelled",
        interviewId: id,
        externalRef: moved.external_ref,
        status: moved.status,
      });
      return { status: 200 as const, body: toView(moved) };
    });
    return send(c, reply);
  });

  // Erasure (design §8.1). Idempotent: deleting what is already gone is a
  // success, so the platform's retention job can simply retry.
  app.delete("/interviews/:id", async (c) => {
    const id = c.req.param("id");
    if (UUID_RE.test(id)) await deleteInterview(deps.sql, id);
    return c.body(null, 204);
  });

  // Issued only after the platform has verified that the signed-in user owns
  // this interview; the candidate_ref must match what the interview was
  // created with, so a platform bug cannot hand one candidate another's room.
  app.post("/interviews/:id/session-token", async (c) => {
    const id = c.req.param("id");
    const parsed = parseJson(c.get("rawBody"), SessionTokenRequest);
    if (!parsed.ok) return send(c, parsed.reply);
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const row = await findInterview(tx, id);
      if (!row) return errorReply(404, "not_found");
      if (row.candidate_ref !== parsed.data.candidate_ref) {
        return errorReply(403, "candidate_mismatch");
      }
      if (!acceptsCandidate(row.status)) {
        return errorReply(409, "not_accepting_candidates", row.status);
      }
      const epoch = await bumpSessionEpoch(tx, id);
      const { token, expiresAt } = await mintSessionToken(
        deps.sessionKeys,
        { interviewId: id, candidateRef: row.candidate_ref, epoch },
        deps.now()
      );
      const body: SessionTokenResponse = { token, expires_at: expiresAt.toISOString() };
      return { status: 200 as const, body };
    });
    return send(c, reply);
  });

  return app;
}
