# Smart Recruitment Portal (SRP)

Recruitment website for a single company: a public Arabic (RTL) job portal
plus an authenticated HR dashboard with AI-assisted candidate evaluation.
Full specification: [`../CLAUDE.md`](../CLAUDE.md).

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui ·
Supabase (Postgres, Auth, Storage, Edge Functions) · Google Gemini 3.5 Flash
(Edge Function only).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL
   and anon key. **Never** put the Gemini key or the service-role key in
   Next.js env vars.
3. In the Supabase dashboard: **disable public sign-ups**
   (Authentication → Sign In / Up → disable "Allow new users to sign up").
   HR users are created by an admin only. (Local dev: already disabled in
   `supabase/config.toml`.)
4. Apply the database: `npx supabase db reset` locally (needs Docker), or
   `npx supabase db push` + run `supabase/seed.sql` against a linked project.
5. Verify RLS: run `supabase/tests/rls_check.sql` against the seeded
   database (psql or SQL editor) — every row must show `pass = t` and every
   NOTICE must start with PASS.
6. `npm run dev` — seeded logins: `admin@example.com / Admin123!`,
   `hr@example.com / Hr123456!` (dev only).

## One-time email setup (M3)

The confirmation email is sent by the `send-email` Edge Function (applies
gracefully degrade if it is missing — submissions never fail because of
email). To activate it:

```bash
npx supabase functions deploy send-email --project-ref htwdasmuxfrdtfnrgkue
npx supabase secrets set RESEND_API_KEY=... EMAIL_FROM="التوظيف <jobs@yourdomain.com>" SITE_URL=https://your-site.example --project-ref htwdasmuxfrdtfnrgkue
```

Requires `supabase login` (or `SUPABASE_ACCESS_TOKEN`) and a Resend account
with a verified sender domain.

## One-time AI pipeline setup (M4)

```bash
npx supabase functions deploy analyze-application --project-ref htwdasmuxfrdtfnrgkue
npx supabase secrets set GEMINI_API_KEY=... --project-ref htwdasmuxfrdtfnrgkue
```

> **Redeploy required (2026-07-10):** the local function code carries three
> fixes not yet deployed — model `gemini-3.5-flash`, the §7.1 non-CV
> fallback in the evaluation schema, and the mammoth `{ buffer }` fix for
> DOCX extraction under Deno. Run the deploy command above once, then use
> the "إعادة التحليل" button on any failed applicant.

The Gemini key lives ONLY here (D3) — never in Next.js env vars. To smoke-test
the exact pipeline (same prompts/schema/model) against the 3 CV fixtures in
`supabase/fixtures/cvs/` before deploying, ask the agent to run the prepared
`analyze-live` harness with `GEMINI_API_KEY` set in the environment.

## Milestone status

- [x] M0 — Scaffold: RTL shell, Supabase wiring, auth + role gate
- [x] M1 — Schema: migration, RLS, storage bucket, seed
- [x] M2 — Jobs management + public portal
- [x] M3 — Apply flow (without AI) — email needs one-time setup below
- [x] M4 — AI pipeline (Edge Function + Gemini) — needs one-time setup below
- [x] M5 — HR review screens — apply migration `0002_interview_notes.sql`
      to the remote project (SQL editor or `supabase db push`)
- [x] M6 — Status pipeline + emails (migration `0003_status_rpc.sql` applied)
- [x] M7 — Stats (FR-09), retention cron, hardening

## M7 housekeeping setup (retention + analysis retries)

Daily maintenance (retry failed analyses, delete applications + CV files
older than `settings.retention_months`, sweep orphaned uploads) runs in the
`housekeeping` Edge Function, triggered daily at 03:00 UTC by pg_cron:

```bash
npx supabase functions deploy housekeeping --project-ref htwdasmuxfrdtfnrgkue
```

Then apply `supabase/migrations/0004_housekeeping_cron.sql` (SQL editor) to
create the schedule. Also redeploy `send-email` once more — M6 added the
`interview_invited` and `rejected` templates:

```bash
npx supabase functions deploy send-email --project-ref htwdasmuxfrdtfnrgkue
```
