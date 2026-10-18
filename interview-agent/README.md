# interview-agent

The virtual first-round interview service for حكيم (CLAUDE.md **D30–D33**,
design: [`docs/INTERVIEW-AGENT-DESIGN.md`](../docs/INTERVIEW-AGENT-DESIGN.md)).
A separate server: the platform reaches it only through the signed API below,
and it reports back only through signed webhooks.

## Status — milestone I1 (question bank)

| Built | Arrives in |
|---|---|
| HMAC-signed platform API with replay guards and idempotency | I0 |
| Candidate session tokens (Ed25519, single live device) | I0 |
| Interview lifecycle state machine + audit trail | I0 |
| Transactional outbox delivering signed webhooks with backoff | I0 |
| Erasure on request (`DELETE`) | I0 |
| Core question bank per job: generation, staff review, lock + `bank_hash` | I1 |
| Gap probes per candidate, the plan drawn at lock + `plan_hash` | I1 |
| Model gateway, harness budget, interview allowance (D33) | I1 |
| Interview room (text) | I2 |
| Evaluation pipeline + report | I3 |
| Code sandbox (Judge0) | I4 |
| Voice | I5 |

### How questions are made

1. The platform creates a **job bank** (`POST /job-banks`). The planner worker
   (`src/planner/worker.ts`) claims it with a lease, makes one model call
   (`src/prompts/bank.ts`, `BANK_PROMPT_VERSION`), and filters every
   question (`src/planner/validate.ts`): contract check, kind rules, no
   protected category (age, family, origin, religion, health, gender,
   politics, address — in the question, its points and its rubric), nothing
   generic, no near-duplicates. A bank that keeps enough questions waits for
   review; otherwise one more attempt, then `failed` with a code.
2. Staff approve, edit (stored beside the model's original, which the
   database refuses to change), remove, restore or regenerate questions,
   then **lock**. A locked bank is frozen by triggers and fingerprinted.
3. An **interview** is created against a locked bank. The allowance unit
   is claimed in the same transaction as the insert; with gap probes in the
   mix the planner writes them from the candidate's profile
   (`src/prompts/gap-probes.ts`, untrusted data inside delimiters).
4. Locking the interview's questions approves pending gap probes and draws
   the plan: the warm-up, then a random interleaving of the mix's technical
   and behavioral questions from the locked bank, then the gap probes.

Every model call goes through `callTool()` (`src/llm/run.ts`): budget
reserved first (`src/orchestrator/budget.ts` — never exceeded, even by
concurrent calls), a 45-second timeout, one `llm_calls` row with hashes and
counts but no text (D8), and zod validation before anything is stored (D5).
`src/llm/gemini.ts` is the only module that imports the model SDK.

## API

Platform → agent, every request signed (`src/auth/hmac.ts`):

| Method | Path | |
|---|---|---|
| `POST` | `/v1/platform/job-banks` | start generating a job's bank (`Idempotency-Key`) |
| `GET` | `/v1/platform/job-banks/{id}` | read, with its questions |
| `PATCH` | `/v1/platform/job-banks/{id}` | one review action (`BankEdit`) |
| `POST` | `/v1/platform/job-banks/{id}/lock` | lock and fingerprint |
| `POST` | `/v1/platform/job-banks/{id}/retry` | regenerate a failed bank |
| `POST` | `/v1/platform/interviews` | create from a locked bank (`Idempotency-Key`) |
| `GET` | `/v1/platform/interviews/{id}` | read |
| `GET` | `/v1/platform/interviews/{id}/bank` | gap probes and plan |
| `PATCH` | `/v1/platform/interviews/{id}/bank` | review a gap probe (`BankEdit`) |
| `POST` | `/v1/platform/interviews/{id}/bank/lock` | approve pending probes, draw the plan |
| `POST` | `/v1/platform/interviews/{id}/cancel` | cancel (emits `interview.cancelled`) |
| `DELETE` | `/v1/platform/interviews/{id}` | erase everything |
| `POST` | `/v1/platform/interviews/{id}/session-token` | candidate token |

Error codes are listed above `ApiError` in the contract; the platform maps
each to Arabic wording and never shows `message`.

Candidate browser → agent, `Authorization: Bearer <session token>`:
`GET /v1/session`, `POST /v1/session/refresh`.

Health: `GET /health`, `GET /health/ready`.

The schemas are in `src/contract/index.ts`. That file and `src/auth/hmac.ts`
are copied byte for byte into `srp/supabase/functions/_shared/`; after
editing either, run `npm run contract:sync` (a test fails on drift).

## Run

```bash
npm ci
cp .env.example .env     # fill in; npm run keygen prints SESSION_SIGNING_JWK
npm run migrate          # once per deploy
npm run dev
```

## Test

```bash
npm test                 # starts a throwaway Postgres if DATABASE_URL is unset
npm run typecheck
```

Tests never call a real model: `tests/fake-llm.ts` scripts the answers and
records every call.

## Deploy

`Dockerfile` builds the production image. Run `node dist/db/migrate-cli.js`
as a release step, then `node dist/index.js`. Host it in a Saudi region
(design §12.1); the code sandbox arrives with I4 on its own VM with no
outbound network (D32).
