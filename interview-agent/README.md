# interview-agent

The virtual first-round interview service for حكيم (CLAUDE.md **D30–D33**,
design: [`docs/INTERVIEW-AGENT-DESIGN.md`](../docs/INTERVIEW-AGENT-DESIGN.md)).
A separate server: the platform reaches it only through the signed API below,
and it reports back only through signed webhooks.

## Status — milestone I0 (contract & skeleton)

| Built | Arrives in |
|---|---|
| HMAC-signed platform API with replay guards and idempotency | — |
| Candidate session tokens (Ed25519, single live device) | — |
| Interview lifecycle state machine + audit trail | — |
| Transactional outbox delivering signed webhooks with backoff | — |
| Erasure on request (`DELETE`) | — |
| Question bank generation + HR review | I1 |
| Interview room (text) | I2 |
| Evaluation pipeline + report | I3 |
| Code sandbox (Judge0) | I4 |
| Voice | I5 |

No model is called yet, so the interview quota (D33) is enforced from I1,
where the first model call is made.

## API (I0)

Platform → agent, every request signed (`src/auth/hmac.ts`):

| Method | Path | |
|---|---|---|
| `POST` | `/v1/platform/interviews` | create (requires `Idempotency-Key`) |
| `GET` | `/v1/platform/interviews/{id}` | read |
| `POST` | `/v1/platform/interviews/{id}/cancel` | cancel (emits `interview.cancelled`) |
| `DELETE` | `/v1/platform/interviews/{id}` | erase everything |
| `POST` | `/v1/platform/interviews/{id}/session-token` | candidate token |

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

## Deploy

`Dockerfile` builds the production image. Run `node dist/db/migrate-cli.js`
as a release step, then `node dist/index.js`. Host it in a Saudi region
(design §12.1); the code sandbox arrives with I4 on its own VM with no
outbound network (D32).
