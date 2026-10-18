// /v1/platform/job-banks/* — a job's core question bank (design §4.2–4.3):
// generated once, reviewed by staff (mandatory, D30), locked, and shared by
// every interview for that job. Mounted under the platform routes, so every
// request here has already passed the HMAC signature and replay checks.
import { Hono } from "hono";
import type { Sql, Tx } from "../db/client.ts";
import type { AppEnv, Reply } from "./http.ts";
import { errorReply, idempotent, parseJson, send, UUID_RE } from "./http.ts";
import { BankEdit, CreateJobBankRequest } from "../contract/index.ts";
import {
  computeBankHash,
  findJobBank,
  findQuestion,
  insertJobBank,
  listQuestions,
  nextBankVersion,
  toJobBankView,
  type JobBankRow,
} from "../db/banks.ts";
import type { LlmClient } from "../llm/types.ts";
import { recordGenerationStart, type Ceilings } from "../orchestrator/budget.ts";
import { generateCoreReplacement } from "../planner/generate.ts";
import { isCoreKind } from "../prompts/bank.ts";
import { applySimpleEdit, regenerateQuestion } from "./review.ts";

// A locked bank needs at least this many approved questions: enough for a
// short interview's warm-up, technical and behavioral share.
export const MIN_APPROVED_TO_LOCK = 6;

export type JobBankDeps = {
  sql: Sql;
  llm: LlmClient | null;
  ceilings: Ceilings;
};

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

// Review is possible only while the bank awaits it.
function reviewGate(bank: JobBankRow): Reply | null {
  if (bank.status === "locked") return errorReply(409, "bank_locked");
  if (bank.status !== "awaiting_review") {
    return errorReply(409, "invalid_transition", `bank is ${bank.status}`);
  }
  return null;
}

export function jobBankRoutes(deps: JobBankDeps) {
  const app = new Hono<AppEnv>();

  async function view(sql: Sql | Tx, bank: JobBankRow): Promise<Reply> {
    const questions = await listQuestions(sql, { jobBankId: bank.id });
    return { status: 200, body: toJobBankView(bank, questions, deps.ceilings) };
  }

  // Checks in order: a model is configured, the plan includes interviews,
  // no version of this bank is already in progress, the daily limit. All of
  // them before anything is created.
  app.post("/", async (c) => {
    const key = c.req.header("idempotency-key");
    if (!key || key.length > 200) {
      return send(c, errorReply(400, "idempotency_key_required"));
    }
    const raw = c.get("rawBody");
    const parsed = parseJson(raw, CreateJobBankRequest);
    if (!parsed.ok) return send(c, parsed.reply);
    const request = parsed.data;

    const reply = await idempotent(deps.sql, "create_job_bank", key, raw, async () => {
      if (!deps.llm) return errorReply(503, "llm_not_configured");
      if (request.tenant.monthly_interview_allowance === 0) {
        return errorReply(402, "interviews_not_in_plan");
      }
      try {
        return await deps.sql.begin(async (tx) => {
          const next = await nextBankVersion(tx, request.external_ref);
          if (next.inProgress) return errorReply(409, "bank_in_progress");
          if (!(await recordGenerationStart(tx, request.tenant.ref, deps.ceilings.dailyGenerations))) {
            return errorReply(429, "rate_limited");
          }
          const row = await insertJobBank(tx, request, next.version);
          return { status: 202 as const, body: toJobBankView(row, [], deps.ceilings) };
        });
      } catch (err) {
        if (isUniqueViolation(err)) return errorReply(409, "bank_in_progress");
        throw err;
      }
    });
    return send(c, reply);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const bank = UUID_RE.test(id) ? await findJobBank(deps.sql, id) : null;
    if (!bank) return send(c, errorReply(404, "not_found"));
    return send(c, await view(deps.sql, bank));
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = parseJson(c.get("rawBody"), BankEdit);
    if (!parsed.ok) return send(c, parsed.reply);
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));
    const edit = parsed.data;

    const bank = await findJobBank(deps.sql, id);
    if (!bank) return send(c, errorReply(404, "not_found"));
    const gate = reviewGate(bank);
    if (gate) return send(c, gate);

    if (edit.op === "regenerate") {
      if (!deps.llm) return send(c, errorReply(503, "llm_not_configured"));
      const llm = deps.llm;
      const failed = await regenerateQuestion(
        deps,
        {
          owner: { kind: "job_bank", id },
          parent: { jobBankId: id },
          lockParent: async (tx) => {
            const current = await findJobBank(tx, id, { forUpdate: true });
            return current ? reviewGate(current) : errorReply(404, "not_found");
          },
          generate: async (question, existingTexts) => {
            if (!isCoreKind(question.kind)) return null;
            return generateCoreReplacement(
              { sql: deps.sql, llm, ceilings: deps.ceilings },
              bank,
              { kind: question.kind, competency: (question.edited ?? question.original).competency },
              existingTexts
            );
          },
        },
        edit.question_id
      );
      if (failed) return send(c, failed);
    } else {
      const failed = await deps.sql.begin(async (tx) => {
        const current = await findJobBank(tx, id, { forUpdate: true });
        if (!current) return errorReply(404, "not_found");
        const blocked = reviewGate(current);
        if (blocked) return blocked;
        const question = await findQuestion(tx, { jobBankId: id }, edit.question_id);
        if (!question) return errorReply(404, "not_found");
        return applySimpleEdit(tx, question, edit);
      });
      if (failed) return send(c, failed);
    }

    const updated = (await findJobBank(deps.sql, id))!;
    return send(c, await view(deps.sql, updated));
  });

  // Locking freezes the bank (the database refuses any later change to its
  // questions) and fingerprints the approved set, so every interview and
  // report can name the exact questions it was built from.
  app.post("/:id/lock", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const bank = await findJobBank(tx, id, { forUpdate: true });
      if (!bank) return errorReply(404, "not_found");
      // Locking twice is not an error: the platform may retry a lock whose
      // answer it never received.
      if (bank.status === "locked") return view(tx, bank);
      if (bank.status !== "awaiting_review") {
        return errorReply(409, "invalid_transition", `bank is ${bank.status}`);
      }
      const questions = await listQuestions(tx, { jobBankId: id });
      if (questions.some((q) => q.status === "pending")) {
        return errorReply(409, "pending_questions");
      }
      if (questions.filter((q) => q.status === "approved").length < MIN_APPROVED_TO_LOCK) {
        return errorReply(409, "too_few_questions");
      }
      const [locked] = await tx<JobBankRow[]>`
        update job_banks
        set status = 'locked', locked_at = now(), bank_hash = ${computeBankHash(questions)},
            lease_until = null, updated_at = now()
        where id = ${id}
        returning *`;
      return view(tx, locked!);
    });
    return send(c, reply);
  });

  // A failed generation starts again (and counts toward the daily limit).
  app.post("/:id/retry", async (c) => {
    const id = c.req.param("id");
    if (!deps.llm) return send(c, errorReply(503, "llm_not_configured"));
    if (!UUID_RE.test(id)) return send(c, errorReply(404, "not_found"));

    const reply = await deps.sql.begin(async (tx) => {
      const bank = await findJobBank(tx, id, { forUpdate: true });
      if (!bank) return errorReply(404, "not_found");
      if (bank.status !== "failed") {
        return errorReply(409, "invalid_transition", `bank is ${bank.status}`);
      }
      if (!(await recordGenerationStart(tx, bank.tenant_ref, deps.ceilings.dailyGenerations))) {
        return errorReply(429, "rate_limited");
      }
      const [restarted] = await tx<JobBankRow[]>`
        update job_banks
        set status = 'generating', attempts = 0, failure = null, lease_until = null,
            updated_at = now()
        where id = ${id}
        returning *`;
      const result = await view(tx, restarted!);
      return { status: 202 as const, body: result.body };
    });
    return send(c, reply);
  });

  return app;
}
