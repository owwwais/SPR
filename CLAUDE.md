# CLAUDE.md — Smart Recruitment Portal (SRP)
## AI Coding Agent Specification (v1.0)

> **READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.**
> A human software engineer supervises this project and reviews all output. Follow this spec exactly. When the spec and your instinct conflict, **the spec wins**. When something is ambiguous, **STOP and ask the supervising engineer**. Do not invent features.

---

## 1. Project Summary

A recruitment website for a single company, with two faces:

1. **Public portal:** visitors browse open jobs, view details, and apply by submitting a form + CV file (PDF/DOCX). No account required.
2. **HR dashboard (authenticated):** HR staff publish/manage jobs, and review applicants **ranked by an AI fit score**. For each applicant the AI provides: extracted structured CV data, a fit score (0–100), a written justification (strengths / gaps / red flags), and tailored interview questions.

**Ethical rule baked into the product:** the AI score is advisory. Accept/reject is always a human action. Every score is displayed WITH its justification. This is non-negotiable.

**Product language:** UI 100% Arabic, RTL. CVs may be Arabic or English. Code, DB identifiers, comments, commits: English.

---

## 2. Non-Negotiable Engineering Decisions

| # | Decision |
|---|----------|
| D1 | **Stack:** Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui on Vercel. **Supabase** for Postgres, Auth, Storage, Edge Functions. |
| D2 | **AI model: Google Gemini 3.5 Flash** (`gemini-3.5-flash`) via the official `@google/genai` SDK. One model for all AI tasks (extraction + scoring + questions) in a single call per application. _(Changed from `gemini-2.5-flash` by engineer decision, 2026-07-10.)_ |
| D3 | **The Gemini API key never reaches the browser or Next.js client code.** All AI calls happen inside one Supabase Edge Function: `analyze-application`. |
| D4 | **Applying never fails because of AI.** Submission writes the application row + uploads the CV, then triggers analysis asynchronously. `applications.analysis_status` tracks: `pending → processing → done | failed`. Failed analyses are retryable (max 3 attempts) and re-runnable from the dashboard. |
| D5 | **Structured output only.** Gemini is called with `responseMimeType: "application/json"` + a `responseSchema`. The Edge Function validates the response with zod before persisting. If validation fails → mark `failed`, store raw error, never store malformed data. |
| D6 | **Prompts are versioned assets.** They live in `supabase/functions/analyze-application/prompts.ts`, exported with a `PROMPT_VERSION` constant. Every evaluation row stores the `prompt_version` and `model` used. |
| D7 | Authorization = **RLS on every table**. Public (anon) role can: read published jobs, insert applications, upload to the CV bucket. Everything else requires an authenticated HR/admin user. |
| D8 | CVs are sensitive personal data: private Storage bucket (`cvs`), served to HR via short-lived signed URLs only. A scheduled cleanup deletes CVs + applications older than `retention_months` (setting, default 12). Applicant data is never used for model training and never logged in full. |
| D9 | Soft deletes on `jobs`. Applications are never hard-deleted except by the retention job. Every status change is recorded in `status_history`. |
| D10 | Allowed dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `@google/genai` (Edge Function only), `zod`, `react-hook-form`, `mammoth` (DOCX text extraction, Edge Function only), `date-fns`, `recharts`, `lucide-react`, shadcn/ui deps, `resend`. **Ask before adding anything else.** No ORM, no state library, no i18n framework (single `ar.ts` dictionary). |

### 2.1 SaaS Conversion Decisions (v2.0 — approved 2026-08-06)

The product becomes a multi-tenant SaaS: many customer companies (**tenants**),
one platform owner. Full rationale in `docs/SAAS_PLAN.md`.

| # | Decision |
|---|----------|
| **D11** | **Tenancy = one database, one schema, `org_id` on every tenant-scoped row, isolation by RLS.** No schema-per-tenant, no database-per-tenant. |
| **D12** | **`memberships` is the only source of truth for who belongs to which org.** Never trust JWT claims for tenancy — `user_metadata` is user-writable. Membership lookups go through `security definer` helpers. |
| **D13** | **Platform admins live in their own table (`platform_admins`), never as a value in a tenant role enum.** A tenant must not be able to escalate to platform access even if a tenant-facing policy is wrong. |
| **D14** | **A user may belong to more than one organization** (recruitment agencies; audited impersonation). `profiles` holds identity only; `memberships` holds (org, role). |
| **D15** | **Applying is server-side only.** `anon` has no INSERT on `applications` and no INSERT on the `cvs` bucket. The public form posts to the `submit-application` Edge Function, which validates, rate-limits, uploads with the service role and inserts. |
| **D16** | **AI quota is checked inside `analyze-application` before the Gemini call**, never in the UI. (Enforcement lands with billing in S5; the call site is prepared in S1.) |
| **D17** | **Public tenant routing is path-first: `/c/{slug}`.** Subdomains rewrite to it in `proxy.ts`; custom domains are a paid-plan feature. |
| **D18** | **`/admin` stays the tenant workspace. `/platform` is the platform console.** |
| **D19** | Pricing = seats + a monthly analysis quota. The analysis is both the unit of value and the unit of cost. |
| **D20** | Payment provider sits behind `lib/billing/provider.ts`. Manual bank transfer first, Moyasar next. |
| **D21** | The public job marketplace (`/jobs`, `/companies`) is part of the product, not an add-on. |
| **D22** | **Impersonation is a time-boxed, reason-required, fully audited session** (60 minutes), surfaced with a permanent banner. It grants access through `current_org_ids()`, so RLS stays the single gate. |
| **D23** | Arabic only in v1. D10's "no i18n framework" still holds. |
| **D24** | "No score without justification" and "the decision is always human" are **product promises**, not just internal rules. They get a public page and an exportable transparency report. |
| **D25** | **The product is named حكيم (`hakeem`).** It lives as `PRODUCT_NAME` / `PRODUCT_SLUG` in `lib/i18n/ar.ts` and nowhere else — no page, email or migration may hard-code it. The name carries the positioning: a حكيم advises, it does not rule (D24). Root domain is read from `NEXT_PUBLIC_ROOT_DOMAIN` so subdomain routing (D17) is never coupled to a literal. |

**The isolation invariant (the one rule that outranks convenience):**
> Every query against a tenant-scoped table filters by `org_id` **in application code**
> *and* is constrained by RLS. Two independent layers, always. A page that relies on
> RLS alone is not acceptable, and neither is one that relies on the filter alone.

---

## 3. Repository Structure

Target structure for v2.0. Sections marked ☐ are not built yet — do not
create them ahead of their milestone.

```
srp/
├── app/
│   ├── (marketing)/                 # ☐ S6: landing, pricing, fairness, legal
│   ├── (public)/
│   │   ├── page.tsx                 # landing + featured jobs
│   │   ├── jobs/                    # list + [id] details + apply form
│   │   ├── c/[slug]/                # ☐ S3: per-tenant careers page
│   │   ├── companies/               # ☐ S6: company directory
│   │   └── track/[ref]/             # applicant status tracking by reference code
│   ├── (dashboard)/admin/           # TENANT workspace, scoped to one org
│   │   ├── jobs/                    # FR-01 manage jobs
│   │   ├── jobs/[id]/applicants/    # FR-06 ranked applicants
│   │   ├── applications/[id]/       # applicant detail: CV, AI eval, questions, status
│   │   ├── stats/                   # FR-09
│   │   └── settings/                # org profile, retention, team (admin only)
│   ├── (platform)/platform/         # ☐ S4: PLATFORM console (owner only)
│   └── login/
├── components/
├── lib/
│   ├── supabase/                    # client factories
│   ├── validations/                 # zod schemas (shared: forms + edge)
│   ├── auth.ts                      # requireMembership() — the tenancy gate
│   └── i18n/ar.ts                   # ALL user-facing Arabic strings
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── analyze-application/     # Gemini call lives ONLY here
│   │   │   ├── index.ts
│   │   │   └── prompts.ts           # versioned prompts (see §7)
│   │   ├── submit-application/      # D15: the ONLY write path for applicants
│   │   ├── manage-users/            # team accounts (org-scoped)
│   │   ├── housekeeping/            # cron: analysis retries + per-org retention
│   │   └── send-email/              # Resend wrapper
│   ├── scripts/                     # one-off operational scripts (service role)
│   ├── tests/                       # RLS + tenant-isolation checks
│   └── seed.sql
└── types/database.ts                # generated
```

---

## 4. Database Schema (Authoritative — `0001_init.sql` … `0006_multitenancy.sql`)

```sql
create type job_status as enum ('draft','published','closed');
create type job_type as enum ('full_time','part_time','contract','remote','internship');
create type app_status as enum ('new','under_review','interview','accepted','rejected');
create type analysis_status as enum ('pending','processing','done','failed');

-- ---- tenancy (0006) ----
create type org_status as enum ('trial','active','past_due','suspended','cancelled');
create type member_role as enum ('owner','admin','hr','viewer');

-- The tenant. Replaces the single-row `settings` table of v1.
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,          -- careers URL + future subdomain
  name text not null,
  logo_path text, cover_path text, about text, website text,
  industry text, city text, brand_color text,
  status org_status not null default 'trial',
  listed_publicly boolean not null default true,   -- shows in the marketplace
  retention_months int not null default 12 check (retention_months between 1 and 60),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Identity only. The role lives on the membership (D14).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'hr',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- D13: platform staff are NOT a tenant role.
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- D22: audited, time-boxed support access. Read by current_org_ids().
create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  reason text not null,
  expires_at timestamptz not null default now() + interval '60 minutes',
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  department text,
  location text,
  type job_type not null,
  description text not null,          -- markdown
  requirements text not null,         -- markdown; THIS is the AI matching source
  skills text[] not null default '{}',
  min_years_experience int default 0,
  status job_status not null default 'draft',
  closes_at date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id),
  ref_code text not null unique,                 -- short public tracking code
  full_name text not null,
  email text not null,
  phone text not null,
  cv_path text not null,                         -- storage path in 'cvs' bucket
  cv_mime text not null check (cv_mime in
    ('application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  cover_note text,
  status app_status not null default 'new',
  analysis_status analysis_status not null default 'pending',
  analysis_attempts int not null default 0,
  analysis_error text,                           -- D5: why the last run failed
  created_at timestamptz not null default now(),
  unique (job_id, email)                         -- FR-03: no duplicate applications
);

create table ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  extracted jsonb not null,        -- structured CV data (schema in §6)
  fit_score int not null check (fit_score between 0 and 100),
  score_breakdown jsonb not null,  -- per-criterion scores (schema in §6)
  justification jsonb not null,    -- strengths[], gaps[], red_flags[] — Arabic text
  interview_questions jsonb not null, -- questions[] — Arabic text
  created_at timestamptz not null default now(),
  unique (application_id)          -- latest eval only; re-run replaces via upsert
);

create table status_history (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  from_status app_status,
  to_status app_status not null,
  changed_by uuid references profiles(id),   -- null = system
  note text,
  created_at timestamptz not null default now()
);

create index on jobs(org_id, status) where deleted_at is null;
create index on applications(org_id, job_id, status);
create index on applications(analysis_status) where analysis_status in ('pending','failed');
create index on memberships(user_id);   -- every RLS policy goes through this
```

**Consistency guards.** `org_id` alone does not stop a bug from attaching an
application to another org's job. Triggers enforce that
`applications.org_id = jobs.org_id`, and that `ai_evaluations` /
`status_history` inherit their application's `org_id`.

**Helper functions** (all `security definer`, all `stable`):

| Function | Meaning |
|---|---|
| `current_org_ids() → uuid[]` | Every org the caller may touch: their memberships, plus any live impersonation session (D22). **The single source of tenancy for RLS.** |
| `is_org_member(org, roles[]) → bool` | Membership with an optional role filter, for write policies. |
| `org_role(org) → member_role` | The caller's role in one org. |
| `is_platform_admin() → bool` | Reads `platform_admins` only (D13). |
| `can_manage_application(app) → bool` | Used by Edge Functions to authorize a re-run against the application's own org. |

In policies, always call these wrapped in a subquery —
`org_id = any ((select public.current_org_ids()))` — so Postgres evaluates
them once per statement instead of once per row.

### 4.1 RLS Matrix (enable RLS on every table)

Every tenant row is reachable only when `org_id = any (current_org_ids())`.
Roles below are **within one organization**; a member of org A has no
relationship at all to org B's rows.

| Table | anon (public) | viewer | hr | admin | owner | platform_admin |
|---|---|---|---|---|---|---|
| organizations | select where `listed_publicly and status in ('trial','active') and deleted_at is null` | select own | select own | select + update own | + delete own | select all |
| memberships | none | select own org | select own org | CRUD (cannot touch an `owner`) | full CRUD | select all |
| profiles | none | select self + co-members | ↑ | ↑ | ↑ | select all |
| jobs | select where `status='published' and deleted_at is null` **and the org is listed** | select | full CRUD (soft delete) | ↑ | ↑ | select all |
| applications | **none — insert goes through `submit-application` (D15)** | select | select + status via RPC | ↑ | ↑ | select all |
| ai_evaluations | none | select | select + update `interview_notes` only | ↑ | ↑ | select all |
| status_history | own history via `track_application(ref_code)` RPC only | select | select + insert | ↑ | ↑ | select all |
| platform_admins | none | none | none | none | none | full |
| impersonation_sessions | none | none | none | none | none | full |
| Storage `cvs` | **none** | read own org folder | ↑ | ↑ | ↑ | read (see below) |

Notes that are not optional:

- **`anon` cannot write anywhere.** `applications` inserts and CV uploads both
  go through the `submit-application` Edge Function, which derives `org_id`
  from the job — never from the client (D15).
- CV objects are named `cvs/{org_id}/{application_id}.{ext}`; the storage
  policy compares `(storage.foldername(name))[1]` against `current_org_ids()`.
- Status changes by HR must go through RPC
  `change_application_status(app_id, new_status, note)` which writes
  `status_history` and enqueues the applicant email. Direct `update` of
  `applications.status` is additionally guarded by a trigger that auto-inserts
  history (defense in depth).
- A platform admin reaches tenant data **only** through an active
  impersonation session, which is reason-required, expires in 60 minutes and
  is fully audited (D22). Being in `platform_admins` on its own grants
  read of platform tables, not of tenant rows.

### 4.2 Analysis Pipeline (D4)

1. Public form → server action → **Edge Function `submit-application`** (D15):
   rate-limit + optional Turnstile → resolve the job and derive `org_id` from
   it → verify the job is published, open, and its org is `trial`/`active` →
   validate (zod) → upload CV to `cvs/{org_id}/{application_id}.{ext}` with the
   service role → insert `applications` (status `pending`) → invoke
   `analyze-application` (fire-and-forget) → return `ref_code` to applicant +
   confirmation email.
2. Edge Function: set `processing` → download CV from Storage → if PDF: pass bytes to Gemini as `inlineData` (`application/pdf`); if DOCX: extract text with `mammoth`, pass as text → single Gemini call (§7) → zod-validate → upsert `ai_evaluations` → set `done`. On any error: increment `analysis_attempts`, set `failed`, log error message (never log CV content).
3. Dashboard button "إعادة التحليل" re-invokes the function for `failed` (or after prompt upgrades).
4. `pg_cron` daily: retry `failed` with `attempts < 3`; delete applications + CV files older than retention.

---

## 5. Functional Requirements → Acceptance Criteria

**FR-01 Jobs management (HR):** CRUD with draft/published/closed; closing hides the job publicly and blocks new applications; validation prevents publishing without requirements text.

**FR-02 Public portal:** jobs list with search + filters (department, location, type), job detail page. Server Components + ISR (`revalidate: 60`). Clean empty state when no jobs.

**FR-03 Apply:** form (name, email, phone, CV upload, optional cover note). Duplicate (job,email) rejected with a friendly Arabic message. Success screen shows `ref_code` + email confirmation. Works comfortably on mobile.

**FR-04/05 AI extraction + scoring:** happens per §4.2. Applicant detail page renders: extracted profile (experience timeline, education, skills, total years), fit score with color band (≥75 green, 50–74 amber, <50 red), score breakdown per criterion, and justification lists — all in Arabic.

**FR-06 Ranked applicants:** per-job screen, sorted by `fit_score desc nulls last`, with status filter and analysis-status indicator (spinner for pending/processing, retry button for failed). Score column always shows an "استشاري" (advisory) tooltip.

**FR-07 Interview questions:** shown on applicant page, editable (HR edits saved to a separate `notes`-style field on the evaluation — do NOT overwrite the AI original), copy-all button.

**FR-08 Status pipeline:** status change via RPC only; each change emails the applicant (Arabic templates for: received, interview invited, rejected — rejection email is respectful and generic, never includes AI reasoning). Public tracking page `/track/[ref]` shows current status + history timestamps only.

**FR-09 Stats:** applications per job, average fit score per job, status funnel counts, applications over time (Recharts).

---

## 6. AI Output JSON Schemas (zod — single source of truth)

Define in `lib/validations/evaluation.ts` and reuse in the Edge Function:

```ts
export const ExtractedCV = z.object({
  full_name: z.string().nullable(),
  total_years_experience: z.number().min(0).max(60),
  experiences: z.array(z.object({
    title: z.string(), company: z.string().nullable(),
    start: z.string().nullable(), end: z.string().nullable(), // "YYYY-MM" or null
    summary: z.string(),
  })),
  education: z.array(z.object({
    degree: z.string(), field: z.string().nullable(),
    institution: z.string().nullable(), year: z.string().nullable(),
  })),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  cv_language: z.enum(["ar","en","mixed"]),
});

export const ScoreBreakdown = z.object({
  required_skills: z.number().min(0).max(40),
  experience_relevance: z.number().min(0).max(30),
  experience_years: z.number().min(0).max(15),
  education_fit: z.number().min(0).max(10),
  bonus_signals: z.number().min(0).max(5),
});

export const Evaluation = z.object({
  extracted: ExtractedCV,
  score_breakdown: ScoreBreakdown,
  fit_score: z.number().int().min(0).max(100), // must equal sum of breakdown (verify in code)
  justification: z.object({
    strengths: z.array(z.string()).min(1).max(6),   // Arabic
    gaps: z.array(z.string()).max(6),               // Arabic
    red_flags: z.array(z.string()).max(4),          // Arabic
  }),
  interview_questions: z.array(z.object({
    question: z.string(),                            // Arabic
    kind: z.enum(["technical","behavioral","gap_probe"]),
    rationale: z.string(),                           // Arabic, one line
  })).min(8).max(10),
  confidence: z.enum(["high","medium","low"]),       // low => UI shows a caution badge
});
```

The Gemini call must set `responseMimeType: "application/json"` and a matching `responseSchema`; zod-validate anyway (D5). In code, recompute `fit_score` from the breakdown sum and overwrite the model's total if they differ.

---

## 7. Gemini Prompts (`prompts.ts`, `PROMPT_VERSION = "1.0"`)

### 7.1 System Prompt — Evaluation (use verbatim as the system instruction)

```
You are a rigorous, fair, and evidence-bound recruitment analyst for a single company.
You evaluate ONE candidate's CV against ONE specific job description. Your output is
advisory input for a human recruiter — it is never a hiring decision.

## Evidence rules (highest priority)
1. Use ONLY information present in the CV and the job description. Never invent,
   assume, or "fill in" facts. If information is missing, treat it as missing —
   not as negative, and not as positive.
2. Every strength, gap, and red flag you report MUST be traceable to specific CV
   content. Do not write generic filler like "strong communicator" unless the CV
   contains concrete evidence.
3. Distinguish between "skill explicitly stated" and "skill plausibly implied by a
   role". Implied skills earn at most half credit in required_skills.

## Fairness rules (strictly enforced)
4. IGNORE and NEVER factor in: name, gender, age, nationality, ethnicity, religion,
   marital status, photo, address/neighborhood, or the prestige of institutions by
   name alone. Judge education by degree level and field relevance only.
5. The CV language (Arabic or English), formatting quality, or design must NOT
   affect the score unless the job explicitly requires that language or design skill.
6. Employment gaps: report a gap longer than 6 months as a neutral observation in
   red_flags phrased as a question to explore in the interview — never as a
   disqualifier and never with speculation about its cause.

## Scoring rubric (total = 100; be strict, use the full range)
- required_skills (0–40): coverage of the job's stated required skills.
  Full points only if all required skills have explicit evidence. Missing a core
  required skill caps this criterion at 20.
- experience_relevance (0–30): how closely past roles match the job's actual
  responsibilities (not just titles). Same-title-different-work scores low.
- experience_years (0–15): compare total relevant years to the job's minimum.
  Meets minimum = 10–12. Below minimum: proportional. More years beyond
  minimum+5 adds nothing (cap at 15) — do not reward seniority inflation.
- education_fit (0–10): degree level and field relevance to the job.
- bonus_signals (0–5): certifications, measurable achievements (numbers, impact),
  or portfolio evidence directly relevant to the job. Max 5.

Calibration anchors: 85+ = interview immediately; 70–84 = strong, minor gaps;
50–69 = borderline, notable gaps; below 50 = weak match. A typical qualified
applicant should land in the 60–80 band. Reserve 90+ for exceptional evidence.
Never cluster scores at round numbers out of laziness; justify precision.

## Interview questions (8–10)
Generate questions a competent interviewer would actually ask THIS candidate for
THIS job: 3–4 technical questions targeting the job's core skills at the candidate's
apparent level, 2–3 behavioral questions tied to the job's real challenges, and
2–3 gap_probe questions that verify weak/unclear/implied claims in the CV
(including any employment gaps, phrased respectfully). No generic questions like
"tell me about yourself".

## Output rules
- Respond ONLY with JSON matching the provided schema. No markdown, no commentary.
- All human-readable text fields (strengths, gaps, red_flags, questions, rationales)
  MUST be written in Modern Standard Arabic, concise and professional. Keep
  technical terms (e.g., React, SQL) in English within the Arabic text.
- Set confidence to "low" if the CV text was short, garbled, or largely unreadable;
  "medium" if key sections were missing; otherwise "high".
- If the file content is not a CV at all, return fit_score 0, empty extractions,
  one red_flag saying (in Arabic) that the file does not appear to be a CV, and
  confidence "low".
```

### 7.2 User message template

```
<job>
Title: {{title}}
Type: {{type}} — Location: {{location}}
Minimum years of experience: {{min_years_experience}}
Required skills: {{skills}}
Requirements:
{{requirements}}
Description:
{{description}}
</job>

<candidate_cover_note>
{{cover_note or "—"}}
</candidate_cover_note>

The candidate's CV is attached (PDF) / provided below (extracted text).
Evaluate the candidate against this job per your instructions.
```

Call parameters: `model: "gemini-3.5-flash"`, `temperature: 0.2`, JSON mode + schema per §6, and a hard cap on extracted DOCX text length (~30k chars — truncate tail with a note appended to the prompt if exceeded).

---

## 8. Non-Functional Rules

- **RTL Arabic UI:** `dir="rtl"`, Tailwind logical properties only (`ms-/me-/ps-/pe-`), IBM Plex Sans Arabic, all strings from `lib/i18n/ar.ts`.
- **Privacy:** never log CV contents or Gemini responses containing personal data; signed URLs for CVs expire in 10 minutes; retention cleanup per D8.
- **Cost guard:** exactly one Gemini call per application analysis; manual re-run allowed; no AI calls on page render, ever.
- **Resilience:** every AI failure path leaves the application usable by HR (they can read the CV manually).
- Pagination on all dashboard lists; ISR on public pages.

---

## 9. Implementation Milestones (stop for engineer approval after each)

1. **M0 – Scaffold:** Next.js + RTL shell + Supabase wiring + auth + role gate. Public sign-up disabled.
2. **M1 – Schema:** migration §4 + RLS §4.1 + storage bucket + seed (3 jobs, 1 admin, 1 hr).
3. **M2 – Jobs:** FR-01 + public portal FR-02.
4. **M3 – Apply flow:** FR-03 end-to-end WITHOUT AI (analysis stays `pending`), incl. tracking page + confirmation email.
5. **M4 – AI pipeline:** Edge Function + prompts + zod validation + retry/re-run. Test with 3 real-ish CVs (seed fixtures) in Arabic and English.
6. **M5 – HR review:** FR-06 ranked list + applicant detail (FR-04/05/07).
7. **M6 – Pipeline & emails:** FR-08 RPC + templates + history.
8. **M7 – Stats + retention cron + hardening** (empty states, skeletons, mobile pass).

### 9.1 SaaS conversion — short track (approved 2026-08-06)

M0–M7 are complete. The conversion runs as its own milestone series; the
approved short track ships a sellable product before any billing engine is
built. Same rule: **stop for engineer approval after each.**

1. **S1 – Tenancy & isolation.** Migrations `0006`/`0007`, helper functions,
   full RLS rewrite, storage repathing, `submit-application`, and a
   cross-tenant isolation test suite. Nothing here may be deferred.
2. **S2 – Identity & onboarding.** Self-serve signup creating org + owner,
   email verification, invitations, org switcher, the four roles.
3. **S3 – Tenant workspace.** Explicit `org_id` scoping in every page and
   action, branding settings, `/c/{slug}` careers page, per-org cache tags.
4. **S6 – Landing & marketplace.** Marketing site, `/jobs` grouped by company,
   `/companies`, `JobPosting` JSON-LD, sitemap.
5. **S9-mini – Hardening.** Rate limits, Turnstile, backups, privacy policy.

Deferred until the product has paying customers: **S4** (platform console),
**S5** (billing and quota enforcement), **S7** (Notion design pass),
**S8** (parity + differentiator features).

**Status (2026-08-06): S1, S2, S3, S6 and S9-mini are complete and pushed.**
Migrations run to `0011`. Test suites: `tenant_isolation.sql` (53),
`onboarding.sql` (23), `rls_check.sql` (42) — `npm run test:db` runs all
three against a throwaway database. What remains before charging anyone:
deploy S1 to production (`docs/S1_DEPLOY.md`), then S5 for billing — the
pricing page publishes plans that are **not yet enforced**, since the quota
check belongs inside `analyze-application` (D16).

---

## 10. Forbidden Actions

1. No features/tables/roles beyond this spec. No candidate accounts, no chat features. (Multi-company support is now in scope per §2.1 — but only as specified there.)
2. No new dependencies without approval (D10). No LangChain or AI framework wrappers — call `@google/genai` directly.
3. Gemini key only in Edge Function env. Never in Next.js env vars (not even server-side ones), never in the repo.
4. Never let the AI decide status. No auto-reject, no auto-shortlist. The word "advisory" must survive in the UI.
5. Never store or display AI output that failed zod validation.
6. No hard deletes outside the retention job; no editing `ai_evaluations` originals (HR edits live separately).
7. No English strings in the UI; no `ml-/mr-` physical classes.
8. Do not "improve" the scoring rubric or the system prompt on your own — prompt changes require engineer approval and a `PROMPT_VERSION` bump.
9. Do not mark a milestone complete with TODOs or mocked paths — report blockers.
10. **Never widen tenant reach.** No query on a tenant table without an
    explicit `org_id` filter, no policy using a bare `authenticated` check, no
    trusting an `org_id` that arrived from the client — derive it from a row
    you already authorized. If a feature seems to need cross-org reads, stop
    and ask.
11. Never grant `anon` insert/update/delete on any table or storage bucket.
12. Never put platform-owner capability behind a tenant role.

## 11. Definition of Done (per milestone)

Acceptance criteria pass with seed data · RLS verified per role (anon/hr/admin) · lint + typecheck clean, no `any` · Arabic UI reviewed · 5–10 line summary for the engineer (what changed, migrations, how to test).
