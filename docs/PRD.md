# حكيم (Hakeem) — Product Requirements Document for Test Planning

> **Audience.** An automated testing tool that turns this document into a test map, and the human QA lead who reviews that map.
> **Language.** The document is in English. Every user-visible string is quoted **verbatim in Arabic**, because the UI is 100% Arabic (RTL) and tests assert on exact text.
> **Grounding.** Every statement is taken from the code on the branch named below, through fact sheets that were checked against the code. File paths are relative to the repository root `/home/user/SPR/`. Where the code is ambiguous, or disagrees with the project specification (`CLAUDE.md`), the point is listed in §13 instead of being guessed.

---

## 0. Document control

| Field | Value |
|---|---|
| Document | `docs/PRD.md` |
| Version | 1.0 |
| Date | 2026-10-20 |
| Product | حكيم (`hakeem`), the Smart Recruitment Portal (SRP). The name lives only in `srp/lib/i18n/ar.ts` as `PRODUCT_NAME` / `PRODUCT_SLUG` (D25) |
| Scope | Branch `claude/quirky-mccarthy-w902qy`, HEAD `5f24d6c`. The application code is identical to commit `c31763e`; the commits after it change only `docs/` |
| Code covered | `srp/` (Next.js 16 app, Supabase migrations `0001`–`0022`, Edge Functions, DB tests, seed) and `interview-agent/` (the separate interview service, D30), seen from the outside only |
| Specification | `CLAUDE.md` v3.0 (decisions D1–D33). Where code and specification differ, this PRD describes the **code** and flags the difference in §13 |

### 0.1 Milestone status (what exists to test)

| Milestone | Status | What it means for testing |
|---|---|---|
| M0–M7 (v1 single-company product) | Built | Jobs, apply, tracking, AI analysis, ranked review, status pipeline, emails, stats, retention |
| S1, S2, S3, S6, S9-mini (multi-tenant SaaS) | Built | Tenancy and RLS, signup and onboarding, invitations, roles, careers pages, marketplace, rate limits, Turnstile, legal drafts |
| August 2026 audit round | Built | Analysis quota (migration `0014`), `fit_score` copy for ranking (`0013`), DB-side stats, transparency report (`0015`), blind screening and Saudization fields (`0016`) |
| P0 — design foundation | Built | Tokens, fonts, restyled base components |
| P3 — landing page | Built | Marketing landing with GSAP, Lenis and React Bits; Google sign-in |
| P1 — seeker accounts | Built | Seeker signup, CV-first onboarding, `/me` portal, applying with a stored CV, account deletion, legacy profile linking |
| I0 — interview contract and skeleton | Built | Signed platform↔agent API, webhook, interview tables |
| I1 — question bank | Built | Job core question bank (generate, review, lock, versions) and the virtual-interview panel up to "questions locked" |
| **P2** — recommendations, suggested candidates, invitations with limits | **Not built** | Do not test (see §11) |
| **P4** — internal redesign | **Not built** | Do not test |
| **I2** — candidate interview room / text interview | **Not built** | The «إرسال للمتقدم» button is permanently disabled |
| **I3** — evaluation and report | **Not built** | No interview score, report or authenticity signal exists anywhere |
| **I4** — code sandbox, **I5** — voice, **I6** — hardening | **Not built** | Coding and voice inputs are disabled with «قريباً» |
| **S4** — platform console | **Not built** | No `/platform` route, no impersonation UI |
| **S5** — billing engine | **Not built** | Plans are not enforced except: the monthly **analysis** quota is enforced (default 25), and `monthly_interview_quota` defaults to **0**, which switches interviews off |
| S7, S8 | Not built | Do not test |

### 0.2 How to read the IDs

| Pattern | Meaning | Example |
|---|---|---|
| `F-<AREA>-<nn>` | A feature. Carries a priority | `F-APPLY-01` |
| `REQ-<AREA>-<nn>` | A requirement. Numbered per area (not per feature) and unique in the document | `REQ-APPLY-05` |
| `AC-<AREA>-<nn>.<m>` | Acceptance criterion `m` of `REQ-<AREA>-<nn>`, in Given / When / Then form | `AC-APPLY-05.2` belongs to `REQ-APPLY-05` |
| `ST-<NAME>` | A state machine in §6 | `ST-APP-STATUS` |
| `EM-<nn>` | An email in §9 | `EM-04` |
| `KD-<nn>` | A suspected defect found in the code (§13.2). An AC tagged `[KD-nn]` states the behaviour the UI or specification promises, and the defect note states what the code is expected to do instead | `KD-01` |
| `SEC-<nn>` | A security observation that needs a test (§13.3) | `SEC-02` |
| `OQ-<nn>` | An open question (§13.1). No test should assert either answer until it is resolved | `OQ-04` |

**Tags inside acceptance criteria**

| Tag | Meaning |
|---|---|
| `[NEG]` | Negative case: invalid input or a refused action |
| `[PERM]` | Permission or tenant-isolation case |
| `[STATE]` | UI state: empty, loading, error, pending |
| `[KD-nn]` | Linked to a suspected defect |
| `[API]` | Best exercised by calling the HTTP endpoint directly |
| `[DB]` | Best exercised with SQL against the database (RLS, grants, triggers) |

**Every requirement block has the same shape**, so it can be parsed:

```
#### REQ-<AREA>-<nn> — <title>
- **Routes:** <routes or endpoints>
- **Priority:** P0 | P1 | P2
- **Test type:** UI e2e | API | DB-RLS | visual (one or more)
- **Source:** <code paths>
- **Rules:** <business rules and exact limits>
- **Acceptance criteria:**
  - **AC-<AREA>-<nn>.<m>** — *Given* … *when* … *then* …
```

**Priorities**

| Priority | Meaning |
|---|---|
| P0 | Critical path. A failure blocks a customer from applying, reviewing, deciding, or keeps tenants from being isolated |
| P1 | Important. A failure harms a main workflow but has a workaround |
| P2 | Nice to have, marketing, or legacy |

**Test types**

| Type | Meaning |
|---|---|
| UI e2e | Browser test (e.g. Playwright, approved as a devDependency in D10) driving the Arabic RTL UI |
| API | Direct HTTP calls to Edge Functions or PostgREST RPCs |
| DB-RLS | SQL run as `anon`, `authenticated` (per role) or `service_role`; the existing suites in `srp/supabase/tests/` already cover much of this |
| visual | Screenshot or layout check (RTL, 390 px width, colour bands) |

### 0.3 Text conventions

- A UI string is quoted between « and », exactly as it is in `srp/lib/i18n/ar.ts`. When the string itself contains « or », it is given in a code span instead, for example `عند اختيار «دعوة لمقابلة» أو «تم الاعتذار» يُرسَل بريد تلقائي للمتقدم.`
- `{name}` marks a value filled in at run time (a job title, a number, a date). The rest of the string is literal.
- Strings that do not come from `ar.ts` name their source: email templates (`srp/supabase/functions/send-email/templates.ts`), SQL (`srp/supabase/migrations/…`) or the interview contract.
- Dates in the UI use Arabic month names, format "d MMMM yyyy", and "d MMMM yyyy، h:mm a" with time.
- Some strings are **composed at render time** from dictionary parts, and this PRD quotes the rendered result: the product name «حكيم» comes from `PRODUCT_NAME` (e.g. «كيف ستستخدم حكيم؟»); counters and labels such as «(استشاري)», «(الأحدث)», «(مكتملة)» or a count in parentheses may sit in a separate element; references render as `{message} رمز المرجع: {reference}`. Assertions should match on normalised text content (collapse whitespace) rather than on a single text node.
- "Write roles" means owner, admin and hr. "Admin roles" means owner and admin (`srp/lib/auth.ts:31-33`).

---

## 1. Product overview

### 1.1 Problem

Recruiters in Saudi companies receive many CVs, in Arabic and in English, and screen them by hand. حكيم reads every CV, gives each applicant a fit score with a written reason, suggests interview questions, and ranks applicants per job. The ranking is automatic; the decision is always human. The landing page states the promise as «حكيم يرشّح، وأنت تقرّر».

### 1.2 The parts of the product

| Part | Who uses it | Entry routes | Built |
|---|---|---|---|
| **Public portal and marketplace** | Anyone, no account | `/`, `/jobs`, `/jobs/[id]`, `/companies`, `/c/[slug]`, `/track` | Yes |
| **Guest applying** | Anyone, no account (D21) | `/jobs/[id]/apply` | Yes |
| **Company workspace** | Members of a company (owner, admin, hr, viewer) | `/admin/*` | Yes |
| **Seeker portal** | A job seeker with an account (D26) | `/onboarding/seeker`, `/me/*` | Yes (P1) |
| **Public talent page** | Anyone holding the link | `/t/[token]` | Yes |
| **AI CV analysis** | System, inside the Edge Function `analyze-application` | — | Yes |
| **Virtual first-round interview** | Company staff today; candidates later | `/admin/jobs/[id]/interview-bank`, the «المقابلة» tab of an application | Question bank and interview set-up only (I1). The candidate side is not built |
| **Platform console** | Platform owner | `/platform` | **No** (S4) |

**Multi-tenancy.** Many companies (tenants) share one database. Every tenant row carries `org_id`; isolation is enforced twice: an explicit `org_id` filter in application code, and Row Level Security in the database (the "isolation invariant", CLAUDE.md §2.2).

**Language.** The UI is Arabic only, right-to-left. CVs may be Arabic, English or mixed.

### 1.3 Ethical promises as testable rules

The product's promises (D24, D31, CLAUDE.md §1 and §10.4) are written as one feature so they appear in the traceability matrix.

### F-ETH-01 — Ethical promises (P0)

The AI score is advice. A human makes every decision. Every score comes with its reason. Seekers never see a number. Rejection emails carry no AI reasoning. The product never issues an "AI-generated or human" verdict.

#### REQ-ETH-01 — Advisory wording on every displayed score
- **Routes:** `/admin/jobs/[id]/applicants`, `/admin/applications/[id]?tab=evaluation`, `/admin/stats`, `/admin/calendar`, `/admin/applications/[id]/transparency`
- **Priority:** P0
- **Test type:** UI e2e; visual
- **Source:** `srp/components/admin/score-badge.tsx`; `srp/app/(dashboard)/admin/jobs/[id]/applicants/page.tsx:188-189`; `srp/lib/i18n/ar.ts:954-958`; `srp/supabase/migrations/0015_transparency_report.sql`
- **Rules:**
  - Every score badge shows the number followed by «استشاري», and carries the tooltip (HTML `title`) «الدرجة استشارية فقط — قرار القبول أو الرفض يتخذه فريق التوظيف دائماً».
  - The ranked-list column header reads «درجة الملاءمة (استشاري)» and carries the same tooltip.
  - The evaluation tab always shows the disclaimer «هذا التقييم مولّد بالذكاء الاصطناعي وهو استشاري فقط؛ قرار القبول أو الرفض قرار بشري دائماً.»
  - Stats labels: KPI «متوسط درجة الملاءمة (استشاري)» and table header «متوسط الدرجة (استشاري)».
  - The transparency report carries «درجة الملاءمة استشارية أنتجها نموذج ذكاء اصطناعي، وليست قراراً. كل قرار في هذا السجل اتخذه إنسان.» (string from SQL, migration `0015`).
  - CLAUDE.md §10.4: "The word 'advisory' must survive in the UI."
- **Acceptance criteria:**
  - **AC-ETH-01.1** — *Given* a job with at least one analysed application, *when* a write-role user opens `/admin/jobs/{id}/applicants`, *then* the score column header reads «درجة الملاءمة (استشاري)» and every non-empty score cell reads `{n}` followed by «استشاري», with the tooltip «الدرجة استشارية فقط — قرار القبول أو الرفض يتخذه فريق التوظيف دائماً».
  - **AC-ETH-01.2** — *Given* an application whose analysis is `done`, *when* the user opens the «التقييم الذكي» tab, *then* the large score shows «استشاري» and the tooltip, and the disclaimer «هذا التقييم مولّد بالذكاء الاصطناعي وهو استشاري فقط؛ قرار القبول أو الرفض قرار بشري دائماً.» is visible.
  - **AC-ETH-01.3** — *Given* the same application in `pending`, `processing` or `failed`, *when* the evaluation tab opens, *then* the disclaimer is still shown.
  - **AC-ETH-01.4** — *Given* an org with analysed applications, *when* any member opens `/admin/stats`, *then* the KPI label «متوسط درجة الملاءمة (استشاري)» and the table header «متوسط الدرجة (استشاري)» are shown.
  - **AC-ETH-01.5** — *Given* an exported transparency report, *when* it is opened, *then* it contains «درجة الملاءمة استشارية أنتجها نموذج ذكاء اصطناعي، وليست قراراً. كل قرار في هذا السجل اتخذه إنسان.»
  - **AC-ETH-01.6** — *Given* a 390 px wide viewport, *when* the ranked list renders, *then* the «استشاري» affix is visible next to each score and is not truncated (visual).

#### REQ-ETH-02 — The decision is always human
- **Routes:** `/admin/applications/[id]`, `/track/[ref]`; Edge `analyze-application`, `housekeeping`, `interview-webhook`; RPC `change_application_status`
- **Priority:** P0
- **Test type:** UI e2e; API; DB-RLS
- **Source:** `srp/supabase/migrations/0006_multitenancy.sql:451-517`; `srp/supabase/migrations/0003_status_rpc.sql:46`; `srp/components/admin/virtual-interview/virtual-interview-panel.tsx:41-44`
- **Rules:**
  - An application's status changes only through the RPC `change_application_status`, called by an owner, admin or hr of the application's org. Direct `UPDATE` of `applications.status` is revoked for clients.
  - Nothing automatic changes status: not the analysis result, not the quota, not housekeeping, not an interview event, not the virtual-interview panel. There is no auto-reject and no auto-shortlist (CLAUDE.md §10.4).
  - The only history row written without a human is the initial `new` row at insert (`changed_by` null, shown as «النظام» in the transparency report).
- **Acceptance criteria:**
  - **AC-ETH-02.1** — *Given* a new application whose analysis finishes with a score below 50, *when* HR opens it, *then* its status is still «تم استلام الطلب», and `/track/{ref}` shows exactly one history row «تم استلام الطلب».
  - **AC-ETH-02.2** — *Given* an application whose analysis fails because the quota is exhausted, *when* housekeeping retries it three times, *then* its status is unchanged.
  - **AC-ETH-02.3** — [API] *Given* an interview assignment for an application, *when* a valid signed `interview.failed` or `interview.cancelled` event reaches `interview-webhook`, *then* `applications.status` is unchanged.
  - **AC-ETH-02.4** — [DB][NEG] *Given* an hr user's session, *when* it runs `update applications set status = 'accepted'` directly, *then* the statement is refused (permission denied) and the status is unchanged.
  - **AC-ETH-02.5** — *Given* an application moved by HR from `new` to `interview`, *when* its transparency report is exported, *then* the trail shows the insert row with «النظام» and the HR change marked «قرار بشري».

#### REQ-ETH-03 — No score without its justification
- **Routes:** `/admin/applications/[id]?tab=evaluation`, `/admin/applications/[id]/transparency`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/app/(dashboard)/admin/applications/[id]/page.tsx`; `srp/supabase/functions/analyze-application/index.ts`; `srp/supabase/functions/_shared/evaluation.ts`
- **Rules:**
  - On the evaluation tab, the score is shown only together with «تفصيل الدرجة» and the three lists «نقاط القوة», «الفجوات» and «نقاط تحتاج استيضاحاً» (an empty list shows «—»).
  - Model output that fails zod validation is never stored; the analysis becomes `failed` (D5).
  - A stored evaluation that fails re-validation on the page, or is missing while the status is `done`, shows «التقييم غير متاح» and **no** score.
  - The transparency report prints the score with «تفصيل الدرجة» and «التبرير».
  - The ranked list shows a bare score badge with a link to the applicant; whether that satisfies the promise is **OQ-01**.
- **Acceptance criteria:**
  - **AC-ETH-03.1** — *Given* a `done` evaluation, *when* the evaluation tab renders, *then* «تفصيل الدرجة», «نقاط القوة», «الفجوات» and «نقاط تحتاج استيضاحاً» are all present on the same tab as the score.
  - **AC-ETH-03.2** — [NEG] *Given* an `ai_evaluations` row whose JSON was altered to fail the zod schema, *when* the evaluation tab renders, *then* «التقييم غير متاح» is shown and no score number is shown.
  - **AC-ETH-03.3** — [API][NEG] *Given* a model reply that fails validation (e.g. 5 interview questions), *when* `analyze-application` finishes, *then* no `ai_evaluations` row is written for that run, and the application is `failed`.

#### REQ-ETH-04 — Applicants and seekers never see a numeric score or AI text
- **Routes:** `/track/[ref]`, `/me`, `/me/applications`, `/me/apply/[jobId]`, `/t/[token]`; all applicant emails
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/supabase/migrations/0001_init.sql:172-187` (`track_application`); `srp/supabase/migrations/0020_seeker_accounts.sql:935-982` (`my_applications`); `srp/app/(talent)/t/[token]/page.tsx`
- **Rules:**
  - `track_application` returns only `(to_status, created_at)`.
  - `my_applications()` returns job, company, status, reference code and history, and nothing from `ai_evaluations`.
  - The public talent page shows «نقاط القوة» as words, never a score.
  - Recommendations (D28: reasons, never a number) are not built (P2).
- **Acceptance criteria:**
  - **AC-ETH-04.1** — *Given* an analysed application, *when* anyone opens `/track/{ref}`, *then* the page shows statuses and timestamps only: no name, email, note, score, strengths or questions.
  - **AC-ETH-04.2** — *Given* a seeker with an analysed account application, *when* they open `/me` and `/me/applications`, *then* no number between 0 and 100 labelled as a score, and no AI justification text, appears.
  - **AC-ETH-04.3** — [DB] *Given* a seeker session, *when* `my_applications()` is called, *then* the returned keys contain no `fit_score`, `score_breakdown`, `justification` or `interview_questions`.
  - **AC-ETH-04.4** — *Given* a published talent profile, *when* `/t/{token}` is opened, *then* no score is shown.

#### REQ-ETH-05 — Rejection emails never contain AI reasoning
- **Routes:** `/admin/applications/[id]` (status change); Edge `send-email` kind `rejected`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/supabase/functions/send-email/templates.ts:120-133`
- **Rules:**
  - Subject `تحديث بخصوص طلبك — {jobTitle}`; heading «شكراً لاهتمامك».
  - Body, verbatim (templates.ts): «نشكرك على الوقت الذي خصصته للتقديم على وظيفة {jobTitle} وعلى اهتمامك بالانضمام إلينا.» / «بعد دراسة الطلبات المقدمة، قررنا المضي مع مرشحين آخرين لهذه الوظيفة.» / «نقدّر جهدك ونتمنى لك كل التوفيق في مسيرتك المهنية.»
  - No score, strength, gap, red flag or question text.
- **Acceptance criteria:**
  - **AC-ETH-05.1** — *Given* an analysed application, *when* HR sets the status to «تم الاعتذار», *then* the applicant receives an email with subject `تحديث بخصوص طلبك — {jobTitle}` whose body is exactly the generic text above, and which contains none of the evaluation's strengths, gaps, red flags, questions or score.

#### REQ-ETH-06 — No authenticity verdicts, no biometric inference
- **Routes:** all `/admin/*` pages; the virtual-interview panel
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** CLAUDE.md D31; `srp/supabase/migrations/0019_interviews.sql:59-73` (`interview_reports` never written)
- **Rules:**
  - No page states that a CV or an answer is "AI-generated" or "human-written" (D31).
  - Authenticity signals belong to I3, which is not built; `interview_reports` is never written, and the panel shows no interview score or report.
  - No webcam, face, emotion or voice inference exists. Voice mode is disabled with «قريباً».
- **Acceptance criteria:**
  - **AC-ETH-06.1** — *Given* any application, *when* every tab of `/admin/applications/{id}` is opened, *then* no interview score, interview report or authenticity verdict is displayed.
  - **AC-ETH-06.2** — *Given* the interview configuration form, *when* it renders, *then* «صوتي» is unchecked, disabled and badged «قريباً».

---

## 2. Personas and roles

The "hat" a user wears comes from database rows, never from `user_metadata` (D12, D26): a `memberships` row means a company workspace; a `talent.profiles` row with `user_id` means the seeker portal. One account may hold both.

| Persona | How they are recognised | What they can do | What they cannot do |
|---|---|---|---|
| **Anonymous visitor** | No session | Browse `/`, `/pricing`, `/fairness`, `/privacy`, `/terms`, `/jobs`, `/jobs/[id]`, `/companies`, `/c/[slug]`, `/talent`, `/t/[token]`; track an application by code | Write anything to the database directly; reach `/admin`, `/me`, `/onboarding` (redirected to `/login`) |
| **Guest applicant** | An anonymous visitor submitting `/jobs/[id]/apply` | Apply with name, email, phone, CV and optional cover note, through the Edge Function `submit-application` (D15); receive a reference code and emails; track with `/track/[ref]` | See any score or AI output; see their application in a seeker portal (guest applications never appear in `/me`) |
| **Job seeker (account)** | Signed in, has a `talent.profiles` row with their `user_id` | Onboarding (`cv` → `contact` → `review` → `consents` → `done`); `/me` home, jobs, applying with a stored CV, own applications, profile, CV versions, consents, public page, delete seeker data, add a company workspace | Read any company data; see scores; add skills the CV does not contain |
| **Company viewer** «مطّلع» | `memberships.role = viewer` | Read everything in the active org: dashboard, jobs, applicants, application pages, CV links, calendar, stats, interview bank (read-only), transparency report | Any write: jobs, status, notes, re-run, interviews, settings |
| **Company hr** «موارد بشرية» | `role = hr` | Everything a viewer can, plus job CRUD (soft delete), status changes, notes, interview record, re-run analysis, interview bank and virtual-interview actions | Open `/admin/settings` (redirected to `/admin`) |
| **Company admin** «مدير» | `role = admin` | Everything hr can, plus settings: branding, retention, compliance, team roles (not owner), invitations (not owner), manual account creation | Grant or invite the owner role; change an owner's role |
| **Company owner** «المالك» | `role = owner` | Everything admin can, plus granting the owner role. The org must always keep at least one owner | Delete the organization (no UI and no DB grant; see §13.1 OQ-08) |
| **Two-hat user** | Membership **and** seeker profile | Both portals. Sidebar link «حسابي كباحث» in `/admin`; button «مساحة الشركة» in `/me` | — |
| **Platform admin** | Row in `platform_admins` (D13) | Database-level only: read platform tables and (as implemented) tenant rows; act through an impersonation session inserted by SQL | Any UI: the platform console (S4) and the impersonation banner are not built |
| **Interview agent** (system) | HMAC-signed calls | Sends interview status events to `interview-webhook` | Read the platform database; change application status |
| **Housekeeping job** (system) | pg_cron at 03:00 UTC | Retries analyses, deletes applications past retention, sweeps orphan files and old throttle rows | Change application status |

A member of org A has **no** relationship to org B's rows (D11, CLAUDE.md §4.1). The full role × action matrix is in §7.

---

## 3. Test environment and fixtures

### 3.1 What must be running

| Component | Required set-up | Source |
|---|---|---|
| **Next.js app** | `srp/` started with `npm run dev`, or `npm run build` + `npm run start`. Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (canonical links, sitemap, JSON-LD, public talent link), optional `NEXT_PUBLIC_ROOT_DOMAIN` (subdomain rewrite and onboarding preview), optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `srp/package.json`; grep of `process.env` in `srp/app`, `srp/lib`, `srp/components`, `srp/proxy.ts` |
| **Supabase project** | Postgres with migrations `0001`–`0022` applied in order; `srp/supabase/seed.sql` applied (**dev only**) | `srp/supabase/migrations/`, `srp/supabase/seed.sql` |
| **`talent` schema exposed** | The `talent` schema must be added to the Data API's exposed schemas (a manual step). Without it every talent function answers 500 `not_configured` | `srp/supabase/config.toml` comment; `docs/V3-PROGRESS.md` |
| **Storage buckets** | Created by migrations: `cvs` (private, 5 MB, PDF/DOCX), `org-assets` (public, 2 MB, PNG/JPEG/WEBP), `talent-cvs` (private, 5 MB, PDF/DOCX, service role only) | `0001`, `0007`, `0011`, `0012`, `0017` |
| **Edge Functions deployed** | `submit-application`, `analyze-application`, `housekeeping`, `send-email`, `manage-users`, `talent-upload`, `talent-analyze`, `seeker-account`, `interview-gateway`, `interview-webhook`. Only `interview-webhook` has `verify_jwt = false` | `srp/supabase/functions/`; `srp/supabase/config.toml` |
| **Function secrets** | `GEMINI_API_KEY` (CV and talent analysis); `RESEND_API_KEY`, `EMAIL_FROM` (default `onboarding@resend.dev`), `SITE_URL` (links in emails); optional `TURNSTILE_SECRET_KEY`; optional `THROTTLE_SALT` (default `"srp"` in submit, `""` in talent); interviews: `INTERVIEW_AGENT_URL`, `INTERVIEW_AGENT_KEYS`, `INTERVIEW_REF_SECRET` (≥ 32 characters), `INTERVIEW_WEBHOOK_SECRETS`. Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | grep of `Deno.env.get` in `srp/supabase/functions` |
| **Daily housekeeping** | DB settings `app.housekeeping_url` and `app.housekeeping_key`; otherwise migration `0012` warns "daily housekeeping is NOT scheduled", and there are no automatic retries or retention | `0004`, `0012` |
| **Supabase Auth** | Email/password enabled. Email confirmation on (local `enable_confirmations = true`, `otp_expiry = 3600`). Google provider is **disabled** in the local config. The Arabic auth email templates in `srp/supabase/templates/` are wired for local only; a hosted project sends English defaults unless they are pasted into the dashboard | `srp/supabase/config.toml:250,258,370-371`; `srp/supabase/templates/_README.md` |
| **Interview agent** (only for I1 tests) | `interview-agent/` with its own Postgres and migrations; env `DATABASE_URL`, `PLATFORM_HMAC_KEYS` (matches the platform's `INTERVIEW_AGENT_KEYS`), `WEBHOOK_URL`, `WEBHOOK_SECRET` (matches `INTERVIEW_WEBHOOK_SECRETS`), `WEBHOOK_KEY_ID`, `SESSION_SIGNING_JWK`, optional `GEMINI_API_KEY`; health at `GET /health` → `{ok, contract:"2026-10-17"}` | `interview-agent/src/config.ts`; `interview-agent/README.md` |
| **DB test suites** | `cd srp && npm run test:db` runs `srp/supabase/tests/run.sh`: a harness, all migrations, the seed, then `tenant_isolation.sql` (55), `onboarding.sql` (23), `interview_isolation.sql` (79), `seeker_isolation.sql` (132), `rls_check.sql`. Any failure exits non-zero | CLAUDE.md §9.2; `srp/supabase/tests/` |
| **Agent tests** | `cd interview-agent && npm test` (210 tests, including byte-parity of the shared contract) | CLAUDE.md §9.2 |

### 3.2 Seed data (`srp/supabase/seed.sql`, dev only)

**Accounts**

| Email / password | User id | Role and notes |
|---|---|---|
| `admin@example.com` / `Admin123!` | `11111111-1111-1111-1111-111111111111` | **owner** (not admin) of org `default`; profile name «أحمد المدير» |
| `hr@example.com` / `Hr123456!` | `22222222-2222-2222-2222-222222222222` | **hr** of org `default`; profile name «سارة الموارد» |
| `seeker@example.com` / `Seeker123!` | `33333333-3333-3333-3333-333333333333` | Confirmed email; no talent profile, no membership, no `public.profiles` row. Signing in lands on the onboarding chooser |

**Organization** (created by migration `0006`'s backfill, then updated by the seed): slug `default`, name «شركة الأفق للتقنية», industry «تقنية المعلومات», city «الرياض», about «شركة سعودية متخصصة في بناء المنتجات الرقمية.», status `active`, `listed_publicly = true`. Defaults: `plan_code = 'trial'`, `monthly_analysis_quota = 25`, `monthly_interview_quota = 0`, `blind_screening = false`, `retention_months = 12`.

**Jobs** (all with `screening_questions = []`)

| Id | Title | Department | Location | Type | Min years | Status | Closes |
|---|---|---|---|---|---|---|---|
| `aaaaaaaa-0000-0000-0000-000000000001` | «مطوّر واجهات أمامية» | «تقنية المعلومات» | «الرياض» | full_time | 3 | published | today + 45 days |
| `aaaaaaaa-0000-0000-0000-000000000002` | «محاسب عام» | «المالية» | «جدة» | full_time | 2 | published | today + 30 days |
| `aaaaaaaa-0000-0000-0000-000000000003` | «أخصائي تسويق رقمي» | «التسويق» | «عن بُعد» | remote | 2 | **draft** | none |

**Not seeded** (create them as fixtures): applications, evaluations, a `viewer` user, an `admin` user, a second organization, a platform admin, talent profiles and CV versions, interview banks and assignments.

### 3.3 Fixtures the QA team must create

| Fixture | How | Used by |
|---|---|---|
| A **viewer** and an **admin** in org `default` | Invite from `/admin/settings` (viewer, admin) and accept; or manual creation (hr/admin only) then a role change | Permission tests (§7) |
| A **second organization** «Org B» with its own owner, jobs and applications | Sign up a new company account through `/signup` → `/onboarding` | Tenant isolation |
| An org in `suspended` / `past_due` / `cancelled` | SQL with the service role (tenants cannot change `status`) | Visibility and `job_closed` tests |
| An **unlisted** org (`listed_publicly = false`) | Branding settings checkbox «إظهار الشركة في دليل الوظائف العام» | Marketplace and «تقدّم بملفك» tests |
| A job with **screening questions** of every type (text, yes/no, single choice, multiple choice; some required) | Job form, section «أسئلة التقديم المخصصة» | Apply tests |
| A published job with `closes_at` = yesterday, = today | Job form «آخر موعد» (no future-date check) | Closed-state tests |
| Analysis quota variants (`monthly_analysis_quota` = 0, 2, null) | SQL with the service role | Quota tests |
| Interview quota > 0 (or null) | SQL with the service role (`monthly_interview_quota`); no client role may update it | All I1 tests (with the seed value 0 every costly interview action returns 402) |
| A platform admin and an impersonation session | SQL insert into `platform_admins` and `impersonation_sessions` | DB-RLS tests only (no UI) |
| A seeker who finished onboarding | Sign up via `/signup?as=seeker`, confirm, upload a CV, complete contact, review and consents | Seeker portal tests |
| A legacy accountless talent profile (`user_id` null, `email_verified_at` set) | SQL with the service role (the accountless upload flow no longer exists) | Legacy link tests |

### 3.4 Sample CV and asset files

Existing fixtures: `srp/supabase/fixtures/cvs/cv-ar-frontend.docx` (Arabic DOCX), `srp/supabase/fixtures/cvs/cv-mixed-marketing.docx` (mixed-language DOCX), `srp/supabase/fixtures/cvs/cv-en-accountant.pdf` (English PDF).

Files to create:

| File | Purpose |
|---|---|
| Arabic CV as PDF | Arabic + PDF path (PDFs go to the model as `inlineData`) |
| PDF of exactly 4,194,304 bytes (4 MiB) | Largest file the UI accepts |
| PDF of 4,194,305 bytes | UI and server action refuse it (`حجم الملف يتجاوز 4 ميجابايت`) |
| PDF between 4 MiB and 5 MiB | Accepted only by a direct function call |
| PDF larger than 5,242,880 bytes | Refused by the function (`cv:"size"` / `cv_size`) |
| Text file renamed `.pdf` (bytes are not `%PDF`) | Magic-byte check |
| A real PDF declared as DOCX | Declared type ≠ sniffed type |
| A ZIP renamed `.docx` (starts with `PK\x03\x04`) | Passes the sniff; DOCX extraction fails later |
| Empty (0-byte) file | "CV required" path |
| A file with an empty browser MIME type | Type error on guest apply; accepted by extension on seeker upload |
| A non-CV PDF (e.g. an invoice) | Analysis returns score 0 and possibly 0 questions; talent analysis fails "file side" |
| A scanned, image-only PDF | Low-confidence or unreadable path |
| A DOCX with more than 30,000 characters of text | Truncation path (`MAX_CV_TEXT_CHARS = 30000`) |
| A `.exe` renamed `.pdf` with a PDF MIME label | Refused on its bytes |
| Logo/cover PNG ≤ 2 MB, PNG > 2 MB, an SVG, a GIF | Branding upload tests |

### 3.5 External calls that can be stubbed or switched off, and what the UI shows

| Dependency | How to switch it off for a test | What the UI shows then |
|---|---|---|
| Gemini (CV analysis) | Unset `GEMINI_API_KEY` on the Edge Functions | Applying still succeeds and shows the reference code. The analysis ends `failed` (quota unit refunded); HR sees «فشل التحليل — يمكن قراءة السيرة يدوياً وإعادة المحاولة (المحاولات: {n})» |
| Gemini (CV analysis), quota path | Set `monthly_analysis_quota = 0` | Same failure display; `/admin/stats` shows the exhausted banner |
| Gemini (seeker CV) | Unset `GEMINI_API_KEY` | Version `failed` at step `configuration`; onboarding shows «تعثّرت القراءة لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل.» with a reference |
| Resend | Unset `RESEND_API_KEY` | No email; submissions and status changes still succeed; an invitation shows «أُنشئت الدعوة لكن تعذّر إرسال البريد — راجع إعدادات البريد ثم أعد الإرسال» |
| `SITE_URL` | Unset | Applicant emails have no tracking link; the invitation email has **no accept button or link**; the legacy link request returns `not_configured` |
| Turnstile | Leave both keys unset | No widget; submissions are allowed. Cloudflare publishes always-pass and always-fail test keys for the "widget + secret" cases. Do not set the secret without the site key (KD-03) |
| Google OAuth | Disabled locally | Not testable locally; `/login?error=oauth` banner can be tested by visiting the URL |
| Interview agent | Leave `INTERVIEW_AGENT_URL` / `INTERVIEW_AGENT_KEYS` / `INTERVIEW_REF_SECRET` unset | Costly interview actions show «خدمة المقابلات الافتراضية غير مهيّأة على المنصة بعد. تواصل مع الدعم.» |
| Interview agent unreachable | Point `INTERVIEW_AGENT_URL` at a closed port | «تعذّر الوصول إلى خدمة المقابلات أو تأخر ردها. حدّث الصفحة لترى آخر حالة، ثم أعد المحاولة إن لزم.» |
| Agent's model | Run the agent without `GEMINI_API_KEY` | «نموذج توليد الأسئلة غير مهيّأ في خدمة المقابلات حالياً. تواصل مع الدعم.» on generate, retry, regenerate, and create with gap probes > 0 |

**Timing note for API tests.** `submit-application` **awaits** both follow-up calls (`analyze-application` and `send-email`) with `Promise.allSettled` before it replies (`srp/supabase/functions/submit-application/index.ts:645-652`), and those calls have no timeout. The 200 response therefore normally arrives only after the analysis attempt has returned. Allow for model latency in submission timeouts.

---

## 4. Site map

### 4.1 Pages

Global rules:
- Every page is `dir="rtl"`, `lang` Arabic. The page title template is `%s | حكيم` (`srp/app/layout.tsx:28-31`).
- Pages under `(public)` share the site header and footer. `/login`, `/signup`, `/onboarding*` and `/invite/*` have neither. `/t/*` and `/talent/(verify|review|manage)/*` use the plain talent shell.
- Global 404 page: «الصفحة غير موجودة» / «الرابط الذي فتحته غير صحيح أو أن الصفحة حُذفت.» / button «العودة للرئيسية».
- Global error page: «حدث خطأ غير متوقع» / «سجّلنا الخطأ ونعمل عليه. جرّب تحديث الصفحة أو العودة لاحقاً.» / button «إعادة المحاولة», plus the error digest. The error message itself is never shown.

| Route | Audience | Purpose | Redirect / wrong-audience rules |
|---|---|---|---|
| `/` | Everyone | Marketing landing (P3) | Signed-in users are not redirected |
| `/pricing` | Everyone | Four plan cards | — |
| `/fairness` | Everyone | Fairness promises (D24) | — |
| `/privacy`, `/terms` | Everyone | Draft legal documents with a review banner | — |
| `/jobs` | Everyone | Marketplace grouped by company; ISR 60 s | — |
| `/jobs/[id]` | Everyone | Job detail + JobPosting JSON-LD; ISR 60 s | 404 if the id is not a UUID, the job is not published or is soft-deleted, or the org is not `trial`/`active` or is deleted. An unlisted org's job **is** shown |
| `/jobs/[id]/apply` | Everyone, no account | Guest application form; ISR 60 s | 404 under the same conditions. Past `closes_at` → the notice «انتهى موعد التقديم لهذه الوظيفة» instead of the form |
| `/track` | Everyone | Tracking-code lookup | — |
| `/track/[ref]` | Everyone | Status and history; `force-dynamic` | Unknown code → in-page "not found" state, not a 404 |
| `/c/[slug]` | Everyone | Tenant careers page; ISR 60 s | 404 if the slug fails `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, the org is missing, deleted, or not `trial`/`active`. Unlisted orgs **still render** |
| `{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}/…` | Everyone | Rewritten to `/c/{slug}{path}` when the root domain is set | Not rewritten for `www`, `app`, `api`, `admin`, `platform`, or a slug failing the regex. Non-root paths 404 (KD-04) |
| `/companies` | Everyone | Directory of listed companies; ISR 60 s | — |
| `/talent` | Everyone | Seeker marketing page | — |
| `/t/[token]` | Everyone with the link | Public talent page; `force-dynamic` | 404 if the token fails `^[0-9a-f]{32}$`, or the profile is not published or has no public consent |
| `/talent/verify/[token]`, `/talent/review/[token]`, `/talent/manage/[token]` | Holders of a legacy accountless token | Superseded accountless flow kept for old links | Bad token → expired message (verify) or 404 (review, manage). Account-owned profiles are never served |
| `/signup` | Signed out | Account creation with «أبحث عن عمل» / «أمثّل شركة» tabs | Signed in without `next` → proxy sends to `/onboarding` and drops the query string. Signed in with a safe `next` → that target |
| `/login` | Signed out | Email/password and Google sign-in | Signed in without `next` → `/onboarding`. With `next` → the safe target, else `homePath()` |
| `/auth/callback` | Return from Google or an email link | Exchanges the code for a session | See REQ-AUTH-11 |
| `/onboarding` | Signed in | Router by hats, or the chooser and company form | Signed out → `/login`. Has a membership → `/admin`. Has a seeker profile (and no `?as=company`) → `/me` (step `done`) or `/onboarding/seeker` |
| `/onboarding/seeker` | Signed in | CV-first seeker wizard | Signed out → `/login?next=/onboarding/seeker`. Step `done` → `/me`. Unconfirmed email → «أكّد بريدك أولاً» screen |
| `/onboarding/seeker/link/[token]` | Signed in (the requesting account) | Confirms linking a legacy profile | Signed out → `/login?next=/onboarding/seeker/link/{token}`. Malformed token → invalid text and no button |
| `/invite/[token]` | Signed out and signed in | Accept a team invitation | Invalid, expired, revoked or used → «الدعوة غير صالحة» card. Signed out → login/signup buttons carrying `next=/invite/{token}` |
| `/me` | Seeker, step `done` | Seeker home | Signed out → `/login?next=%2Fme`. No profile or unfinished step → `/onboarding/seeker` |
| `/me/jobs` | Seeker | Browse all published jobs | Signed out → `/login?next=/me/jobs` |
| `/me/apply/[jobId]` | Seeker | Apply with the stored CV | Signed out → `/login?next=/me/apply/{id}`. 404 if the id is not a UUID, the job is unpublished or deleted, the company is **unlisted**, or the org is not `trial`/`active` or deleted |
| `/me/applications?page=N` | Seeker | The seeker's own account applications | Signed out → `/login?next=/me/applications` |
| `/me/profile` | Seeker | Contact, facts, CV versions, public page panel | Signed out → `/login?next=/me/profile` |
| `/me/settings` | Seeker | Consents, public link, company link, delete | Signed out → `/login?next=/me/settings` |
| `/admin` | owner, admin, hr, viewer | Dashboard tiles | Signed out → `/login` (proxy, **no** `next`). Signed in without a membership, or without a `public.profiles` row → `/onboarding` |
| `/admin/jobs` | All roles | Paginated job list | Same gate |
| `/admin/jobs/new` | All roles can open | Job form | A viewer's submit → `/admin/jobs?error=forbidden` |
| `/admin/jobs/[id]/edit` | All roles can open | Job form | 404 if not a UUID, another org's job, or soft-deleted |
| `/admin/jobs/[id]/applicants` | All roles | Ranked applicants | 404 if not a UUID or another org's job. A soft-deleted job's applicants **remain reachable** |
| `/admin/jobs/[id]/interview-bank` | All roles (viewer read-only) | Job core question bank (I1) | 404 if not a UUID, another org's job, or soft-deleted |
| `/admin/applications/[id]?tab=profile\|evaluation\|questions\|interview` | All roles | Applicant detail | 404 if not a UUID or another org's application. Unknown `tab` → `profile` |
| `/admin/applications/[id]/transparency` | All roles | Downloads an HTML transparency report | Another org's or unknown id → HTTP 500 JSON `{"error":"report_failed"}`; a null result → 404 `{"error":"not_found"}` |
| `/admin/calendar?m=YYYY-MM` | All roles | Interview calendar | Invalid `m` format → current month (but see KD-06) |
| `/admin/stats` | All roles | Statistics and the analysis quota | — |
| `/admin/settings` | owner, admin | Branding, retention, compliance, team, invitations | hr and viewer are **silently redirected to `/admin`** |
| `/sitemap.xml`, `/robots.txt` | Crawlers | SEO | — |

**Routes that do not exist** (a request returns the 404 page): `/platform` (S4), `/admin/interviews` (only server actions exist there), `/me/interviews` (I2), any password-reset page.

### 4.2 API surface (for API tests)

**Edge Functions** — `POST {SUPABASE_URL}/functions/v1/{name}`. Any other method returns 405. The gateway needs a JWT for every function except `interview-webhook`; the anon key is enough.

| Function | Caller in practice | Auth checked inside | Purpose |
|---|---|---|---|
| `submit-application` | Guest form (anon key); seeker apply (`mode=profile`, user token) | Guest: optional Turnstile. Profile: bearer user token with confirmed email | The only applicant write path (D15) |
| `analyze-application` | `submit-application`, `housekeeping` (service role); dashboard re-run (staff JWT, `force:true`) | A `pending` row: none. Other statuses: `force` + service role or `can_manage_application()` | The only CV model call |
| `housekeeping` | pg_cron (bearer = `app.housekeeping_key`) | None inside the function (SEC-04) | Retries, retention, orphan sweep |
| `send-email` | `submit-application`, `manage-users`, `seeker-account` (service role); status-change action (anon key) | Applicant kinds: none (SEC-03). `invitation`, `talent_verify`, `talent_link`: exact service-role bearer | Resend wrapper |
| `manage-users` | Settings actions (admin's JWT) | Caller's `org_role(org_id)` must be owner or admin | Invite or create a team member |
| `talent-upload` | Seeker upload actions (user token) | Bearer user token, confirmed email | Store a seeker CV version and start its analysis |
| `talent-analyze` | `talent-upload` (service role); legacy verify page (`verify_token`) | Service role, or the verify token | Seeker CV extraction |
| `seeker-account` | Seeker actions (user token) | Bearer user token | `delete`, `request_link` |
| `interview-gateway` | Interview server actions (user token) | Per action: `can_manage_job` / `can_manage_application` / RLS visibility | The platform's only door to the interview agent |
| `interview-webhook` | The interview agent | HMAC signature | Agent → platform status events |

**RPCs executable by `anon`** (all others need `authenticated` or the service role): `track_application`, `is_platform_admin`, `current_org_ids`, `is_org_member`, `org_role`, `org_is_public`, `can_manage_application`, `storage_org_id`, `current_membership_org_ids`, `invitation_preview`, `slug_available`, `talent_public_profile`, and the legacy token functions `talent_publish_profile`, `talent_set_visibility`, `talent_delete_profile`, `talent_review_profile`.

**RPCs for signed-in users only:** `change_application_status`, `create_organization`, `accept_invitation`, `org_stats`, `org_quota`, `application_transparency_report`, `org_saudization`, `can_manage_job`, `my_hats`, `talent_my_profile`, `talent_save_my_contact`, `talent_save_my_review`, `talent_set_my_consents`, `talent_legacy_profile_available`, `talent_link_legacy_profile`, `my_applications`.

**Service role only:** `record_submission_attempt`, `claim_application_for_analysis`, `consume_analysis_quota`, `release_analysis_quota`, `talent_record_upload_attempt`, `talent_record_unmapped_skill`, `talent_issue_legacy_link`, `talent_delete_seeker_data`, `apply_interview_event`.

---

## 5. Functional requirements

Features are grouped by area. Each feature has a priority; each requirement repeats the priority so it can be read on its own.

### 5.1 Public site, navigation and SEO

### F-MKT-01 — Public header, footer and global fallbacks (P2)

The shared shell of every public page, plus the 404 page, the error page and the skip link.

#### REQ-MKT-01 — Header navigation
- **Routes:** all `(public)` pages
- **Priority:** P2
- **Test type:** UI e2e; visual
- **Source:** `srp/app/(public)/layout.tsx`
- **Rules:**
  - md and wider: links «الوظائف» → `/jobs`, «دليل الشركات» → `/companies`, «الأسعار» → `/pricing`, «كيف نُنصف» → `/fairness`, «للباحثين عن عمل» → `/talent`.
  - Right side: «تسجيل الدخول» → `/login` (hidden below `sm`) and the button «إنشاء حساب» → `/signup`.
  - Below md: a native `<details>` menu with `aria-label` «القائمة» that holds the five links plus «تسجيل الدخول». It works without JavaScript.
- **Acceptance criteria:**
  - **AC-MKT-01.1** — *Given* a 1280 px viewport, *when* `/jobs` loads, *then* the five header links and «إنشاء حساب» are visible and point to the routes above.
  - **AC-MKT-01.2** — *Given* a 390 px viewport, *when* the user opens the menu labelled «القائمة», *then* it lists the five links and «تسجيل الدخول», and «إنشاء حساب» stays visible in the header.
  - **AC-MKT-01.3** — *Given* JavaScript disabled, *when* the mobile menu is tapped, *then* it still opens (native `<details>`).

#### REQ-MKT-02 — Footer
- **Routes:** all `(public)` pages
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/layout.tsx`
- **Rules:**
  - Tagline «لا درجة بلا دليل».
  - Column «المنتج»: `/jobs`, `/companies`, `/pricing`, `/talent`.
  - Column «الشركة»: «كيف نُنصف» → `/fairness`, «تتبّع طلبك» → `/track`, «دخول الموظفين» → `/login`.
  - Column «قانوني»: «سياسة الخصوصية» → `/privacy`, «شروط الاستخدام» → `/terms`.
  - Bottom line «حكيم — جميع الحقوق محفوظة».
- **Acceptance criteria:**
  - **AC-MKT-02.1** — *Given* any public page, *when* the footer renders, *then* it shows the three columns with the links above and the line «حكيم — جميع الحقوق محفوظة».
  - **AC-MKT-02.2** — *Given* the footer, *when* «تتبّع طلبك» is clicked, *then* `/track` opens.

#### REQ-MKT-03 — 404 page, error page, skip link and page titles
- **Routes:** any unknown route; any server error
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/not-found.tsx`; `srp/app/error.tsx`; `srp/app/layout.tsx:28-31,63-68`
- **Rules:**
  - 404: «الصفحة غير موجودة» / «الرابط الذي فتحته غير صحيح أو أن الصفحة حُذفت.» / button «العودة للرئيسية» → `/`.
  - Error boundary: «حدث خطأ غير متوقع» / «سجّلنا الخطأ ونعمل عليه. جرّب تحديث الصفحة أو العودة لاحقاً.», the error digest (LTR) and the button «إعادة المحاولة». The error message is never shown.
  - Skip link «تخطَّ إلى المحتوى» → `#main`.
  - Title template `%s | حكيم`.
- **Acceptance criteria:**
  - **AC-MKT-03.1** — [NEG] *Given* the route `/this-does-not-exist`, *when* it is opened, *then* the 404 page shows «الصفحة غير موجودة» and «العودة للرئيسية» links to `/`.
  - **AC-MKT-03.2** — *Given* any page, *when* the user presses Tab once, *then* the skip link «تخطَّ إلى المحتوى» receives focus and moves focus to `#main` when activated.
  - **AC-MKT-03.3** — *Given* `/jobs`, *when* it loads, *then* the document title ends with `| حكيم`.
  - **AC-MKT-03.4** — [STATE] *Given* a server error on a page, *when* the error boundary renders, *then* it shows «حدث خطأ غير متوقع» and «إعادة المحاولة», and no stack trace or raw message.

### F-MKT-02 — Marketing pages: landing, pricing, fairness, legal, talent (P2)

#### REQ-MKT-04 — Landing page content
- **Routes:** `/`
- **Priority:** P2
- **Test type:** UI e2e; visual
- **Source:** `srp/app/(public)/page.tsx`; `srp/components/marketing/*`; `srp/lib/i18n/ar.ts:224-274`
- **Rules:**
  - Metadata title «حكيم يرشّح، وأنت تقرّر». The page reads no data.
  - Hero: eyebrow «توظيف بالذكاء الاصطناعي — استشاري دائماً»; headline in two lines «حكيم يرشّح،» / «وأنت تقرّر.»; subtitle «يقرأ حكيم كل سيرة ذاتية بالعربية والإنجليزية، ويعطي كل متقدم درجة ملاءمة مكتوبٌ سببها، ويقترح أسئلة المقابلة. الترتيب آلي، والقرار بشري دائماً.»; CTA «ابدأ كشركة — مجاناً» → `/signup`; CTA «أبحث عن عمل» → `/talent`; proof list «سير عربية وإنجليزية» · «كل درجة بتبريرها» · «لا رفض آلي»; product cards labelled «مثال توضيحي».
  - Sections: «لماذا يتعثّر التوظيف اليوم» (3 problems); «المنتج» / «كل ما يحتاجه فريق التوظيف»; the interview showcase titled «مقابلة أولية يجريها حكيم، ويقرّر نتيجتها إنسان» with the badge «قريباً»; «الإنصاف» / «لا درجة بلا دليل» with the struck-through list «الاسم، الجنس، العمر، الجنسية، الصورة الشخصية، الحالة الاجتماعية، الحي أو العنوان، سمعة الجامعة باسمها», the note «الفجوة الوظيفية تُعرض كسؤال محايد للمقابلة، لا كسبب استبعاد.» and the link «اقرأ كيف نُنصف» → `/fairness`; seekers section «للباحثين عن عمل» / «سيرتك مرة واحدة، وفرصك في مكان واحد» with «أنشئ صفحتك المهنية» → `/talent`, where steps «وظائف مناسبة لك، وسببها» and «قدّم بضغطة» carry «قريباً»; marketplace section «وظائفك تصل إلى الباحثين» with «شاهد الدليل» → `/companies`; FAQ «أسئلة شائعة» with 5 entries; final CTA «جرّب حكيم على وظيفة واحدة» / «أنشئ حسابك وانشر أول وظيفة خلال دقائق.» / «ابدأ مجاناً» → `/signup`.
  - Signed-in users are not redirected away from `/`.
- **Acceptance criteria:**
  - **AC-MKT-04.1** — *Given* `/`, *when* it loads, *then* the hero shows the eyebrow, both headline lines, the subtitle, and the two CTAs pointing to `/signup` and `/talent`.
  - **AC-MKT-04.2** — *Given* `/`, *when* the interview showcase is in view, *then* it carries the badge «قريباً».
  - **AC-MKT-04.3** — *Given* a signed-in owner, *when* they open `/`, *then* the landing page renders (no redirect).

#### REQ-MKT-05 — Landing motion rules (D29)
- **Routes:** `/`
- **Priority:** P2
- **Test type:** UI e2e; visual
- **Source:** `srp/components/marketing/hero-headline.tsx`; `smooth-scroll.tsx:13-15`; `strike-list.tsx:16-18`; `decision-story.tsx:248`; `srp/DESIGN.md` A1, A10, A11
- **Rules:**
  - The headline is revealed word by word, never letter by letter (A1).
  - Lenis smooth scroll is mounted only on `/`, and not at all under `prefers-reduced-motion`.
  - GSAP animations run inside `gsap.matchMedia(MOTION_OK)`.
  - The «DecisionStory» scene is pinned on desktop; phones, tablets and reduced motion get a static story.
  - The dashboard and seeker portal scroll natively (A11).
- **Acceptance criteria:**
  - **AC-MKT-05.1** — *Given* a browser with `prefers-reduced-motion: reduce`, *when* `/` loads, *then* all content is visible at rest and no smooth-scroll wrapper is active.
  - **AC-MKT-05.2** — *Given* the hero headline, *when* the DOM is inspected, *then* no element wraps a single Arabic letter (the reveal splits by words).
  - **AC-MKT-05.3** — *Given* a 390 px viewport, *when* the decision-story section is reached, *then* the static version renders.

#### REQ-MKT-06 — Pricing page
- **Routes:** `/pricing`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/pricing/page.tsx`; `srp/lib/i18n/ar.ts:338-403`
- **Rules:**
  - Title «خطط الاشتراك»; subtitle «كل الخطط تشمل التبرير الكامل للدرجة — الشفافية ليست ميزة إضافية.»
  - Plans: «تجربة» «مجاناً» for «14 يوماً» (وظيفة نشطة واحدة, 25 تحليل سيرة ذاتية, مستخدمان, صفحة توظيف خاصة, الظهور في دليل الوظائف); «الأساسية» 299 «ر.س / شهرياً» (3 وظائف نشطة, 150 تحليل شهرياً, 3 مستخدمين, …); «النمو» 799 with the badge «الأكثر اختياراً», highlighted (15 وظيفة, 750 تحليل, 10 مستخدمين, نطاق مخصص, إزالة علامة حكيم, دعم بأولوية); «المؤسسات» «تسعير مخصص».
  - CTAs «ابدأ الآن» → `/signup`; enterprise «تواصل معنا» → `/#contact`.
  - Footnote «الأسعار لا تشمل ضريبة القيمة المضافة. يمكن الإلغاء في أي وقت.»
  - Only the analysis quota is enforced (default 25 for every new org). Seats, active-job limits and the 14-day trial expiry are **not** enforced (see §11).
- **Acceptance criteria:**
  - **AC-MKT-06.1** — *Given* `/pricing`, *when* it loads, *then* four plan cards are shown and «النمو» carries «الأكثر اختياراً».
  - **AC-MKT-06.2** — *Given* the plan cards, *when* «ابدأ الآن» is clicked, *then* `/signup` opens.
  - **AC-MKT-06.3** — [KD-05] *Given* the enterprise card, *when* «تواصل معنا» is clicked, *then* the user reaches a contact section. (Observed in code: it goes to `/#contact`, and no element with `id="contact"` exists.)

#### REQ-MKT-07 — Fairness page
- **Routes:** `/fairness`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/fairness/page.tsx`; `srp/lib/i18n/ar.ts:300-336`
- **Rules:**
  - Title «كيف يُنصف حكيم».
  - Section «وعودنا الثابتة» with four promises: «لا درجة بلا تبرير», «القرار بشري دائماً», «معايير معلنة» (weights 40/30/15/10/5), «أثر قابل للتدقيق».
  - Section «ما يتجاهله النظام عمداً» with the eight struck-through items.
  - Callouts «الفجوات الوظيفية», «لغة السيرة وتنسيقها», «الاعتراف بعدم اليقين».
  - Closing line «لأي سؤال عن كيفية عمل التقييم، تواصل معنا.» (no link or contact method; KD-05).
- **Acceptance criteria:**
  - **AC-MKT-07.1** — *Given* `/fairness`, *when* it loads, *then* the four promises and the weights 40, 30, 15, 10 and 5 are shown.

#### REQ-MKT-08 — Legal drafts
- **Routes:** `/privacy`, `/terms`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/components/legal-document.tsx`; `srp/lib/i18n/ar.ts:405-479`
- **Rules:**
  - Both open with the banner «هذه المسوّدة أُعدّت للمراجعة القانونية قبل الإطلاق التجاري، وليست استشارة قانونية.»
  - Each has 8 numbered sections. No "last updated" date is rendered.
- **Acceptance criteria:**
  - **AC-MKT-08.1** — *Given* `/privacy` and `/terms`, *when* each loads, *then* the review banner and 8 numbered sections are shown.

#### REQ-MKT-09 — Seeker marketing page `/talent`
- **Routes:** `/talent`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/talent/page.tsx`; `srp/lib/i18n/ar.ts:1465-1542`
- **Rules:**
  - Metadata title «حسابك كباحث عن عمل». Static, no motion libraries.
  - Eyebrow «للباحثين عن عمل»; H1 «سيرتك مرة واحدة، وكل طلباتك في مكان واحد»; CTA «أنشئ حسابك» → `/signup?as=seeker`; «لديك حساب؟» «سجّل الدخول» → `/login?next=%2Fonboarding%2Fseeker`.
  - Sections «أربع خطوات، ثم تتقدّم» (4 steps), «ما يتغيّر حين يكون لك حساب» (3), «ما نلتزم به تجاهك» (4).
  - Closing «ابدأ بسيرتك الذاتية» with the CTA again; «تمثّل شركة؟» «أنشئ مساحة عمل لشركتك» → `/signup?as=company`.
  - `/talent?deleted=1` shows no message.
- **Acceptance criteria:**
  - **AC-MKT-09.1** — *Given* `/talent`, *when* «أنشئ حسابك» is clicked, *then* `/signup?as=seeker` opens on the «أبحث عن عمل» tab.
  - **AC-MKT-09.2** — *Given* `/talent`, *when* «سجّل الدخول» is clicked, *then* `/login?next=%2Fonboarding%2Fseeker` opens.

### F-SEO-01 — Sitemap, robots and structured data (P2)

#### REQ-SEO-01 — Sitemap
- **Routes:** `/sitemap.xml`
- **Priority:** P2
- **Test type:** API
- **Source:** `srp/app/sitemap.ts` (revalidated every 3600 s)
- **Rules:**
  - Empty when neither `NEXT_PUBLIC_SITE_URL` nor `NEXT_PUBLIC_ROOT_DOMAIN` is set.
  - Static entries `/`, `/jobs`, `/companies`, `/pricing`, `/fairness`, `/talent`, `/privacy`, `/terms`.
  - Plus `/c/{slug}` for listed live orgs and `/jobs/{id}` for published jobs of listed live orgs (each list limited to 5000). Past-deadline jobs are included. `/t/*` profiles are never included.
  - On a data error only the static entries are returned.
- **Acceptance criteria:**
  - **AC-SEO-01.1** — *Given* `NEXT_PUBLIC_SITE_URL` set and the seed data, *when* `/sitemap.xml` is fetched, *then* it lists the 8 static paths, `/c/default`, and the two published seed jobs, and does not list job `…0003` (draft).
  - **AC-SEO-01.2** — [NEG] *Given* an unlisted org with a published job, *when* the sitemap is fetched, *then* neither its `/c/{slug}` nor its job appears.
  - **AC-SEO-01.3** — *Given* a published talent profile, *when* the sitemap is fetched, *then* no `/t/` URL appears.

#### REQ-SEO-02 — robots.txt
- **Routes:** `/robots.txt`
- **Priority:** P2
- **Test type:** API
- **Source:** `srp/app/robots.ts`
- **Rules:** allow `/`; disallow `/admin`, `/login`, `/signup`, `/onboarding`, `/invite`, `/track`, `/talent/verify`, `/talent/manage`, `/talent/review`. The sitemap URL is listed when a base URL is configured. `/me` and `/t/` are not listed.
- **Acceptance criteria:**
  - **AC-SEO-02.1** — *Given* `/robots.txt`, *when* fetched, *then* it contains exactly the disallow entries above.

#### REQ-SEO-03 — JobPosting JSON-LD on job detail
- **Routes:** `/jobs/[id]`
- **Priority:** P2
- **Test type:** API; UI e2e
- **Source:** `srp/app/(public)/jobs/[id]/page.tsx:98-147`
- **Rules:**
  - `datePosted` = `created_at`; `validThrough` = `closes_at` when set.
  - `employmentType`: full_time → `FULL_TIME`, part_time → `PART_TIME`, contract → `CONTRACTOR`, remote → `FULL_TIME` plus `jobLocationType: TELECOMMUTE`, internship → `INTERN`.
  - `jobLocation.address.addressLocality` = location, `addressCountry` = `SA`.
  - `hiringOrganization.sameAs` = `{NEXT_PUBLIC_SITE_URL}/c/{slug}` only when the site URL is set.
  - Page metadata: title `{job} — {company}`; description = first 160 characters of the description; `og:type` article; a missing job gets the title «الوظائف».
- **Acceptance criteria:**
  - **AC-SEO-03.1** — *Given* seed job `…0001`, *when* its page HTML is fetched, *then* it contains a `JobPosting` script with `employmentType` `FULL_TIME`, `addressLocality` «الرياض», `addressCountry` `SA`, and `validThrough` equal to its closing date.
  - **AC-SEO-03.2** — *Given* a `remote` job, *when* its JSON-LD is read, *then* `employmentType` is `FULL_TIME` and `jobLocationType` is `TELECOMMUTE`.

### 5.2 Marketplace, careers pages and company directory

### F-JOBS-01 — Job marketplace `/jobs` (P0)

#### REQ-JOBS-01 — Which jobs are listed
- **Routes:** `/jobs`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/lib/marketplace.ts:137-189`; `srp/app/(public)/jobs/page.tsx`
- **Rules:**
  - Listed: jobs with `status = published` and `deleted_at is null`, whose org has `listed_publicly = true`, is not deleted, and is `trial` or `active`.
  - Newest first, at most 500 rows, grouped by company; companies ordered by their most recent posting.
  - Jobs whose `closes_at` has passed are **still listed**.
  - ISR: changes can take up to 60 s to appear (publishing revalidates the page, REQ-AJOBS-08).
- **Acceptance criteria:**
  - **AC-JOBS-01.1** — *Given* the seed data, *when* `/jobs` loads, *then* «مطوّر واجهات أمامية» and «محاسب عام» are listed under «شركة الأفق للتقنية», and «أخصائي تسويق رقمي» (draft) is not.
  - **AC-JOBS-01.2** — [NEG] *Given* a published job of an unlisted org, *when* `/jobs` loads, *then* that job is not listed.
  - **AC-JOBS-01.3** — [NEG] *Given* an org moved to `suspended`, *when* `/jobs` loads (after revalidation), *then* none of its jobs are listed.
  - **AC-JOBS-01.4** — *Given* a published job whose `closes_at` was yesterday, *when* `/jobs` loads, *then* the job is still listed.
  - **AC-JOBS-01.5** — [NEG] *Given* a soft-deleted job, *when* `/jobs` loads, *then* it is not listed.

#### REQ-JOBS-02 — Marketplace page states
- **Routes:** `/jobs`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/jobs/page.tsx:20-32`; `srp/app/(public)/jobs/loading.tsx`
- **Rules:**
  - Header «وظائف الشركات» / «تصفّح الوظائف المتاحة مجمّعة حسب الشركة، وقدّم مباشرة.»
  - Query error: «تعذّر تحميل البيانات» / «المشكلة مؤقتة وليست عندك — لا يعني هذا أنه لا توجد وظائف. حدّث الصفحة بعد قليل.» (deliberately different from the empty state).
  - No jobs: «لا توجد وظائف منشورة حالياً» / «عُد قريباً — تُضاف وظائف جديدة باستمرار.»
  - Loading: a skeleton.
- **Acceptance criteria:**
  - **AC-JOBS-02.1** — [STATE] *Given* no published jobs in any listed org, *when* `/jobs` loads, *then* «لا توجد وظائف منشورة حالياً» and «عُد قريباً — تُضاف وظائف جديدة باستمرار.» are shown.
  - **AC-JOBS-02.2** — [STATE] *Given* the Supabase environment is missing or the query fails, *when* `/jobs` loads, *then* «تعذّر تحميل البيانات» and «المشكلة مؤقتة وليست عندك — لا يعني هذا أنه لا توجد وظائف. حدّث الصفحة بعد قليل.» are shown, not the empty state.

#### REQ-JOBS-03 — Marketplace search, filters and layout toggle
- **Routes:** `/jobs`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/jobs/marketplace-explorer.tsx`
- **Rules:**
  - Client-side state only: nothing in the URL, no pagination, no "clear filters" button.
  - Search placeholder «ابحث بالمسمى الوظيفي أو الشركة…»; case-insensitive, trimmed substring match on job title, company name **or department**.
  - Location select, first option «الموقع»; options are the distinct locations sorted in Arabic collation.
  - Type select, first option «نوع الدوام»; options «دوام كامل», «دوام جزئي», «عقد», «عن بُعد», «تدريب».
  - Toggle «قائمة موحّدة» ↔ «تجميع حسب الشركة»; default is grouped. In flat mode the company name appears under each card.
  - Result count `{n} وظيفة`.
  - No match: «لا توجد نتائج مطابقة» / «جرّب تغيير كلمات البحث أو إزالة بعض عوامل التصفية.»
- **Acceptance criteria:**
  - **AC-JOBS-03.1** — *Given* the seed data, *when* the user types «محاسب», *then* only «محاسب عام» remains and the count reads `1 وظيفة`.
  - **AC-JOBS-03.2** — *Given* the seed data, *when* the user types «المالية» (a department), *then* «محاسب عام» is shown.
  - **AC-JOBS-03.3** — *Given* the location select, *when* «جدة» is chosen, *then* only «محاسب عام» is shown.
  - **AC-JOBS-03.4** — [STATE] *Given* a search with no match, *when* it is applied, *then* «لا توجد نتائج مطابقة» is shown.
  - **AC-JOBS-03.5** — *Given* the grouped view, *when* «قائمة موحّدة» is pressed, *then* the jobs show as one list with the company name under each card, and the button now reads «تجميع حسب الشركة».

#### REQ-JOBS-04 — Company group header and job card
- **Routes:** `/jobs`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/jobs/job-card.tsx`; `srp/components/jobs/marketplace-explorer.tsx`
- **Rules:**
  - Group header: logo from `org-assets` or a building icon; company name linking to `/c/{slug}`; city; badge `{n} وظيفة`; link «صفحة الشركة».
  - Card: title, type badge, department, location, and `آخر موعد للتقديم: {date}` when `closes_at` is set; the card links to `/jobs/{id}`.
- **Acceptance criteria:**
  - **AC-JOBS-04.1** — *Given* the seed org, *when* `/jobs` loads, *then* its header shows «شركة الأفق للتقنية», «الرياض», a badge `2 وظيفة` and «صفحة الشركة» linking to `/c/default`.
  - **AC-JOBS-04.2** — *Given* a job card, *when* it is clicked, *then* `/jobs/{id}` opens.

### F-JOBS-02 — Job detail `/jobs/[id]` (P0)

#### REQ-JOBS-05 — Job detail visibility
- **Routes:** `/jobs/[id]`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(public)/jobs/[id]/page.tsx:28-64`; `srp/supabase/migrations/0006_multitenancy.sql:300-318,661-667`
- **Rules:** shown only for a valid UUID of a published, non-deleted job whose org is `trial`/`active` and not deleted. `listed_publicly` is **not** required: an unlisted org's job is viewable by direct link. RLS `jobs_public_select` applies the same rule.
- **Acceptance criteria:**
  - **AC-JOBS-05.1** — *Given* seed job `…0001`, *when* `/jobs/aaaaaaaa-0000-0000-0000-000000000001` opens, *then* the job page renders.
  - **AC-JOBS-05.2** — [NEG] *Given* draft job `…0003`, *when* its URL opens, *then* the 404 page is shown.
  - **AC-JOBS-05.3** — [NEG] *Given* the URL `/jobs/not-a-uuid`, *when* it opens, *then* the 404 page is shown.
  - **AC-JOBS-05.4** — [NEG] *Given* a job of a `suspended` org, *when* its URL opens (after revalidation), *then* the 404 page is shown.
  - **AC-JOBS-05.5** — *Given* a published job of an unlisted org, *when* its URL opens, *then* the job page renders.

#### REQ-JOBS-06 — Job detail content
- **Routes:** `/jobs/[id]`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/jobs/[id]/page.tsx`; `srp/components/markdown.tsx`
- **Rules:**
  - Back link «جميع الوظائف» → `/jobs`; company name → `/c/{slug}`.
  - Type badge, department, location, «تاريخ النشر», «آخر موعد للتقديم» (if set), and `الحد الأدنى من سنوات الخبرة: {n} سنة` only when greater than 0.
  - Sections «المهارات المطلوبة» (badges, only if any), «عن الوظيفة», «المتطلبات».
  - Text is rendered with a minimal markdown subset: `#`, `##`, `###` headings and `-` / `*` bullets; no inline formatting.
- **Acceptance criteria:**
  - **AC-JOBS-06.1** — *Given* seed job `…0001`, *when* the page loads, *then* it shows `الحد الأدنى من سنوات الخبرة: 3 سنة`, the skills React, TypeScript, CSS, Next.js and REST APIs under «المهارات المطلوبة», and the «المتطلبات» bullets as a list.
  - **AC-JOBS-06.2** — *Given* a job with `min_years_experience = 0`, *when* the page loads, *then* no minimum-years line is shown.

#### REQ-JOBS-07 — Closed-for-applications state
- **Routes:** `/jobs/[id]`, `/jobs/[id]/apply`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/lib/format.ts:14-16`; `srp/app/(public)/jobs/[id]/page.tsx`; `srp/app/(public)/jobs/[id]/apply/page.tsx:63-83`
- **Rules:**
  - Closed means `closes_at < today`, using the **Next server's local date**. The closing day itself is still open.
  - When closed: the notice «انتهى موعد التقديم لهذه الوظيفة» and no apply buttons. The apply page shows the same notice instead of the form.
  - The submit function uses the **UTC** date (see REQ-APPLY-06); OQ-05 covers the mismatch.
- **Acceptance criteria:**
  - **AC-JOBS-07.1** — *Given* a published job with `closes_at` = yesterday, *when* `/jobs/{id}` opens, *then* «انتهى موعد التقديم لهذه الوظيفة» is shown and neither «قدّم الآن» nor «تقدّم بملفك» is present.
  - **AC-JOBS-07.2** — *Given* a published job with `closes_at` = today, *when* `/jobs/{id}` opens, *then* the apply buttons are shown.
  - **AC-JOBS-07.3** — *Given* the closed job, *when* `/jobs/{id}/apply` opens, *then* the notice «انتهى موعد التقديم لهذه الوظيفة» replaces the form.

#### REQ-JOBS-08 — Apply buttons on job detail
- **Routes:** `/jobs/[id]`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/jobs/[id]/page.tsx:221-248,276-294`
- **Rules:**
  - When open, buttons appear at the top and again at the bottom: «قدّم الآن» → `/jobs/{id}/apply`, and «تقدّم بملفك» → `/me/apply/{id}` with the tooltip «لأصحاب حسابات الباحثين: تقدّم بسيرتك المحفوظة دون إعادة رفعها.»
  - «تقدّم بملفك» appears **only when the company is listed publicly**.
- **Acceptance criteria:**
  - **AC-JOBS-08.1** — *Given* an open job of a listed org, *when* the page loads, *then* «قدّم الآن» and «تقدّم بملفك» each appear twice (top and bottom) with the targets above.
  - **AC-JOBS-08.2** — [NEG] *Given* an open job of an unlisted org, *when* the page loads, *then* «قدّم الآن» is shown and «تقدّم بملفك» is not.
  - **AC-JOBS-08.3** — *Given* an anonymous visitor, *when* they click «تقدّم بملفك», *then* they land on `/login?next=/me/apply/{id}`.

### F-CAREERS-01 — Tenant careers page `/c/[slug]` (P1)

#### REQ-CAREERS-01 — Careers page visibility
- **Routes:** `/c/[slug]`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(public)/c/[slug]/page.tsx:28-31`; `srp/supabase/migrations/0006_multitenancy.sql:540-542`
- **Rules:**
  - Found by slug through the anon policy `organizations_public_select` (`status in (trial, active)` and `deleted_at is null`).
  - 404 if the slug fails `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, or the org is missing, deleted or not live.
  - Unlisted orgs still render.
  - Metadata title `الوظائف في {name}`; description = first 160 characters of «about»; not found → title «الشركة غير موجودة».
- **Acceptance criteria:**
  - **AC-CAREERS-01.1** — *Given* the seed org, *when* `/c/default` opens, *then* the careers page of «شركة الأفق للتقنية» renders.
  - **AC-CAREERS-01.2** — [NEG] *Given* `/c/ab` (2 characters) or `/c/-acme`, *when* opened, *then* the 404 page is shown.
  - **AC-CAREERS-01.3** — [NEG] *Given* an org in `past_due`, *when* its careers page opens (after revalidation), *then* the 404 page is shown.
  - **AC-CAREERS-01.4** — *Given* an unlisted live org, *when* its careers page opens, *then* it renders.

#### REQ-CAREERS-02 — Careers page content
- **Routes:** `/c/[slug]`
- **Priority:** P1
- **Test type:** UI e2e; visual
- **Source:** `srp/app/(public)/c/[slug]/page.tsx`
- **Rules:**
  - Cover: the cover image, else a `brand_color` background, else muted.
  - Header: logo (or icon), name, industry, city, and the link «الموقع الإلكتروني» (`target=_blank`, `rel="noreferrer nofollow"`). «about» goes through the markdown subset.
  - Jobs block: heading «الوظائف المتاحة» followed by the count `({n})` in a separate span: the org's published, non-deleted jobs, newest first, no limit; past-deadline jobs are listed. Empty: «لا توجد وظائف مفتوحة حالياً» / «عُد لاحقاً — تُنشر الوظائف الجديدة هنا أولاً.»
  - Footer line «صفحة توظيف مدعومة بـ حكيم» linking to `/`.
- **Acceptance criteria:**
  - **AC-CAREERS-02.1** — *Given* `/c/default` with the seed jobs, *when* it loads, *then* the heading «الوظائف المتاحة» with the count `(2)` is shown, followed by the two published jobs.
  - **AC-CAREERS-02.2** — [STATE] *Given* an org with no published jobs, *when* its page loads, *then* «لا توجد وظائف مفتوحة حالياً» is shown.
  - **AC-CAREERS-02.3** — *Given* an org with a website, *when* «الموقع الإلكتروني» is inspected, *then* it has `target="_blank"` and `rel="noreferrer nofollow"`.
  - **AC-CAREERS-02.4** — *Given* an org with a brand colour and no cover image, *when* the page loads, *then* the cover area uses the brand colour (visual).

#### REQ-CAREERS-03 — Subdomain rewrite
- **Routes:** `{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}/…`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/proxy.ts:12-40,57-67`
- **Rules:**
  - With `NEXT_PUBLIC_ROOT_DOMAIN` set, `{slug}.{root}/…` is rewritten to `/c/{slug}{path}`.
  - Not rewritten: `www`, `app`, `api`, `admin`, `platform`, or any label failing the slug regex. Paths outside the proxy matcher (e.g. `/companies`, `/pricing`) are served normally.
- **Acceptance criteria:**
  - **AC-CAREERS-03.1** — *Given* the root domain set, *when* `default.{root}/` is opened, *then* the careers page of the seed org renders.
  - **AC-CAREERS-03.2** — [NEG] *Given* `www.{root}/`, *when* opened, *then* no rewrite happens and the landing page renders.
  - **AC-CAREERS-03.3** — [KD-04] *Given* `default.{root}/jobs/{id}` (e.g. a job link clicked on the subdomain careers page), *when* opened, *then* the job page renders. (Observed in code: it is rewritten to `/c/default/jobs/{id}`, which has no route, so the 404 page appears.)

### F-COMP-01 — Company directory `/companies` (P1)

#### REQ-COMP-01 — Directory listing
- **Routes:** `/companies`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/lib/marketplace.ts:197-248`
- **Rules:**
  - Companies: listed, not deleted, `trial`/`active`; ordered by name; at most 500.
  - Open-role counts come from a second query (published, not deleted; at most 2000 job rows) and include past-deadline jobs.
  - Header «الشركات المسجّلة» / «الشركات التي تستقبل طلبات التوظيف عبر حكيم.»
  - Card: logo, name, `{industry} · {city}` (or «—»), «about» clamped to 2 lines, badge `{n} وظائف مفتوحة` or «لا توجد وظائف مفتوحة»; the card links to `/c/{slug}`.
  - Empty **or error** (not distinguished): «لا توجد شركات معروضة بعد» / «ستظهر هنا الشركات التي تختار الظهور في الدليل العام.»
- **Acceptance criteria:**
  - **AC-COMP-01.1** — *Given* the seed data, *when* `/companies` loads, *then* «شركة الأفق للتقنية» is shown with `تقنية المعلومات · الرياض` and a badge `2 وظائف مفتوحة`, linking to `/c/default`.
  - **AC-COMP-01.2** — [NEG] *Given* an unlisted org, *when* `/companies` loads, *then* it is not shown.
  - **AC-COMP-01.3** — *Given* a listed org with no published jobs, *when* `/companies` loads, *then* its card shows «لا توجد وظائف مفتوحة».
  - **AC-COMP-01.4** — [STATE] *Given* no listed orgs (or a failed query), *when* `/companies` loads, *then* «لا توجد شركات معروضة بعد» is shown.

### 5.3 Guest applying and tracking

### F-APPLY-01 — Guest application (P0)

Anyone can apply to an open job with a form and a CV file, without an account (D21). The form posts through a Next.js server action to the Edge Function `submit-application`, the only applicant write path (D15).

#### REQ-APPLY-01 — Apply page availability and layout
- **Routes:** `/jobs/[id]/apply`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/jobs/[id]/apply/page.tsx`; `srp/components/jobs/apply-form.tsx`
- **Rules:**
  - 404 under the same conditions as the job detail (REQ-JOBS-05). Past `closes_at` (server local date) → «انتهى موعد التقديم لهذه الوظيفة» instead of the form.
  - Back link with the job title → `/jobs/{id}`; H1 «التقديم على وظيفة»; subtitle «املأ النموذج وأرفق سيرتك الذاتية — لن تحتاج إلى إنشاء حساب.»; metadata title `التقديم على وظيفة: {title}`.
  - Fields: «الاسم الكامل», «البريد الإلكتروني» (LTR), «رقم الجوال» (LTR), «السيرة الذاتية» with hint «ملف PDF أو DOCX بحجم أقصاه 4 ميجابايت», «رسالة تعريفية (اختياري)», then the job's screening questions under «أسئلة من فريق التوظيف».
  - Submit «إرسال الطلب»; while pending it reads «جارٍ إرسال الطلب…» and is disabled.
- **Acceptance criteria:**
  - **AC-APPLY-01.1** — *Given* seed job `…0001`, *when* `/jobs/{id}/apply` opens, *then* the H1, subtitle and the five fields above are shown, and no account is required.
  - **AC-APPLY-01.2** — [NEG] *Given* draft job `…0003`, *when* its apply URL opens, *then* the 404 page is shown.
  - **AC-APPLY-01.3** — [STATE] *Given* a valid form, *when* «إرسال الطلب» is pressed, *then* the button reads «جارٍ إرسال الطلب…» and is disabled until the reply arrives.
  - **AC-APPLY-01.4** — *Given* a 390 px viewport, *when* the form renders, *then* every field and the submit button fit the width with no horizontal scroll (visual; FR-03 "works comfortably on mobile").

#### REQ-APPLY-02 — Applicant field validation
- **Routes:** `/jobs/[id]/apply`; Edge `submit-application`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/components/jobs/apply-form.tsx`; `srp/supabase/functions/_shared/application.ts:32-44`; `srp/app/(public)/jobs/[id]/apply/actions.ts:132-243`
- **Rules:**

  | Field | Client | Server (zod) | Message under the field |
  |---|---|---|---|
  | `full_name` | required, maxLength 120 | trimmed, 2–120 | «يرجى إدخال الاسم الكامل» |
  | `email` | `type=email`, required | valid email, ≤ 200, lower-cased | «يرجى إدخال بريد إلكتروني صحيح» |
  | `phone` | `type=tel`, required | `^\+?[0-9\s()-]{7,20}$` (ASCII digits only) | «يرجى إدخال رقم جوال صحيح» |
  | `cover_note` | maxLength 2000 | trimmed, ≤ 2000; empty → null | «الرسالة التعريفية طويلة جداً» |

  - Any field error also shows the top alert «يرجى التحقق من الحقول المدخلة». The function answers 400 `invalid_input` with `field_errors`.
  - Invalid input is rejected **before** the throttle, so it does not consume a rate-limit attempt.
- **Acceptance criteria:**
  - **AC-APPLY-02.1** — [NEG] *Given* a full name of 1 character (bypassing the browser), *when* submitted, *then* the top alert «يرجى التحقق من الحقول المدخلة» and «يرجى إدخال الاسم الكامل» under the name field are shown.
  - **AC-APPLY-02.2** — [NEG] *Given* a whitespace-only name, *when* submitted, *then* «يرجى إدخال الاسم الكامل» is shown.
  - **AC-APPLY-02.3** — [NEG] *Given* phones `123456` (6 characters), `٠٥٠١٢٣٤٥٦٧` (Arabic-Indic digits), `05abc12345`, and a 21-character value, *when* each is submitted, *then* «يرجى إدخال رقم جوال صحيح» is shown.
  - **AC-APPLY-02.4** — *Given* phones `+966 50 123 4567` and `0501234567` (7–20 allowed characters), *when* submitted, *then* no phone error is shown.
  - **AC-APPLY-02.5** — [NEG][API] *Given* a cover note of 2001 characters sent directly, *when* submitted, *then* the reply is 400 `invalid_input` and the UI shows «الرسالة التعريفية طويلة جداً».
  - **AC-APPLY-02.6** — *Given* an email typed as `Ali@Example.COM`, *when* the application is stored, *then* the stored email is `ali@example.com`.
  - **AC-APPLY-02.7** — *Given* a server-side refusal, *when* the form re-renders, *then* the previously typed values are still present. (Not asserted in code; verify — OQ-06.)

#### REQ-APPLY-03 — CV file rules
- **Routes:** `/jobs/[id]/apply`; Edge `submit-application`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/components/jobs/apply-form.tsx`; `srp/lib/validations/application.ts:19` (`CV_FORM_MAX_BYTES`); `srp/supabase/functions/_shared/application.ts` (`CV_MAX_BYTES`)
- **Rules:**
  - Accepted types: `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`accept=".pdf,.docx"` + both MIME types).
  - Browser (on file change) and server action: declared type must be one of the two, size ≤ 4 MiB (4,194,304 bytes). Otherwise an inline error and the submit button is disabled.
  - Function: required and non-empty → type allowed → leading bytes match the declared type (`%PDF` for PDF, `PK\x03\x04` for DOCX) → size ≤ 5 MiB (5,242,880 bytes).
  - Messages (field «السيرة الذاتية», plus the top alert «يرجى التحقق من الحقول المدخلة»): missing or empty «يرجى إرفاق السيرة الذاتية»; wrong type or mismatched bytes «صيغة الملف غير مدعومة — أرفق ملف PDF أو DOCX»; too large (over 4 MiB in the action, over 5 MiB in the function) «حجم الملف يتجاوز 4 ميجابايت».
- **Acceptance criteria:**
  - **AC-APPLY-03.1** — *Given* a PDF of exactly 4,194,304 bytes, *when* it is chosen and submitted, *then* no size error is shown and the application is accepted.
  - **AC-APPLY-03.2** — [NEG] *Given* a PDF of 4,194,305 bytes, *when* it is chosen, *then* «حجم الملف يتجاوز 4 ميجابايت» is shown and the submit button is disabled.
  - **AC-APPLY-03.3** — [NEG] *Given* a text file renamed `.pdf`, *when* submitted, *then* «صيغة الملف غير مدعومة — أرفق ملف PDF أو DOCX» is shown.
  - **AC-APPLY-03.4** — [NEG] *Given* a 0-byte file, *when* submitted, *then* «يرجى إرفاق السيرة الذاتية» is shown.
  - **AC-APPLY-03.5** — [NEG] *Given* a file whose browser MIME type is empty, *when* chosen, *then* the type error is shown.
  - **AC-APPLY-03.6** — [API][NEG] *Given* a PDF declared as DOCX, sent directly, *when* submitted, *then* the reply is 400 `invalid_input` with `field_errors.cv = "type"`.
  - **AC-APPLY-03.7** — [API] *Given* a valid PDF of 4.5 MiB sent directly to the function, *when* submitted, *then* it is accepted (the 4 MiB limit is a UI limit).
  - **AC-APPLY-03.8** — [API][NEG] *Given* a PDF over 5,242,880 bytes sent directly, *when* submitted, *then* the reply is 400 with `field_errors.cv = "size"`.
  - **AC-APPLY-03.9** — [API] *Given* a ZIP renamed `.docx` (starts with `PK\x03\x04`), *when* submitted, *then* it is accepted at submit time (only the leading bytes are checked); its analysis later fails at DOCX extraction.

#### REQ-APPLY-04 — Screening questions on the guest form
- **Routes:** `/jobs/[id]/apply`; Edge `submit-application`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/components/jobs/apply-form.tsx`; `srp/supabase/functions/_shared/screening.ts`
- **Rules:**
  - Fieldset «أسئلة من فريق التوظيف»; required questions show a red `*`.
  - Types: text (textarea, maxLength 2000), yes/no (radios «نعم» / «لا»), single choice (radios), multiple choice (checkboxes). HTML `required` is set only on text and radio inputs.
  - Server: answers are checked against the **job's own** questions (at most 10). yes/no must be exactly «نعم» or «لا»; choices must be among the job's options; text is cut at 2000 characters; invalid values are dropped silently. A required question with no valid answer gives `sq_{id}: required`, shown as «هذا السؤال إلزامي».
- **Acceptance criteria:**
  - **AC-APPLY-04.1** — *Given* a job with one required question of each type, *when* the apply page opens, *then* each question renders with its type control and a red `*`.
  - **AC-APPLY-04.2** — [NEG] *Given* a required multiple-choice question left unticked, *when* submitted, *then* «هذا السؤال إلزامي» is shown under it (server-side; the checkboxes have no HTML `required`).
  - **AC-APPLY-04.3** — [API][NEG] *Given* a required yes/no answered `yes`, *when* submitted directly, *then* the answer is treated as missing and `sq_{id}: required` is returned.
  - **AC-APPLY-04.4** — [API] *Given* a multiple-choice answer containing one valid and one unknown option, *when* submitted, *then* only the valid option is stored.
  - **AC-APPLY-04.5** — [API] *Given* a text answer of 2500 characters, *when* submitted, *then* the stored answer is 2000 characters long.

#### REQ-APPLY-05 — One application per job and email
- **Routes:** `/jobs/[id]/apply`; Edge `submit-application`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/supabase/functions/submit-application/index.ts:588-598`; `srp/supabase/migrations/0001_init.sql` (`unique (job_id, email)`)
- **Rules:**
  - Checked on `(job_id, lower(email))` **before** the CV upload → 409 `duplicate` with `field_errors.email = "duplicate"`.
  - The database unique constraint is the backstop: losing a race deletes the uploaded file and returns `duplicate`.
  - Guest and account applications share the rule: a guest application blocks a later account application with the same email to the same job, and the reverse.
  - The same email may apply to different jobs.
  - Message: top alert and email field «سبق أن تقدّمت لهذه الوظيفة بهذا البريد الإلكتروني».
  - A refused duplicate still consumes a throttle attempt (REQ-APPLY-07).
- **Acceptance criteria:**
  - **AC-APPLY-05.1** — [NEG] *Given* an existing application to job J by `a@x.com`, *when* `A@X.com` applies to J, *then* «سبق أن تقدّمت لهذه الوظيفة بهذا البريد الإلكتروني» is shown at the top and under the email field.
  - **AC-APPLY-05.2** — *Given* the same email, *when* it applies to a different job, *then* the application is accepted.
  - **AC-APPLY-05.3** — [API] *Given* two simultaneous submissions with the same job and email, *when* both complete, *then* exactly one returns 200, the other returns 409 `duplicate`, and only one CV object exists under `cvs/{org_id}/`.
  - **AC-APPLY-05.4** — [NEG] *Given* a seeker who applied with their account to job J, *when* a guest submits J with the same email, *then* the duplicate message is shown.

#### REQ-APPLY-06 — Job must be open when the form is submitted
- **Routes:** Edge `submit-application`
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/functions/submit-application/index.ts:212-251`
- **Rules:**
  - Non-POST → 405. Body not form-data, or `job_id` not a UUID → 400 `invalid_input` (general message only).
  - Unknown job → 404 `job_closed`. Job not published, soft-deleted, `closes_at` earlier than the **UTC** date, or org not `trial`/`active` or deleted → 409 `job_closed`. `closes_at` equal to today (UTC) is still open.
  - `listed_publicly` is **not** checked.
  - UI message: «التقديم غير متاح لهذه الوظيفة حالياً».
- **Acceptance criteria:**
  - **AC-APPLY-06.1** — [NEG] *Given* an apply page cached while the job was open, *when* HR closes the job and the visitor then submits, *then* «التقديم غير متاح لهذه الوظيفة حالياً» is shown.
  - **AC-APPLY-06.2** — [NEG] *Given* an org moved to `suspended` after the page loaded, *when* the visitor submits, *then* «التقديم غير متاح لهذه الوظيفة حالياً» is shown.
  - **AC-APPLY-06.3** — [API][NEG] *Given* a random UUID as `job_id`, *when* posted, *then* the reply is 404 `job_closed`.
  - **AC-APPLY-06.4** — [API][NEG] *Given* `job_id = "abc"`, *when* posted, *then* the reply is 400 `invalid_input` with no field errors, and the UI shows «يرجى التحقق من الحقول المدخلة».
  - **AC-APPLY-06.5** — [API][NEG] *Given* a GET request, *when* sent to the function, *then* the reply is 405.

#### REQ-APPLY-07 — Submission rate limits
- **Routes:** Edge `submit-application`; RPC `record_submission_attempt` (service role only)
- **Priority:** P0
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/migrations/0008_submission_throttle.sql:39-89`; `srp/supabase/functions/submit-application/index.ts:567-572`
- **Rules:**
  - Keys are salted SHA-256 hashes (`THROTTLE_SALT`, default `"srp"`). IP key: `cf-connecting-ip`, else `x-real-ip`, else the **rightmost** `X-Forwarded-For` hop. Profile mode uses `account:{user id}` instead.
  - Refused (429 `rate_limited`) when the IP/account key has ≥ 5 attempts in the last hour, or ≥ 20 in the last day, or the email key has ≥ 10 in the last day. The per-email count is **global** across all jobs and companies.
  - An attempt is recorded only when allowed, after validation and Turnstile, and **before** the duplicate check.
  - A throttle RPC error → 500 `server_error`.
  - UI message (guest): «تم استقبال عدد كبير من الطلبات من هذا الجهاز، يرجى المحاولة بعد قليل».
  - Raw IPs and emails are never stored; throttle rows older than 24 hours are deleted by housekeeping.
- **Acceptance criteria:**
  - **AC-APPLY-07.1** — [API][NEG] *Given* 5 allowed submissions from one IP within an hour (to different jobs), *when* a 6th is sent from that IP, *then* the reply is 429 `rate_limited` and the UI message is «تم استقبال عدد كبير من الطلبات من هذا الجهاز، يرجى المحاولة بعد قليل».
  - **AC-APPLY-07.2** — [API][NEG] *Given* the 6th request carries a fake leftmost `X-Forwarded-For` value, *when* sent, *then* it is still refused.
  - **AC-APPLY-07.3** — [API][NEG] *Given* 10 allowed submissions with the same email across different companies within a day, *when* an 11th is sent from a different IP, *then* it is refused with 429.
  - **AC-APPLY-07.4** — [API] *Given* a submission refused as `duplicate`, *when* the counters are checked, *then* it counted as an attempt; *given* a submission refused as `invalid_input`, *then* it did not.
  - **AC-APPLY-07.5** — [DB][NEG] *Given* an `anon` or `authenticated` session, *when* it calls `record_submission_attempt`, *then* the call is refused (no EXECUTE grant).
  - **AC-APPLY-07.6** — [DB] *Given* rows in `submission_attempts`, *when* they are inspected, *then* they contain hashes only, no raw IP or email.
  - **AC-APPLY-07.7** — Risk to verify in staging (OQ-07): guest submissions are relayed by the Next.js server, which forwards no client IP header, so the IP limit may apply to all guests together.

#### REQ-APPLY-08 — Bot check (Cloudflare Turnstile)
- **Routes:** `/jobs/[id]/apply`; Edge `submit-application`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** `srp/components/jobs/turnstile.tsx`; `srp/supabase/functions/submit-application/index.ts:165-197,563-565`
- **Rules:**
  - The widget renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set (`data-appearance="interaction-only"`, Arabic, field `cf-turnstile-response`). The script loads lazily from `challenges.cloudflare.com`.
  - The function checks the token only when `TURNSTILE_SECRET_KEY` is set. Missing or invalid token → 403 `captcha_failed`, UI «تعذّر التحقق من أنك لست روبوتاً، يرجى المحاولة مرة أخرى».
  - Secret unset, or Cloudflare unreachable → the submission is **allowed** and an error is logged.
  - Profile-mode (account) submissions skip Turnstile.
- **Acceptance criteria:**
  - **AC-APPLY-08.1** — *Given* both keys unset, *when* a guest submits, *then* no widget is shown and the application is accepted.
  - **AC-APPLY-08.2** — [NEG] *Given* both keys set (always-fail test keys), *when* a guest submits, *then* «تعذّر التحقق من أنك لست روبوتاً، يرجى المحاولة مرة أخرى» is shown.
  - **AC-APPLY-08.3** — *Given* both keys set (always-pass test keys), *when* a guest submits, *then* the application is accepted.
  - **AC-APPLY-08.4** — [KD-03] *Given* the secret set and the site key unset, *when* a guest submits, *then* the configuration should not block applying. (Observed in code: no widget renders, no token is sent, and **every** guest submission is refused with the captcha message.)

#### REQ-APPLY-09 — Success screen and reference code
- **Routes:** `/jobs/[id]/apply`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/components/jobs/apply-form.tsx`; `srp/supabase/functions/_shared/application.ts:15-18`; `srp/supabase/functions/submit-application/index.ts:60,104-110`
- **Rules:**
  - Function reply 200 `{ok:true, ref_code:"HKM-XXXXXXXX"}`: prefix `HKM-` plus 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1). A `ref_code` collision is retried, up to 3 attempts in total.
  - Screen: «تم استلام طلبك بنجاح»; «احتفظ برمز المتابعة التالي لتتبّع حالة طلبك، وسنراسلك عبر البريد الإلكتروني عند أي تحديث.»; label «رمز المتابعة» with the code (LTR, monospace, select-all); button «نسخ الرمز», which reads «تم النسخ» for 2 s; button «تتبّع حالة طلبك» → `/track/{ref}`.
- **Acceptance criteria:**
  - **AC-APPLY-09.1** — *Given* a valid guest application, *when* it is submitted, *then* «تم استلام طلبك بنجاح» is shown with a code matching `^HKM-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$`.
  - **AC-APPLY-09.2** — *Given* the success screen, *when* «نسخ الرمز» is pressed, *then* the clipboard holds the code and the button reads «تم النسخ» for about 2 seconds.
  - **AC-APPLY-09.3** — *Given* the success screen, *when* «تتبّع حالة طلبك» is pressed, *then* `/track/{ref}` opens and shows «تم استلام الطلب».

#### REQ-APPLY-10 — Server-side write path and CV storage (D15, D8)
- **Routes:** Edge `submit-application`; table `applications`; bucket `cvs`
- **Priority:** P0
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/functions/submit-application/index.ts`; `srp/supabase/migrations/0006_multitenancy.sql:700-703`; `srp/supabase/migrations/0007_storage_isolation.sql`
- **Rules:**
  - `anon` has no INSERT on `applications` and no write on the `cvs` bucket.
  - The function derives `org_id` from the job, never from the client; the insert payload carries no `org_id`, and the trigger `applications_set_org` sets it.
  - The CV is stored at `cvs/{org_id}/{application_id}.{pdf|docx}` with the service role. A failed upload → 500 `server_error`. A failed insert deletes the uploaded file.
  - The new row has `status = new`, `analysis_status = pending`, and a history row `new` with `changed_by` null.
- **Acceptance criteria:**
  - **AC-APPLY-10.1** — [DB][NEG] *Given* the anon key, *when* a client inserts directly into `applications`, *then* the insert is refused (42501).
  - **AC-APPLY-10.2** — [DB][NEG] *Given* the anon key, *when* a client uploads to the `cvs` bucket, *then* the upload is refused.
  - **AC-APPLY-10.3** — [API] *Given* a guest application to an Org B job with an extra `org_id` field naming Org A, *when* it is stored, *then* the row's `org_id` is Org B's.
  - **AC-APPLY-10.4** — [DB] *Given* a stored application, *when* storage is inspected, *then* its CV is at `cvs/{org_id}/{application_id}.pdf` (or `.docx`).

#### REQ-APPLY-11 — Applying never fails because of the AI or the mailer (D4)
- **Routes:** Edge `submit-application`
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/functions/submit-application/index.ts:643-652,679-699`
- **Rules:**
  - After the insert, the function calls `analyze-application` and `send-email {kind:"application_received"}` with the service role, awaits both with `Promise.allSettled`, ignores their failures, and returns 200.
  - Any other failure (network error, non-JSON reply, unknown code) shows «تعذّر إرسال الطلب، يرجى المحاولة مرة أخرى».
- **Acceptance criteria:**
  - **AC-APPLY-11.1** — *Given* `GEMINI_API_KEY` unset, *when* a guest applies, *then* the success screen and code are shown, and the application exists with `analysis_status = failed`.
  - **AC-APPLY-11.2** — *Given* `RESEND_API_KEY` unset, *when* a guest applies, *then* the success screen is shown and no email is sent.
  - **AC-APPLY-11.3** — *Given* the org's analysis quota is exhausted, *when* a guest applies, *then* the success screen is shown (the analysis fails later; REQ-QUOTA-03).
  - **AC-APPLY-11.4** — [NEG] *Given* `submit-application` is unreachable, *when* a guest submits, *then* «تعذّر إرسال الطلب، يرجى المحاولة مرة أخرى» is shown.

#### REQ-APPLY-12 — Application-received email
- **Routes:** Edge `send-email` kind `application_received`
- **Priority:** P1
- **Test type:** API; UI e2e (mail capture)
- **Source:** `srp/supabase/functions/send-email/templates.ts:54-70`
- **Rules:** see EM-01 in §9. Subject `تم استلام طلبك — {jobTitle}`; heading «تم استلام طلبك بنجاح»; includes the reference code; includes the link «تتبّع حالة طلبك من هنا» only when `SITE_URL` is set; company name in the footer. Sent for guest and account applications.
- **Acceptance criteria:**
  - **AC-APPLY-12.1** — *Given* Resend configured and `SITE_URL` set, *when* a guest applies, *then* the applicant receives `تم استلام طلبك — {jobTitle}` containing the same reference code as the success screen and the link «تتبّع حالة طلبك من هنا» to `/track/{ref}`.
  - **AC-APPLY-12.2** — *Given* `SITE_URL` unset, *when* a guest applies, *then* the email contains the code but no tracking link.

### F-TRACK-01 — Application tracking (P0)

#### REQ-TRACK-01 — Tracking lookup form
- **Routes:** `/track`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/track/page.tsx:22-31`
- **Rules:**
  - Card «تتبّع حالة الطلب»; hint «أدخل رمز المتابعة الذي استلمته عند التقديم (مثال: HKM-XXXXXXXX)»; label «رمز المتابعة»; input required, maxLength 40, placeholder `HKM-XXXXXXXX`; button «عرض الحالة».
  - The server action trims and upper-cases the code. Length 1–40 → `/track/{code}`; otherwise back to `/track` with no message. Works without JavaScript.
- **Acceptance criteria:**
  - **AC-TRACK-01.1** — *Given* a valid code typed in lower case with spaces around it, *when* «عرض الحالة» is pressed, *then* `/track/{CODE}` opens with the code upper-cased.
  - **AC-TRACK-01.2** — [NEG] *Given* a 41-character value sent by a crafted request, *when* submitted, *then* the user is returned to `/track` with no message.
  - **AC-TRACK-01.3** — *Given* JavaScript disabled, *when* a code is submitted, *then* the result page opens.

#### REQ-TRACK-02 — Tracking result
- **Routes:** `/track/[ref]`; RPC `track_application` (anon)
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/app/(public)/track/[ref]/page.tsx`; `srp/supabase/migrations/0001_init.sql:160-187`
- **Rules:**
  - `force-dynamic`. The code is normalised (`decodeURIComponent` → trim → upper case) and read through `track_application`, which returns `(to_status, created_at)` rows, oldest first, exact match.
  - Header: back link «البحث برمز آخر», H1 «تتبّع حالة الطلب», `رمز المتابعة: {code}`.
  - «الحالة الحالية»: a badge for the last row. «سجل الحالة»: every status with date and time.
  - Status labels: new «تم استلام الطلب», under_review «قيد المراجعة», interview «دعوة لمقابلة», accepted «تم القبول», rejected «تم الاعتذار».
  - Loading: skeleton. Metadata title «تتبّع حالة الطلب».
  - No name, email, notes, score or AI output is shown.
- **Acceptance criteria:**
  - **AC-TRACK-02.1** — *Given* a new application, *when* `/track/{ref}` opens, *then* «الحالة الحالية» shows «تم استلام الطلب» and «سجل الحالة» has exactly one row with a date and time.
  - **AC-TRACK-02.2** — *Given* HR moved the application to «قيد المراجعة» then «دعوة لمقابلة», *when* `/track/{ref}` opens, *then* the current status is «دعوة لمقابلة» and the history lists «تم استلام الطلب», «قيد المراجعة», «دعوة لمقابلة» in that order.
  - **AC-TRACK-02.3** — *Given* the code in lower case in the URL, *when* the page opens, *then* the application is found.
  - **AC-TRACK-02.4** — [PERM] *Given* any application, *when* its tracking page renders, *then* the page contains none of: applicant name, email, phone, HR note, score.

#### REQ-TRACK-03 — Tracking not found
- **Routes:** `/track/[ref]`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(public)/track/[ref]/page.tsx`
- **Rules:** no rows, or an RPC error, → «لم نعثر على طلب بهذا الرمز» / «تأكد من كتابة رمز المتابعة كما وصلك بالضبط ثم حاول مجدداً.» An outage is not distinguished from "not found". This is an in-page state, not the 404 page. An application deleted by retention is "not found".
- **Acceptance criteria:**
  - **AC-TRACK-03.1** — [NEG] *Given* the code `HKM-ZZZZZZZZ` that does not exist, *when* `/track/HKM-ZZZZZZZZ` opens, *then* «لم نعثر على طلب بهذا الرمز» and «تأكد من كتابة رمز المتابعة كما وصلك بالضبط ثم حاول مجدداً.» are shown, with HTTP 200.
  - **AC-TRACK-03.2** — [NEG] *Given* a malformed percent-encoding in the URL (e.g. `/track/%E0%A4%A`), *when* opened, *then* the outcome is recorded (it passes through `decodeURIComponent`; expected behaviour is not specified — OQ-09).

### 5.4 Accounts, onboarding, invitations and roles

### F-AUTH-01 — Sign-up (P0)

#### REQ-AUTH-01 — Sign-up page and audience tabs
- **Routes:** `/signup`, `/signup?as=seeker`, `/signup?as=company`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/signup/page.tsx`; `srp/app/signup/signup-form.tsx`; `srp/components/seeker/onboarding/audience-tabs.tsx`
- **Rules:**
  - Tabs in a nav labelled «نوع الحساب»: «أبحث عن عمل» (`?as=seeker`) and «أمثّل شركة» (`?as=company`). Default is **company** when `as` is missing or any value other than `seeker`. Tabs are links (history `replace`) that keep `next`. The tab is never stored; it only picks the landing page after confirmation (D26).
  - H1 «أنشئ حساباً». Subtitle on the seeker tab «ارفع سيرتك مرة واحدة، وتقدّم للوظائف دون إعادة رفعها.»; on the company tab «ابدأ تجربة مجانية — لا حاجة لبطاقة.»
  - Google button «المتابعة باستخدام Google» (pending «جارٍ التحويل إلى Google…»), then the divider «أو».
  - Fields «البريد الإلكتروني» (`type=email`, required) and «كلمة المرور» (required, minLength 8, hint «8 أحرف على الأقل»). Submit «إنشاء حساب» (pending «جارٍ الإنشاء…»).
  - «لديك حساب؟» «تسجيل الدخول» → `/login` when the target is `/onboarding`, else `/login?next={target}`.
- **Acceptance criteria:**
  - **AC-AUTH-01.1** — *Given* `/signup`, *when* it loads, *then* the «أمثّل شركة» tab is active and the subtitle reads «ابدأ تجربة مجانية — لا حاجة لبطاقة.»
  - **AC-AUTH-01.2** — *Given* `/signup?as=seeker`, *when* it loads, *then* «أبحث عن عمل» is active and the subtitle reads «ارفع سيرتك مرة واحدة، وتقدّم للوظائف دون إعادة رفعها.»
  - **AC-AUTH-01.3** — *Given* `/signup?as=xyz`, *when* it loads, *then* the company tab is active.
  - **AC-AUTH-01.4** — *Given* `/signup?as=seeker&next=/me/apply/{id}`, *when* the «أمثّل شركة» tab is clicked, *then* the URL keeps `next=/me/apply/{id}`.

#### REQ-AUTH-02 — Sign-up validation and errors
- **Routes:** `/signup`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/signup/actions.ts`
- **Rules:**
  - Server: email valid and ≤ 200 characters; password 8–72 characters. Otherwise «أدخل بريداً صحيحاً وكلمة مرور من 8 أحرف على الأقل».
  - Supabase error containing "already" → «هذا البريد مسجّل مسبقاً — سجّل الدخول بدلاً من ذلك». Any other error or exception → «حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى».
  - With email confirmations on, Supabase may return success for an existing email; the form then shows the confirmation screen (project setting dependent).
- **Acceptance criteria:**
  - **AC-AUTH-02.1** — [NEG] *Given* a 7-character password (bypassing the browser), *when* submitted, *then* «أدخل بريداً صحيحاً وكلمة مرور من 8 أحرف على الأقل» is shown.
  - **AC-AUTH-02.2** — [NEG] *Given* a 73-character password, *when* submitted, *then* the same message is shown.
  - **AC-AUTH-02.3** — *Given* passwords of 8 and 72 characters, *when* submitted, *then* no validation message is shown.
  - **AC-AUTH-02.4** — [NEG] *Given* a project where Supabase reports an existing email with an "already" message, *when* that email signs up, *then* «هذا البريد مسجّل مسبقاً — سجّل الدخول بدلاً من ذلك» is shown.

#### REQ-AUTH-03 — Sign-up result and confirmation email
- **Routes:** `/signup`; Supabase Auth email; `/auth/callback`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/signup/actions.ts:118-122,156-162`; `srp/supabase/templates/confirm-signup.html`
- **Rules:**
  - Target: a safe `next` wins; otherwise seeker tab → `/onboarding/seeker`, company tab → `/onboarding`.
  - If Supabase returns a session (confirmations off) → redirect to the target. Otherwise the screen «تحقّق من بريدك» / «أرسلنا رابط تأكيد إلى بريدك. افتحه لإكمال إنشاء الحساب.»
  - `emailRedirectTo` = `{NEXT_PUBLIC_SITE_URL or request host}/auth/callback?next={target}&via=email`.
  - The confirmation email is sent by Supabase Auth, not Resend. Repository template: subject «تأكيد بريدك الإلكتروني», button «تأكيد البريد» (wired for local only; a hosted project sends English defaults unless configured).
- **Acceptance criteria:**
  - **AC-AUTH-03.1** — *Given* confirmations on, *when* a new email signs up on the company tab, *then* «تحقّق من بريدك» is shown, and the confirmation link leads (same browser) through `/auth/callback` to `/onboarding`.
  - **AC-AUTH-03.2** — *Given* confirmations on, *when* a new email signs up on the seeker tab and confirms in the same browser, *then* it lands on `/onboarding/seeker`.
  - **AC-AUTH-03.3** — *Given* `/signup?next=/invite/{token}`, *when* the user signs up and confirms in the same browser, *then* they land on `/invite/{token}`.

#### REQ-AUTH-04 — Signed-in visitors on `/signup` and `/login`
- **Routes:** `/signup`, `/login`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/lib/supabase/proxy.ts:149-157`; `srp/app/signup/page.tsx:41`; `srp/app/login/page.tsx:54`
- **Rules:** without `next`, the proxy redirects a signed-in user to `/onboarding` and **drops the query string**. With a safe `next`, the page redirects to it (login falls back to `homePath()` when `next` is unsafe).
- **Acceptance criteria:**
  - **AC-AUTH-04.1** — *Given* the signed-in hr user, *when* `/login` opens, *then* the browser ends on `/admin` (via `/onboarding`).
  - **AC-AUTH-04.2** — *Given* a signed-in user with no hat, *when* `/signup?as=seeker` opens, *then* they end on `/onboarding` showing the chooser on the **company** tab (query dropped).
  - **AC-AUTH-04.3** — *Given* a signed-in seeker, *when* `/login?next=/me/jobs` opens, *then* they land on `/me/jobs`.

### F-AUTH-02 — Sign-in, routing by hat, sign-out (P0)

#### REQ-AUTH-05 — Login form and errors
- **Routes:** `/login`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/login/page.tsx`; `srp/app/login/actions.ts`; `srp/app/login/login-form.tsx`
- **Rules:**
  - Header «تسجيل الدخول» / «إلى مساحة شركتك، أو إلى حسابك كباحث عن عمل.»
  - Invalid input (bad email or empty password) → «يرجى إدخال بريد إلكتروني صحيح وكلمة مرور».
  - **Any** Supabase sign-in error → «البريد الإلكتروني أو كلمة المرور غير صحيحة» (an unconfirmed email is not distinguished).
  - Exception → «حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى».
  - Submit «تسجيل الدخول» (pending «جارٍ تسجيل الدخول…»).
  - No forgot-password or reset link exists.
- **Acceptance criteria:**
  - **AC-AUTH-05.1** — *Given* `admin@example.com` / `Admin123!`, *when* submitted, *then* the user lands on `/admin`.
  - **AC-AUTH-05.2** — [NEG] *Given* a wrong password, *when* submitted, *then* «البريد الإلكتروني أو كلمة المرور غير صحيحة» is shown.
  - **AC-AUTH-05.3** — [NEG] *Given* an account whose email is not confirmed, *when* it signs in, *then* «البريد الإلكتروني أو كلمة المرور غير صحيحة» is shown.
  - **AC-AUTH-05.4** — [STATE] *Given* valid credentials, *when* submitted, *then* the button reads «جارٍ تسجيل الدخول…» while pending.

#### REQ-AUTH-06 — Login banners driven by the query string
- **Routes:** `/login?error=…`, `/login?notice=…`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/login/page.tsx`
- **Rules:**

  | Query | Banner |
  |---|---|
  | `error=oauth` | destructive «تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى، أو استخدم البريد وكلمة المرور.» |
  | `error=confirm` | info «تأكّد بريدك، لكن تعذّر إدخالك تلقائياً — غالباً لأن رابط التأكيد فُتح في متصفح آخر. سجّل الدخول للمتابعة.» |
  | `error=link_expired` | destructive «انتهت صلاحية رابط التأكيد أو سبق استخدامه، فلم يتأكّد بريدك بعد. أنشئ الحساب بالبريد نفسه مرة أخرى لنرسل إليك رابطاً جديداً.» |
  | `notice=account_deleted` | success «حُذف حسابك وكل بياناتك كباحث. الطلبات التي أرسلتها سابقاً تبقى لدى الشركات وفق سياسة كل منها.» |
  | any other value | ignored |
- **Acceptance criteria:**
  - **AC-AUTH-06.1** — *Given* each of the four query values above, *when* `/login` opens with it, *then* exactly the matching banner text is shown.
  - **AC-AUTH-06.2** — [NEG] *Given* `/login?error=foo`, *when* it opens, *then* no banner is shown.

#### REQ-AUTH-07 — Post-login destination and `homePath()`
- **Routes:** `/login`, `/onboarding`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/login/actions.ts:43`; `srp/lib/seeker.ts:162-167`; `srp/lib/supabase/proxy.ts:73-74`
- **Rules:**
  - Success → `safeNext(next, "/onboarding")`; `/onboarding` then routes by hat (REQ-ONB-01).
  - `homePath()`: company hat → `/admin`; seeker with step `done` → `/me`; seeker not done → `/onboarding/seeker`; neither → `/onboarding`. A two-hat user goes to `/admin` first.
  - A signed-out visit to `/admin/*` redirects to `/login` with **no** `next`, so a deep link is lost (OQ-10).
- **Acceptance criteria:**
  - **AC-AUTH-07.1** — *Given* `seeker@example.com` (no hat), *when* they sign in, *then* they land on the onboarding chooser.
  - **AC-AUTH-07.2** — *Given* a seeker whose onboarding is `done`, *when* they sign in with no `next`, *then* they land on `/me`.
  - **AC-AUTH-07.3** — *Given* a two-hat user, *when* they sign in with no `next`, *then* they land on `/admin`.
  - **AC-AUTH-07.4** — *Given* a signed-out visitor opening `/admin/applications/{id}`, *when* they sign in, *then* they land on `/admin` (not on the application). This records current behaviour.

#### REQ-AUTH-08 — "No account?" link on login
- **Routes:** `/login`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/login/page.tsx:27-38`
- **Rules:** «ليس لديك حساب؟» «إنشاء حساب» → `/signup`, adding `as=seeker` when the target is `/onboarding/seeker`, `/me` or `/me/*`, and adding `next` when the target is anything other than `/onboarding` or `/onboarding/seeker`.
- **Acceptance criteria:**
  - **AC-AUTH-08.1** — *Given* `/login?next=/me/apply/{id}`, *when* «إنشاء حساب» is inspected, *then* it points to `/signup` with `as=seeker` and `next=/me/apply/{id}`.
  - **AC-AUTH-08.2** — *Given* `/login?next=/onboarding/seeker`, *when* «إنشاء حساب» is inspected, *then* it points to `/signup?as=seeker` with no `next`.

#### REQ-AUTH-09 — Sign-out
- **Routes:** sidebar «تسجيل الخروج» in `/admin`; `/me` and `/onboarding/seeker` headers
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/login/actions.ts` (`signOut`)
- **Rules:** deletes the `active_org` cookie and redirects to `/login`.
- **Acceptance criteria:**
  - **AC-AUTH-09.1** — *Given* a signed-in owner, *when* «تسجيل الخروج» is pressed, *then* the user lands on `/login`, the `active_org` cookie is gone, and `/admin` now redirects to `/login`.

### F-AUTH-03 — Google sign-in and the auth callback (P1)

#### REQ-AUTH-10 — Starting Google sign-in
- **Routes:** `/login`, `/signup`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/auth/actions.ts:32-55`
- **Rules:** `next = safeNext(form.next, "/onboarding")`; `redirectTo` = `{site}/auth/callback?next=…`; `prompt=select_account`. No provider URL → `/login?error=oauth`. The sign-up page passes the target (seeker tab → `/onboarding/seeker`); the login page passes the safe `next` or nothing. Google is disabled in the local config.
- **Acceptance criteria:**
  - **AC-AUTH-10.1** — *Given* a project with Google enabled, *when* «المتابعة باستخدام Google» is pressed on the seeker tab, *then* the browser goes to Google with a return URL ending in `/auth/callback?next=%2Fonboarding%2Fseeker`.
  - **AC-AUTH-10.2** — [NEG] *Given* Google is not configured so no provider URL is returned, *when* the button is pressed, *then* the user lands on `/login?error=oauth` with its banner.

#### REQ-AUTH-11 — Auth callback outcomes
- **Routes:** `/auth/callback`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/auth/callback/route.ts:65-104`
- **Rules:**
  1. `code` present and exchanged → redirect to `next` (default `/onboarding`).
  2. Else `via=email` with an `error_code` parameter → `/login?error=link_expired`.
  3. Else `via=email` → `/login?error=confirm`, adding `&next=` when `next` ≠ `/onboarding` (link opened in another browser; PKCE verifier missing).
  4. Else → `/login?error=oauth` (e.g. cancelled at Google).
- **Acceptance criteria:**
  - **AC-AUTH-11.1** — *Given* a confirmation link opened in a second browser, *when* it reaches the callback, *then* the user lands on `/login?error=confirm` (with `next=/onboarding/seeker` for a seeker sign-up).
  - **AC-AUTH-11.2** — [NEG] *Given* an expired or reused confirmation link, *when* it reaches the callback, *then* the user lands on `/login?error=link_expired`.
  - **AC-AUTH-11.3** — [NEG] *Given* `/auth/callback` with no parameters, *when* opened, *then* the user lands on `/login?error=oauth`.

### F-AUTH-04 — Safe redirect targets (P0)

#### REQ-AUTH-12 — `safeNext` rules
- **Routes:** `/login`, `/signup`, `/auth/callback`, Google start
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/lib/redirects.ts:181-193`
- **Rules:** a `next` value is accepted only if it is a string starting with `/`, contains no control characters (U+0000–U+001F, U+007F) and no backslash, and resolves on the same origin. The normalised path + query + hash is used; otherwise the fallback.
- **Acceptance criteria:**
  - **AC-AUTH-12.1** — [NEG] *Given* `next` values `https://evil.com`, `//evil.com`, `/\tevil.com` (with a tab) and `/\evil`, *when* the user signs in, *then* they land on the fallback, never on another origin.
  - **AC-AUTH-12.2** — *Given* `next=/me/jobs?x=1#top`, *when* the user signs in, *then* they land on `/me/jobs?x=1#top`.

### F-ONB-01 — Onboarding router and company workspace creation (P0)

#### REQ-ONB-01 — Onboarding router
- **Routes:** `/onboarding`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/onboarding/page.tsx:35-58`; `srp/lib/auth.ts`
- **Rules:**
  1. Signed out → `/login`.
  2. A `profiles` row plus a membership in a non-deleted org → `/admin`.
  3. A seeker hat (`my_hats`) without `?as=company` → `/me` if the step is `done`, else `/onboarding/seeker`.
  4. Otherwise the chooser.
- **Acceptance criteria:**
  - **AC-ONB-01.1** — *Given* the hr user, *when* `/onboarding` opens, *then* they are redirected to `/admin`.
  - **AC-ONB-01.2** — *Given* a seeker at step `contact`, *when* `/onboarding` opens, *then* they are redirected to `/onboarding/seeker`.
  - **AC-ONB-01.3** — [NEG] *Given* a signed-out visitor, *when* `/onboarding` opens, *then* they are redirected to `/login`.

#### REQ-ONB-02 — Chooser
- **Routes:** `/onboarding`, `/onboarding?as=seeker`, `/onboarding?as=company`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/onboarding/page.tsx`
- **Rules:**
  - H1 «كيف ستستخدم حكيم؟» / «اختر ما جئت من أجله.»; metadata title «ابدأ». Tabs `?as=seeker` / `?as=company`; default company.
  - Company tab: card «أنشئ مساحة عمل شركتك» / «خطوة واحدة وتبدأ بنشر وظائفك واستقبال المتقدمين.» with the form (REQ-ONB-03).
  - Seeker tab: card «ملفك المهني يبدأ بسيرتك» / «ارفع سيرتك مرة واحدة، فنقرأها ونستخلص خبراتك ومهاراتك، ثم تراجع ما استخرجناه وتتقدّم للوظائف دون إعادة رفعها.» and the button «ابدأ بسيرتك الذاتية» → `/onboarding/seeker`.
- **Acceptance criteria:**
  - **AC-ONB-02.1** — *Given* `seeker@example.com` signed in, *when* `/onboarding` opens, *then* the chooser shows «كيف ستستخدم حكيم؟» with the company tab active.
  - **AC-ONB-02.2** — *Given* the seeker tab, *when* «ابدأ بسيرتك الذاتية» is pressed, *then* `/onboarding/seeker` opens.

#### REQ-ONB-03 — Company workspace form
- **Routes:** `/onboarding`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/onboarding/onboarding-form.tsx:17-24`; `google-name.ts`
- **Rules:**
  - «اسمك الكامل»: required, maxLength 120; defaults to the Google `full_name` / `name`, trimmed to 120.
  - «اسم الشركة»: required, maxLength 200.
  - «الرابط المختصر للشركة»: LTR, placeholder `my-company`; live preview «سيكون رابط صفحة التوظيف:» `{ROOT_DOMAIN}/c/{slug}` (or `…` while empty).
  - Client `slugify` on every keystroke: lower-case; any character outside `[a-z0-9-]` → `-`; repeated `-` collapsed; a leading or trailing `-` **stripped**; cut to 40 characters.
  - Submit «إنشاء مساحة العمل» (pending «جارٍ الإنشاء…»). There is no live availability check.
- **Acceptance criteria:**
  - **AC-ONB-03.1** — *Given* the slug field, *when* `My Company` is pasted, *then* it becomes `my-company` and the preview ends with `/c/my-company`.
  - **AC-ONB-03.2** — *Given* the slug field, *when* `my-company` is typed one key at a time, *then* the value becomes `mycompany` (a trailing hyphen is stripped on each keystroke). This records current behaviour (OQ-11).
  - **AC-ONB-03.3** — *Given* Arabic letters typed in the slug field, *when* slugified, *then* they are removed.

#### REQ-ONB-04 — Workspace creation validation and errors
- **Routes:** `/onboarding`; RPC `create_organization`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/onboarding/actions.ts:158-164`; `srp/supabase/migrations/0009_onboarding.sql:75-135`; `srp/supabase/migrations/0006_multitenancy.sql:37-40`
- **Rules:**
  - Server: company name trimmed 2–200; slug lower-case matching `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$` (3–40); full name 2–120. Failure → top «يرجى التحقق من الحقول المدخلة» with field messages: slug «الرابط بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ولا يقل عن ثلاثة أحرف», name «اسم الشركة حرفان على الأقل», full name «الاسم الكامل حرفان على الأقل».
  - Slug taken → «هذا الرابط محجوز، اختر غيره» (top and field).
  - Reserved slugs (`admin`, `platform`, `api`, `app`, `www`, `login`, `signup`, `jobs`, `companies`, `track`, `settings`, `static`, `assets`, `public`, `auth`) → the slug-format message.
  - The user already has **any** membership → redirect `/admin`.
  - Other errors → «تعذّر إنشاء مساحة العمل، حاول مرة أخرى».
  - A direct INSERT into `organizations` is refused; `anon` cannot call `create_organization`.
- **Acceptance criteria:**
  - **AC-ONB-04.1** — [NEG] *Given* slug `default` (taken by the seed org), *when* submitted, *then* «هذا الرابط محجوز، اختر غيره» is shown.
  - **AC-ONB-04.2** — [NEG] *Given* slug `jobs`, *when* submitted, *then* «الرابط بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ولا يقل عن ثلاثة أحرف» is shown.
  - **AC-ONB-04.3** — [NEG] *Given* slug `ab`, *when* submitted, *then* the slug-format message is shown.
  - **AC-ONB-04.4** — [NEG] *Given* a company name of 1 character, *when* submitted, *then* «اسم الشركة حرفان على الأقل» is shown.
  - **AC-ONB-04.5** — [DB][NEG] *Given* an `authenticated` session, *when* it inserts into `organizations` directly, *then* the insert is refused; *given* `anon`, *when* it calls `create_organization`, *then* it is refused.

#### REQ-ONB-05 — Workspace creation success
- **Routes:** `/onboarding` → `/admin`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/onboarding/actions.ts`; `srp/supabase/migrations/0009_onboarding.sql`
- **Rules:** the org is created with `status = trial`; a `profiles` row is upserted; the membership role is `owner`; the `active_org` cookie is set; redirect to `/admin`. New orgs get `monthly_analysis_quota = 25` and `monthly_interview_quota = 0`.
- **Acceptance criteria:**
  - **AC-ONB-05.1** — *Given* a new confirmed account with no hat, *when* it submits a valid name and an unused slug, *then* it lands on `/admin`, the sidebar role badge reads «المالك», and `/c/{slug}` renders the new careers page.
  - **AC-ONB-05.2** — [DB] *Given* the new org, *when* it is inspected, *then* `status = trial`, `monthly_analysis_quota = 25`, `monthly_interview_quota = 0`.
  - **AC-ONB-05.3** — [DB][NEG] *Given* the new owner, *when* they call `create_organization` a second time, *then* it is refused ("already a member"), and the UI redirects to `/admin`.

#### REQ-ONB-06 — A seeker adds a company workspace
- **Routes:** `/onboarding?as=company`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/onboarding/page.tsx:53`
- **Rules:** a seeker with `?as=company` gets no tabs, the H1 «أنشئ مساحة عمل شركتك», and the name prefilled from their seeker profile. After creation they hold both hats.
- **Acceptance criteria:**
  - **AC-ONB-06.1** — *Given* a seeker who finished onboarding, *when* they open `/onboarding?as=company`, *then* the H1 is «أنشئ مساحة عمل شركتك» and «اسمك الكامل» holds their profile name.
  - **AC-ONB-06.2** — *Given* the same seeker creates a workspace, *when* they open `/admin`, *then* the sidebar shows «حسابي كباحث»; and `/me` shows «مساحة الشركة».

### F-INV-01 — Team invitations (P1)

#### REQ-INV-01 — Issuing an invitation
- **Routes:** `/admin/settings` (form «دعوة عضو بالبريد»); Edge `manage-users` action `invite`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** `srp/components/admin/settings-forms.tsx`; `srp/supabase/functions/manage-users/index.ts:151-207`
- **Rules:**
  - Hint «يستلم العضو رابطاً صالحاً سبعة أيام ويختار كلمة مروره بنفسه.» Email ≤ 200; role viewer / hr / admin (plus owner for an owner); default hr.
  - Submit «إرسال الدعوة» (pending «جارٍ الإرسال…»). Success «تم إرسال الدعوة». Invalid input «أدخل بريداً صحيحاً واختر دوراً». Failure «تعذّر إرسال الدعوة، حاول مرة أخرى». Owner role chosen by an admin «المالك وحده يستطيع تعيين مالك آخر». Invitation created but the email failed «أُنشئت الدعوة لكن تعذّر إرسال البريد — راجع إعدادات البريد ثم أعد الإرسال».
  - Function: caller's `org_role` must be owner or admin (else 403 `org admin only`); role owner requested by a non-owner → 403 `owner only`; an unknown role **defaults to hr**. It revokes any pending invitation for the same org and email, inserts a new one (SHA-256 token hash, 7-day expiry) and sends the email. Reply 200 `{ok, invitation_id, emailed}`.
- **Acceptance criteria:**
  - **AC-INV-01.1** — *Given* the owner, *when* they invite `new@x.com` as «موارد بشرية», *then* «تم إرسال الدعوة» is shown, the email arrives (EM-06), and the invitation appears under «دعوات معلّقة».
  - **AC-INV-01.2** — [PERM][NEG] *Given* an admin, *when* they post an invitation with role owner, *then* «المالك وحده يستطيع تعيين مالك آخر» is shown and no invitation is created.
  - **AC-INV-01.3** — *Given* an invitation already pending for `new@x.com`, *when* it is re-sent, *then* the first link becomes invalid and only the new one works.
  - **AC-INV-01.4** — *Given* `RESEND_API_KEY` unset, *when* an invitation is sent, *then* «أُنشئت الدعوة لكن تعذّر إرسال البريد — راجع إعدادات البريد ثم أعد الإرسال» is shown and the invitation is listed.
  - **AC-INV-01.5** — [API] *Given* a direct call with role `superuser`, *when* processed, *then* the invitation is created with role hr.
  - **AC-INV-01.6** — [API][PERM][NEG] *Given* an hr user's JWT, *when* it calls `manage-users` invite, *then* the reply is 403 `org admin only`.

#### REQ-INV-02 — Pending invitations list and revoke
- **Routes:** `/admin/settings`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/components/admin/settings-forms.tsx`
- **Rules:** «دعوات معلّقة» lists email, role, `تنتهي في {date}` and a button «إلغاء» per row. «إلغاء» has no confirmation and ignores errors (so «تعذّر إلغاء الدعوة» never appears). The list filters `status = pending` only, so an invitation past its 7 days but never opened is still listed.
- **Acceptance criteria:**
  - **AC-INV-02.1** — *Given* a pending invitation, *when* «إلغاء» is pressed, *then* the row disappears and its link shows «الدعوة غير صالحة».
  - **AC-INV-02.2** — *Given* an invitation whose `expires_at` has passed but which was never opened, *when* settings load, *then* it is still listed. This records current behaviour.

#### REQ-INV-03 — Invitation page, signed out
- **Routes:** `/invite/[token]`; RPC `invitation_preview` (anon)
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/invite/[token]/page.tsx`; `srp/supabase/migrations/0010_invitation_preview.sql`
- **Rules:**
  - The preview returns only `org_name`, `role`, `expires_at`, and only for `status = pending` and `expires_at > now()`.
  - No row → card «الدعوة غير صالحة» / «قد تكون الدعوة منتهية أو أُلغيت أو استُخدمت من قبل. اطلب من مدير الفريق دعوة جديدة.»
  - Valid, signed out: «دعوة للانضمام»; `تمت دعوتك للانضمام إلى {org} — {role label}`; «سجّل الدخول بالبريد الذي وصلتك عليه الدعوة، أو أنشئ حساباً به.»; «تسجيل الدخول» → `/login?next=/invite/{token}`; «إنشاء حساب» → `/signup?next=/invite/{token}`.
- **Acceptance criteria:**
  - **AC-INV-03.1** — *Given* a valid invitation as «مطّلع», *when* the link opens signed out, *then* it shows «دعوة للانضمام», the org name and «مطّلع», and both buttons carry `next=/invite/{token}`.
  - **AC-INV-03.2** — [NEG] *Given* a revoked, expired, already accepted or made-up token, *when* the link opens, *then* «الدعوة غير صالحة» is shown.

#### REQ-INV-04 — Accepting an invitation
- **Routes:** `/invite/[token]`; RPC `accept_invitation`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/invite/[token]/actions.ts`; `srp/supabase/migrations/0009_onboarding.sql:144-203`
- **Rules:**
  - Signed in: same header; «اسمك الكامل» (required, maxLength 120) appears only if the account has no `profiles.full_name`; button «قبول الدعوة» (pending «جارٍ القبول…»).
  - The token hash must match, `status = pending`, not expired, and the invitation email must equal the signed-in email (case-insensitive). A profile is inserted or kept (a blank name defaults to the email's local part); the membership is inserted (an existing one is a no-op); the invitation becomes `accepted`.
  - Success: `active_org` cookie = the invited org → `/admin`.
- **Acceptance criteria:**
  - **AC-INV-04.1** — *Given* an invitation to `new@x.com` and that account signed in with no profile, *when* it enters a name and presses «قبول الدعوة», *then* it lands on `/admin` of the inviting org with the invited role's badge.
  - **AC-INV-04.2** — *Given* the signed-in account is already a member of that org, *when* it accepts, *then* no error is shown and it lands on `/admin` with that org active.
  - **AC-INV-04.3** — *Given* the same link used again after acceptance, *when* it opens, *then* «الدعوة غير صالحة» is shown.

#### REQ-INV-05 — Invitation acceptance errors
- **Routes:** `/invite/[token]`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/invite/[token]/actions.ts`
- **Rules:** expired → «انتهت صلاحية هذه الدعوة، اطلب دعوة جديدة» (and the row becomes `expired` at that moment); wrong email, revoked or bad token → «الدعوة غير صالحة لهذا الحساب — تأكد أنك دخلت بالبريد المدعوّ»; other → «تعذّر قبول الدعوة، حاول مرة أخرى». The page has no sign-out link.
- **Acceptance criteria:**
  - **AC-INV-05.1** — [NEG] *Given* an invitation to `a@x.com`, *when* `b@x.com` is signed in and presses «قبول الدعوة», *then* «الدعوة غير صالحة لهذا الحساب — تأكد أنك دخلت بالبريد المدعوّ» is shown and no membership is created.
  - **AC-INV-05.2** — [NEG] *Given* an invitation that expires between page load and submit, *when* «قبول الدعوة» is pressed, *then* «انتهت صلاحية هذه الدعوة، اطلب دعوة جديدة» is shown.

### F-ROLE-01 — Roles, workspace gate and organization switcher (P0)

#### REQ-ROLE-01 — Workspace gate
- **Routes:** `/admin/*`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/lib/auth.ts:48,73-74,89-101,144-158`; `srp/lib/supabase/proxy.ts:73-74`
- **Rules:**
  - Signed out → `/login` (proxy and `requireMembership()`).
  - Signed in without a membership in a non-deleted org, **or without a `public.profiles` row**, → `/onboarding`.
  - Org `status` is not checked: members of a `suspended`, `past_due` or `cancelled` org keep the full workspace.
  - Missing Supabase env → every `/admin` route redirects to `/login`.
- **Acceptance criteria:**
  - **AC-ROLE-01.1** — [PERM][NEG] *Given* `seeker@example.com` with a finished seeker profile, *when* `/admin` opens, *then* they end on `/me` (via `/onboarding`).
  - **AC-ROLE-01.2** — *Given* the owner of an org set to `suspended`, *when* `/admin` opens, *then* the workspace loads normally.
  - **AC-ROLE-01.3** — [NEG] *Given* a membership whose only org is soft-deleted, *when* `/admin` opens, *then* the user is sent to `/onboarding` (see OQ-12 for a possible loop).

#### REQ-ROLE-02 — Role labels
- **Routes:** `/admin` sidebar; settings team table; invitation page
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/lib/i18n/ar.ts:1290-1295`; `srp/app/(dashboard)/admin/layout.tsx`
- **Rules:** owner «المالك», admin «مدير», hr «موارد بشرية», viewer «مطّلع». The sidebar footer shows the user's full name, the role badge and «تسجيل الخروج».
- **Acceptance criteria:**
  - **AC-ROLE-02.1** — *Given* `admin@example.com`, *when* `/admin` loads, *then* the sidebar shows «أحمد المدير» and the badge «المالك».
  - **AC-ROLE-02.2** — *Given* `hr@example.com`, *when* `/admin` loads, *then* the badge reads «موارد بشرية».

#### REQ-ROLE-03 — Organization switcher and active org
- **Routes:** `/admin` sidebar
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/org-switcher.tsx:27-34`; `srp/app/(dashboard)/admin/org-actions.ts`; `srp/lib/org-cookie.ts`
- **Rules:**
  - One membership → a plain label. Two or more → a dropdown headed «مؤسساتك», each org with its role label and a check mark on the current one.
  - Switching validates that the target is one of the user's memberships, sets the `active_org` cookie (httpOnly, SameSite Lax, Secure in production, 1 year) and redirects to `/admin`.
  - A tampered or unknown cookie falls back to the user's **earliest** membership; reach is never widened.
  - A job, application or bank of the user's *other* org shows the 404 page until they switch.
- **Acceptance criteria:**
  - **AC-ROLE-03.1** — *Given* a user who is hr in Org A and viewer in Org B, *when* they open the switcher, *then* «مؤسساتك» lists both orgs with «موارد بشرية» and «مطّلع».
  - **AC-ROLE-03.2** — *Given* that user active in Org A, *when* they open an Org B application URL, *then* the 404 page is shown; after switching to Org B the same URL renders.
  - **AC-ROLE-03.3** — [PERM][NEG] *Given* a crafted switch request naming an org the user does not belong to, *when* posted, *then* they are redirected to `/admin` and the cookie is unchanged.
  - **AC-ROLE-03.4** — [PERM][NEG] *Given* the `active_org` cookie set by hand to another tenant's org id, *when* `/admin` loads, *then* the user's earliest membership is active and no data of the other tenant is visible.

#### REQ-ROLE-04 — Viewer is read-only everywhere
- **Routes:** `/admin/*`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/jobs/actions.ts`; `srp/app/(dashboard)/admin/applications/actions.ts:16-30`; `srp/app/(dashboard)/admin/interviews/actions.ts:21-31,90-91`
- **Rules:**
  - Job write buttons are shown to a viewer, but a viewer's submit redirects to `/admin/jobs?error=forbidden` with «صلاحيتك في هذه المؤسسة للاطّلاع فقط».
  - Status change, notes, interview record and re-run controls are shown, but a viewer's submit **silently redirects to `/admin`**; the RPC raises `forbidden`.
  - Interview bank and panel write controls are hidden; a crafted call returns «صلاحيتك في هذه المنشأة للاطلاع فقط.» (note the different wording).
  - The settings nav item is hidden; `/admin/settings` redirects to `/admin`.
- **Acceptance criteria:**
  - **AC-ROLE-04.1** — [PERM][NEG] *Given* a viewer, *when* they submit the new-job form, *then* `/admin/jobs?error=forbidden` shows «صلاحيتك في هذه المؤسسة للاطّلاع فقط» and no job is created.
  - **AC-ROLE-04.2** — [PERM][NEG] *Given* a viewer on an application page, *when* they press «تحديث الحالة», *then* they are redirected to `/admin` and the status is unchanged.
  - **AC-ROLE-04.3** — [PERM] *Given* a viewer on the interview bank page, *when* it loads, *then* no write button is shown and «صلاحيتك في هذه المنشأة للاطلاع فقط.» is shown.
  - **AC-ROLE-04.4** — [DB][PERM][NEG] *Given* a viewer session, *when* it updates any column of `applications`, *then* 0 rows change.

#### REQ-ROLE-05 — Settings restricted to owner and admin
- **Routes:** `/admin/settings`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/lib/auth.ts:154-158`; `srp/app/(dashboard)/admin/layout.tsx:37-66`
- **Rules:** the «الإعدادات» sidebar item appears for owner and admin only; hr and viewer opening `/admin/settings` are silently redirected to `/admin`.
- **Acceptance criteria:**
  - **AC-ROLE-05.1** — [PERM][NEG] *Given* the hr user, *when* `/admin/settings` opens, *then* they land on `/admin` and the sidebar has no «الإعدادات».
  - **AC-ROLE-05.2** — *Given* the owner, *when* the sidebar renders, *then* «الإعدادات» is present and opens the settings page.

#### REQ-ROLE-06 — Owner rules
- **Routes:** `/admin/settings` (team table, invitations, manual creation); table `memberships`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/supabase/migrations/0006_multitenancy.sql:407-443,579-606`
- **Rules:**
  - Only an owner may grant the owner role, invite an owner, or change an owner's row. An admin choosing owner gets «المالك وحده يستطيع تعيين مالك آخر».
  - Nobody can change their own role (own row shows a badge plus «(أنت)»; a crafted call returns «تعذّر تحديث الدور»).
  - A trigger forbids leaving an org without an owner (SQLSTATE 23514). There is no remove-member button in the UI.
- **Acceptance criteria:**
  - **AC-ROLE-06.1** — [PERM][NEG] *Given* an admin, *when* they set another member's role to owner, *then* «المالك وحده يستطيع تعيين مالك آخر» is shown and the role is unchanged.
  - **AC-ROLE-06.2** — [PERM][KD-09] *Given* an admin, *when* they change the owner's role, *then* the change is refused with a message. (Observed in code: RLS filters the row, 0 rows change, and the UI shows the success check; the select keeps the new value until reload.)
  - **AC-ROLE-06.3** — [DB][NEG] *Given* an org with a single owner, *when* that owner's membership is demoted or deleted by SQL as the owner, *then* the statement fails with 23514.
  - **AC-ROLE-06.4** — *Given* the owner, *when* they grant owner to an admin, *then* the change succeeds and the team table shows «المالك» for both.

### 5.5 Seeker portal (P1 milestone, D26–D28)

### F-SONB-01 — Seeker onboarding shell and gates (P0)

#### REQ-SONB-01 — Onboarding shell and step indicator
- **Routes:** `/onboarding/seeker`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/onboarding/seeker/page.tsx:44-134,228-259`; `srp/components/seeker/onboarding/step-indicator.tsx`
- **Rules:**
  - Signed out → `/login?next=/onboarding/seeker`. Step `done` → `/me`. Company staff with no seeker profile may use the page to add a seeker hat.
  - Header: brand mark → `/`, button «تسجيل الخروج». H1 «أنشئ ملفك المهني»; subtitle «أربع خطوات قصيرة تبدأ بسيرتك الذاتية، ثم تتقدّم للوظائف دون رفعها من جديد.»; metadata title «أنشئ ملفك المهني».
  - Step indicator in a nav labelled «خطوات إنشاء الملف»: «السيرة الذاتية» · «بيانات التواصل» · «المراجعة» · «الموافقات»; screen-reader text `الخطوة {current} من {total}` and «(مكتملة)» on finished steps.
  - The page renders the stored `talent.profiles.onboarding_step`, so a refresh, a second device or a later visit resumes at the same step. The step never goes backwards.
- **Acceptance criteria:**
  - **AC-SONB-01.1** — *Given* `seeker@example.com` signed in, *when* `/onboarding/seeker` opens, *then* the H1 «أنشئ ملفك المهني» and the four steps are shown, with step 1 current.
  - **AC-SONB-01.2** — *Given* a seeker at step `review`, *when* they sign in on another browser and open `/onboarding/seeker`, *then* the review step is shown and steps 1–2 carry «(مكتملة)» for screen readers.
  - **AC-SONB-01.3** — [NEG] *Given* a signed-out visitor, *when* `/onboarding/seeker` opens, *then* they land on `/login?next=/onboarding/seeker`.
  - **AC-SONB-01.4** — *Given* a seeker at step `done`, *when* `/onboarding/seeker` opens, *then* they land on `/me`.

#### REQ-SONB-02 — Email must be confirmed before any CV is read
- **Routes:** `/onboarding/seeker`; Edge `talent-upload`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/app/onboarding/seeker/page.tsx:52-66`; `srp/supabase/functions/talent-upload/index.ts`
- **Rules:** when `email_confirmed_at` is null the page shows «أكّد بريدك أولاً» / «أرسلنا رابط تأكيد إلى بريدك. افتحه ثم عُد إلى هنا — لا نقرأ أي سيرة قبل تأكيد البريد.» `talent-upload` independently refuses an unconfirmed address with 403 `email_unverified` (UI «أكّد بريدك الإلكتروني أولاً، ثم ارفع سيرتك.»).
- **Acceptance criteria:**
  - **AC-SONB-02.1** — [NEG] *Given* a signed-in account with an unconfirmed email (project with confirmations allowing a session), *when* `/onboarding/seeker` opens, *then* «أكّد بريدك أولاً» is shown and no upload control is present.
  - **AC-SONB-02.2** — [API][NEG] *Given* an unconfirmed user's token, *when* it posts a CV to `talent-upload`, *then* the reply is 403 `email_unverified`.

### F-SONB-02 — Step 1: CV upload (P0)

#### REQ-SONB-03 — Upload screen and client checks
- **Routes:** `/onboarding/seeker` (step `cv`)
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/onboarding/upload-step.tsx:22-33`
- **Rules:**
  - Heading «ارفع سيرتك الذاتية» / «نبدأ قراءتها فور الرفع، وتكمل أنت بيانات تواصلك في أثناء ذلك.» Drop zone «اسحب سيرتك وأفلتها هنا», then «أو اختر ملفاً من جهازك», hint «PDF أو DOCX، بحجم أقصاه 4 ميجابايت», limit line «حتى 3 رفعات في اليوم. رفع الملف نفسه مرة أخرى لا يعيد قراءته.»
  - After choosing: «الملف المختار:» + file name + size (`{size} ميجابايت` or `{size} كيلوبايت`). Button «ارفع وتابع» (pending «جارٍ الرفع…»), disabled until a valid file is chosen. Drag-and-drop puts the file into the real input.
  - Client checks in order: type not PDF/DOCX → «الملف يجب أن يكون PDF أو DOCX.» (an empty or `application/octet-stream` type is accepted when the name ends in `.pdf` or `.docx`); size > 4 MiB → «حجم الملف يتجاوز 4 ميجابايت.»; size 0 → «أرفق سيرتك الذاتية.»
- **Acceptance criteria:**
  - **AC-SONB-03.1** — *Given* the upload step, *when* `cv-en-accountant.pdf` is chosen, *then* «الملف المختار:» shows its name and size, and «ارفع وتابع» becomes enabled.
  - **AC-SONB-03.2** — [NEG] *Given* a PNG, *when* chosen, *then* «الملف يجب أن يكون PDF أو DOCX.» is shown and the button stays disabled.
  - **AC-SONB-03.3** — [NEG] *Given* a 4,194,305-byte PDF, *when* chosen, *then* «حجم الملف يتجاوز 4 ميجابايت.» is shown.
  - **AC-SONB-03.4** — *Given* a `.docx` file with an empty MIME type, *when* chosen, *then* it is accepted.
  - **AC-SONB-03.5** — *Given* a file dragged onto «اسحب سيرتك وأفلتها هنا», *when* dropped, *then* it is selected as if chosen with the picker.

#### REQ-SONB-04 — Upload server results
- **Routes:** Edge `talent-upload`
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/lib/seeker-actions.ts:150-233`; `srp/supabase/functions/talent-upload/index.ts`
- **Rules:**
  - Every function reply carries `request_id` (10-hex trace id).
  - Function checks: non-POST 405; no bearer 401 `auth_required`; auth outage 500 `server_error` (step `auth`); unconfirmed 403 `email_unverified`; missing/empty file 400 `invalid_input` `field:"cv"`; over 5 MiB `field:"cv_size"` (size is checked **before** type); type not allowed or bytes not matching `field:"cv_type"`; schema or bucket missing 500 `not_configured`.
  - UI mapping: `auth_required` «انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.»; `email_unverified` «أكّد بريدك الإلكتروني أولاً، ثم ارفع سيرتك.»; `rate_limited` «بلغت حد الرفع اليومي. حاول مرة أخرى غداً.»; `cv_type` «الملف يجب أن يكون PDF أو DOCX.»; `cv_size` «حجم الملف يتجاوز 4 ميجابايت.»; other `invalid_input` «أرفق سيرتك الذاتية.»; anything else «تعذّر رفع السيرة. حاول مرة أخرى. رمز المرجع: {request_id}»; network error or non-JSON «تعذّر رفع السيرة. حاول مرة أخرى.» (no reference).
  - Typed values are kept after a refusal.
- **Acceptance criteria:**
  - **AC-SONB-04.1** — [API][NEG] *Given* a `.exe` renamed `.pdf` with a PDF MIME label, *when* posted, *then* the reply is 400 `invalid_input` with `field:"cv_type"`.
  - **AC-SONB-04.2** — [API][NEG] *Given* a 6 MB file of the wrong type, *when* posted, *then* the reply names `field:"cv_size"` (size before type).
  - **AC-SONB-04.3** — [API][NEG] *Given* no Authorization header, *when* posted, *then* the reply is 401 `auth_required` with a `request_id`.
  - **AC-SONB-04.4** — [STATE] *Given* the `talent` schema not exposed, *when* a seeker uploads, *then* «تعذّر رفع السيرة. حاول مرة أخرى. رمز المرجع: {id}» is shown with a 10-hex reference.

#### REQ-SONB-05 — Upload limit: 3 per account per rolling 24 hours
- **Routes:** Edge `talent-upload`; RPC `talent_record_upload_attempt` (service role)
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/migrations/0017_talent_platform.sql:201-229`; `srp/supabase/functions/talent-upload/index.ts:197-201`
- **Rules:** both throttle keys are derived from the account id; limits are 10 per day on one slot and 3 per day on the other, so effectively **3 per account per rolling 24 h**. The attempt is recorded after it passes validation and **before** the same-file check, so an "unchanged" re-upload still counts. Refused attempts are not recorded. Over the limit → 429 `rate_limited`, UI «بلغت حد الرفع اليومي. حاول مرة أخرى غداً.»
- **Acceptance criteria:**
  - **AC-SONB-05.1** — [NEG] *Given* 3 successful uploads by one account within 24 h (including re-uploads of the same file), *when* a 4th is attempted, *then* «بلغت حد الرفع اليومي. حاول مرة أخرى غداً.» is shown.
  - **AC-SONB-05.2** — [API] *Given* an upload refused as `cv_type`, *when* the counter is checked, *then* it did not count.

#### REQ-SONB-06 — Same-file re-upload and version creation
- **Routes:** Edge `talent-upload`
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/functions/talent-upload/index.ts`
- **Rules:**
  - First upload creates `talent.profiles` (status `draft`, step `cv`, `email_verified_at` = now, a 32-hex `public_token`); a creation race reuses the row.
  - If the SHA-256 equals the **newest** version's hash and that version is not failed and not stale (pending/processing for more than 10 minutes) → 200 `{ok, version_id, unchanged:true}`, no new analysis; if the step was still `cv` it moves to `contact`. UI info «هذا الملف نفسه رُفع من قبل، فلم نُعِد قراءته.»
  - Otherwise the file is stored at `talent-cvs/{profile_id}/{version_id}.{ext}`, a `cv_versions` row is inserted (`pending`), the profile's `analysis_status` becomes `pending`, the step moves `cv` → `contact`, and `talent-analyze` starts in the background.
  - Only the 3 newest versions are kept, but the newest `done` version is never pruned.
- **Acceptance criteria:**
  - **AC-SONB-06.1** — *Given* a valid PDF, *when* «ارفع وتابع» is pressed, *then* the page re-renders at the «بيانات التواصل» step.
  - **AC-SONB-06.2** — *Given* the same file uploaded again while its analysis is still in flight (under 10 minutes), *when* it is uploaded, *then* the reply is `unchanged:true` and no new version is created.
  - **AC-SONB-06.3** — *Given* the same file after its analysis failed, *when* it is uploaded, *then* a new version is created and analysed.
  - **AC-SONB-06.4** — [DB] *Given* four uploads of different files over several days where only the first analysis succeeded, *when* versions are listed, *then* at most 3 remain and the first (`done`) version is among them.
  - **AC-SONB-06.5** — [API] *Given* two simultaneous first uploads by a new account, *when* both finish, *then* exactly one `talent.profiles` row exists for that user.

### F-SONB-03 — Step 2: contact details (P0)

#### REQ-SONB-07 — Contact form and its validation
- **Routes:** `/onboarding/seeker` (step `contact`); RPC `talent_save_my_contact`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/components/seeker/onboarding/contact-step.tsx`; `srp/supabase/migrations/0020_seeker_accounts.sql:363-433`; `srp/lib/seeker-actions.ts:86-115`
- **Rules:**
  - Heading «بيانات التواصل» / «تُملأ في أثناء قراءة سيرتك. الجوال مطلوب للتقديم، ولا يظهر على أي صفحة عامة.»
  - Fields: «الاسم الكامل» (required, 2–120; prefilled from the profile, else the Google name); «رقم الجوال» (required, `type=tel`, maxLength 20, LTR; hint «لا يصل إلى أي شركة إلا حين تتقدّم إليها وتوافق على المشاركة.»); «المدينة» (maxLength 120); checkboxes «نوع العمل المفضّل» (hint «اختياري — اختر كل ما يناسبك.»): دوام كامل / دوام جزئي / عقد / عن بُعد / تدريب; radio «هل أنت مستعد للانتقال إلى مدينة أخرى؟»: «نعم» / «لا» / «لم أحدّد». Button «حفظ ومتابعة» (pending «جارٍ الحفظ…»).
  - Database messages: name «الاسم بين حرفين و120 حرفاً.»; phone (`^\+?[0-9\s()-]{7,20}$`) «أدخل رقم جوال صحيحاً.»; city > 120 «اسم المدينة طويل جداً.»; unknown work type or non-boolean relocate «اختر من أنواع العمل المعروضة فقط.». Any field error also shows «يرجى التحقق من الحقول المدخلة.». No profile → «لم نعثر على ملفك. ارفع سيرتك أولاً.». RPC error → «تعذّر الحفظ. حاول مرة أخرى.»
  - At most 10 distinct work types are sent. The step can be saved whatever the analysis state. On success the step moves `contact` → `review`.
- **Acceptance criteria:**
  - **AC-SONB-07.1** — *Given* a valid name and phone `+966 50 123 4567`, *when* «حفظ ومتابعة» is pressed, *then* the review step is shown (or its analysis-pending state).
  - **AC-SONB-07.2** — [NEG] *Given* phone `123456`, *when* saved, *then* «أدخل رقم جوال صحيحاً.» and «يرجى التحقق من الحقول المدخلة.» are shown.
  - **AC-SONB-07.3** — [NEG] *Given* a 121-character name, *when* saved by a crafted request, *then* «الاسم بين حرفين و120 حرفاً.» is shown.
  - **AC-SONB-07.4** — [NEG] *Given* a crafted work type `freelance`, *when* saved, *then* «اختر من أنواع العمل المعروضة فقط.» is shown.
  - **AC-SONB-07.5** — *Given* the analysis still running, *when* the contact form is saved, *then* the save succeeds.

#### REQ-SONB-08 — Live analysis chip on the contact step
- **Routes:** `/onboarding/seeker` (step `contact`)
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/onboarding/analysis-chip.tsx`; `analysis-watcher.tsx`
- **Rules:** chip text: pending or processing «نقرأ سيرتك الآن…» (spinner); done «اكتملت قراءة سيرتك»; failed «تعذّرت قراءة سيرتك — ستتمكن من رفع نسخة أخرى في الخطوة التالية». While running, the page refreshes every 3 s, skips polls while the tab is hidden, and after 60 polls stops with «تستغرق القراءة وقتاً أطول من المعتاد. حدّث الصفحة بعد قليل.»
- **Acceptance criteria:**
  - **AC-SONB-08.1** — [STATE] *Given* a fresh upload, *when* the contact step shows, *then* the chip reads «نقرأ سيرتك الآن…» and changes to «اكتملت قراءة سيرتك» without a manual reload once the analysis finishes.
  - **AC-SONB-08.2** — [STATE] *Given* `GEMINI_API_KEY` unset, *when* the analysis fails, *then* the chip reads «تعذّرت قراءة سيرتك — ستتمكن من رفع نسخة أخرى في الخطوة التالية».
  - **AC-SONB-08.3** — [STATE] *Given* an analysis that never finishes, *when* 60 polls (about 3 minutes) pass, *then* «تستغرق القراءة وقتاً أطول من المعتاد. حدّث الصفحة بعد قليل.» is shown and polling stops.

### F-SONB-04 — Step 3: review what was extracted (P0)

#### REQ-SONB-09 — Review step analysis states
- **Routes:** `/onboarding/seeker` (step `review`)
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/onboarding/seeker/page.tsx:149-217`; `srp/lib/seeker.ts:145-159`; `srp/supabase/functions/talent-analyze/index.ts:177-248,476-480`
- **Rules:**

  | State | Shown |
  |---|---|
  | pending / processing, not stale | spinner «نقرأ سيرتك الآن…» / «تستغرق القراءة عادةً أقل من دقيقة، وتظهر النتيجة هنا تلقائياً.»; polling every 3 s up to 60 times |
  | stale (newest version in flight for more than 10 minutes) | «تعذّرت قراءة سيرتك» + «تعثّرت القراءة لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل.» + re-upload control (no reference) |
  | failed, file side | «تعذّرت قراءة سيرتك» + «قد يكون الملف ممسوحاً ضوئياً أو غير مقروء. ارفع نسخة أوضح لنعيد المحاولة.» + `رمز المرجع: {trace}/{step}` + re-upload |
  | failed, our side | «تعذّرت قراءة سيرتك» + «تعثّرت القراءة لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل.» + reference + re-upload |
  | done | the review form (REQ-SONB-10) |

  - The stored error looks like `[{10-hex trace}/{step}] {message}`; only the bracket part is shown. File side = step `extract_text` or `parse_model_response` (which includes "not a CV", `is_cv = false`). Our side = `cv_download`, `configuration` (no `GEMINI_API_KEY`), `model_call`, `taxonomy_lookup`, `save_profile`, `save_skills`, `save_version`. No error or no bracket → file-side text.
- **Acceptance criteria:**
  - **AC-SONB-09.1** — [STATE] *Given* a non-CV PDF (e.g. an invoice), *when* its analysis ends, *then* the review step shows «قد يكون الملف ممسوحاً ضوئياً أو غير مقروء. ارفع نسخة أوضح لنعيد المحاولة.» with a reference ending in `/parse_model_response`.
  - **AC-SONB-09.2** — [STATE] *Given* `GEMINI_API_KEY` unset, *when* the analysis fails, *then* the review step shows «تعثّرت القراءة لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل.» with a reference ending in `/configuration`.
  - **AC-SONB-09.3** — [STATE] *Given* a ZIP renamed `.docx`, *when* its analysis ends, *then* the file-side text is shown with step `extract_text`.
  - **AC-SONB-09.4** — [STATE] *Given* the newest version stuck in `processing` for more than 10 minutes, *when* the review step loads, *then* the stale warning and a re-upload control are shown, and re-uploading the same file is accepted.

#### REQ-SONB-10 — Review form: facts are editable, skills can only be hidden
- **Routes:** `/onboarding/seeker` (step `review`); RPC `talent_save_my_review`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/components/seeker/onboarding/review-step.tsx`; `srp/supabase/migrations/0020_seeker_accounts.sql:441-517`
- **Rules:**
  - Heading «راجع ما استخرجناه» / «معلوماتك أنت قابلة للتعديل بحرّية. أما قراءتنا لسيرتك فيمكنك إخفاء ما لا تراه دقيقاً منها دون إضافة — وهذا ما يجعلها موثوقة عند الشركات.»
  - Facts «معلوماتك» / «هذه معلوماتك أنت — عدّلها بحرّية.»: «الاسم الكامل» (2–120), «المسمى المهني» (≤ 160), «المدينة» (≤ 120), «سنوات الخبرة» (0–60, step 0.1), «نبذة قصيرة» (≤ 300, live counter `{n}/300`, hint «300 حرف كحد أقصى.»).
  - Analysis «قراءتنا لسيرتك» / «اضغط على أي مهارة لإخفائها، واضغط مرة أخرى لإظهارها. لا يمكن إضافة مهارات.»: «المهارات» toggle buttons (`aria-pressed`, struck through when hidden; none → «لم نستخلص مهارات من سيرتك.»); «مجالات التركيز» badges and «نقاط القوة» list, read-only. Button «حفظ ومتابعة».
  - Database messages: not ready (no `done` analysis) «لم تكتمل قراءة سيرتك بعد. انتظر قليلاً ثم أعد المحاولة.»; name «الاسم بين حرفين و120 حرفاً.»; headline «المسمى المهني طويل جداً (160 حرفاً كحد أقصى).»; city «اسم المدينة طويل جداً.»; years «سنوات الخبرة رقم بين 0 و60.» (also for a non-number); about «النبذة 300 حرف كحد أقصى.»
  - `hidden_skills` is filtered to the profile's own skill ids; anything else is dropped silently (at most 200 values sent). On success the step moves `review` → `consents`.
  - The analysis fills name, headline, city and years **only where the column is still empty**, so values the person typed are never overwritten.
- **Acceptance criteria:**
  - **AC-SONB-10.1** — *Given* a done analysis with skills, *when* a skill button is pressed, *then* it shows as hidden (`aria-pressed` changes, struck through); pressed again, it shows again.
  - **AC-SONB-10.2** — [NEG] *Given* years `60.1`, `-1` or `abc`, *when* saved, *then* «سنوات الخبرة رقم بين 0 و60.» is shown.
  - **AC-SONB-10.3** — [NEG] *Given* an «نبذة قصيرة» of 301 characters (crafted), *when* saved, *then* «النبذة 300 حرف كحد أقصى.» is shown.
  - **AC-SONB-10.4** — [NEG][API] *Given* a crafted `hidden_skills` value that is not one of the profile's skills, *when* saved, *then* the save succeeds and the profile's skills are unchanged (no skill is added).
  - **AC-SONB-10.5** — *Given* the name typed in the contact step before the analysis finished, *when* the review form shows, *then* the typed name is kept, not the one extracted from the CV.
  - **AC-SONB-10.6** — [NEG] *Given* the analysis not yet done, *when* a crafted review save is sent, *then* «لم تكتمل قراءة سيرتك بعد. انتظر قليلاً ثم أعد المحاولة.» is returned.

### F-SONB-05 — Step 4: consents (P0)

#### REQ-SONB-11 — Two separate, optional consents
- **Routes:** `/onboarding/seeker` (step `consents`); RPC `talent_set_my_consents`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/components/seeker/onboarding/consents-step.tsx`; `srp/supabase/migrations/0020_seeker_accounts.sql:332-334,527-579`
- **Rules:**
  - «الموافقات» / «كلتاهما اختيارية ومنفصلة عن الأخرى، ويمكنك تغييرهما في أي وقت من الإعدادات.»
  - Checkbox «صفحة مهنية عامة برابط فريد» (hint «تعرض خبراتك ومهاراتك ونقاط قوتك فقط. بريدك وجوالك لا يظهران عليها أبداً.»); the nested «إخفاء صفحتي عن محركات البحث» appears only while the public box is ticked.
  - Checkbox «أن تراني الشركات في «مرشحون مقترحون» وتدعوني للتقديم» (hint «تظهر للشركات بطاقة بلا اسم ولا وسيلة تواصل، ولا تُكشف بياناتك إلا حين تتقدّم بنفسك.»). Nothing reads this consent yet (P2).
  - Button «إنهاء والانتقال إلى لوحتي».
  - New profiles start with both unticked; a linked legacy profile keeps its choices. Both unticked is valid; unticked always means "no". `noindex` is saved as false when the public box is unticked. Public consent without a done analysis → «لم تكتمل قراءة سيرتك بعد. انتظر قليلاً ثم أعد المحاولة.»
  - Effects: a consent keeps its first timestamp while it stands and is cleared on withdrawal; public consent sets status `published`; the step moves `consents` → `done`; redirect to `/me`.
- **Acceptance criteria:**
  - **AC-SONB-11.1** — *Given* both boxes unticked, *when* «إنهاء والانتقال إلى لوحتي» is pressed, *then* the seeker lands on `/me` and no public page exists.
  - **AC-SONB-11.2** — *Given* the public box ticked, *when* the step is finished, *then* `/me` shows «صفحتك المهنية العامة منشورة» and `/t/{token}` renders.
  - **AC-SONB-11.3** — *Given* the public box unticked, *when* the step renders, *then* «إخفاء صفحتي عن محركات البحث» is not shown.
  - **AC-SONB-11.4** — [NEG] *Given* no completed analysis and a crafted public-consent request, *when* sent, *then* «لم تكتمل قراءة سيرتك بعد. انتظر قليلاً ثم أعد المحاولة.» is returned and status stays `draft`.

### F-LINK-01 — Linking a legacy accountless profile (P2)

#### REQ-LINK-01 — When linking is offered
- **Routes:** `/onboarding/seeker`
- **Priority:** P2
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/supabase/migrations/0020_seeker_accounts.sql:592-612`; `srp/components/seeker/onboarding/legacy-choice.tsx`
- **Rules:**
  - Offered only when the account's email is confirmed, the account has no profile, and an unlinked (`user_id` null), verified legacy profile has the same email (case-insensitive). Otherwise the upload step is shown.
  - Screen: «وجدنا ملفاً مرتبطاً ببريدك، هل تربطه بحسابك؟» / «أنشأت سابقاً صفحة مهنية بهذا البريد دون حساب. ربطها ينقل سيرتك وما استخرجناه منها إلى حسابك، ويبقى رابط صفحتك العامة كما هو.»; buttons «أرسل رابط الربط إلى بريدي» (pending «جارٍ الإرسال…») and «ابدأ ملفاً جديداً» with hint «يبقى الملف القديم منفصلاً كما هو.»
  - «ابدأ ملفاً جديداً» only switches to the upload step on the client; the legacy profile is untouched.
- **Acceptance criteria:**
  - **AC-LINK-01.1** — *Given* a verified legacy profile with email `old@x.com` and a new confirmed account `OLD@x.com` with no profile, *when* `/onboarding/seeker` opens, *then* «وجدنا ملفاً مرتبطاً ببريدك، هل تربطه بحسابك؟» is shown.
  - **AC-LINK-01.2** — [NEG] *Given* the legacy profile is not verified, or the account already has a profile, *when* the page opens, *then* the choice is not offered.
  - **AC-LINK-01.3** — *Given* the choice screen, *when* «ابدأ ملفاً جديداً» is pressed, *then* the upload step shows and the legacy profile is unchanged.

#### REQ-LINK-02 — Requesting the link email
- **Routes:** Edge `seeker-account` action `request_link`; email `talent_link`
- **Priority:** P2
- **Test type:** UI e2e; API
- **Source:** `srp/supabase/functions/seeker-account/index.ts:189-225`; `srp/supabase/migrations/0020_seeker_accounts.sql:624-673`; `srp/lib/seeker-actions.ts:349-358`; `srp/supabase/functions/send-email/templates.ts:164-187`
- **Rules:**
  - The token hash, requester and time are recorded **before** the email is sent. The email goes to the **legacy profile's own address**, with link `{SITE_URL}/onboarding/seeker/link/{32-hex token}`, valid 1 hour and only for the requesting account (EM-08).
  - Success screen «أرسلنا رابط الربط إلى بريدك» / «افتح الرسالة من هذا الجهاز وأنت مسجّل الدخول، ثم أكّد الربط. نطلب ذلك لنتأكد أن البريد بريدك فعلاً قبل نقل سيرتك إلى أي حساب. الرابط صالح ساعة واحدة.» with «لم تصلك الرسالة؟ أرسلها مجدداً».
  - Errors: within 2 minutes 429 `too_soon` → «أرسلنا رابطاً قبل قليل. انتظر دقيقتين ثم اطلب رابطاً جديداً إن لم يصلك.»; 409 `not_available` → «لم يعد هذا الملف متاحاً للربط.»; `auth_required` → «انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.»; 502 `email_failed`, 500 `not_configured` (no `SITE_URL`) or other → «تعذّر إرسال رسالة الربط. حاول مرة أخرى بعد قليل. رمز المرجع: {request_id}»; network failure → «تعذّر الحفظ. حاول مرة أخرى.»
- **Acceptance criteria:**
  - **AC-LINK-02.1** — *Given* the choice screen, *when* «أرسل رابط الربط إلى بريدي» is pressed, *then* the success screen is shown and the email `اربط صفحتك المهنية بحسابك` arrives with the button «ربط صفحتي بحسابي».
  - **AC-LINK-02.2** — [NEG] *Given* a link requested less than 2 minutes ago, *when* «لم تصلك الرسالة؟ أرسلها مجدداً» is pressed, *then* «أرسلنا رابطاً قبل قليل. انتظر دقيقتين ثم اطلب رابطاً جديداً إن لم يصلك.» is shown.
  - **AC-LINK-02.3** — [NEG] *Given* `SITE_URL` unset, *when* a link is requested, *then* «تعذّر إرسال رسالة الربط. حاول مرة أخرى بعد قليل. رمز المرجع: {id}» is shown.

#### REQ-LINK-03 — Confirming the link
- **Routes:** `/onboarding/seeker/link/[token]`; RPC `talent_link_legacy_profile`
- **Priority:** P2
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/onboarding/seeker/link/[token]/page.tsx:20-58`; `srp/lib/seeker-actions.ts:363-383`; `srp/supabase/migrations/0020_seeker_accounts.sql:677-761`
- **Rules:**
  - Opening the page changes nothing. Card «اربط صفحتك المهنية بحسابك» / «سيُنقل إلى حسابك ملفك القديم وسيرتك وما استخرجناه منها، ويبقى رابط صفحتك العامة كما هو. بعد الربط تديرها من حسابك.»; button «أكّد الربط» (pending «جارٍ الربط…»); link «العودة إلى ملفي» → `/onboarding/seeker`.
  - A token that is not 32 hex characters shows the invalid text and no button.
  - The link works only if the token hash matches, the requester is the caller, the request is under 1 hour old, the caller's email is confirmed and matches, the caller has no profile, and the legacy profile is verified and unlinked. Any refusal → «هذا الرابط غير صالح أو انتهت صلاحيته، أو أنه أُرسل لحساب آخر. ارجع إلى ملفك واطلب رابطاً جديداً.»; an RPC error → «تعذّر إتمام العملية، حاول مرة أخرى.». Success → `/onboarding/seeker`.
- **Acceptance criteria:**
  - **AC-LINK-03.1** — *Given* a fresh link opened by the requesting account, *when* «أكّد الربط» is pressed, *then* the seeker lands on the contact step (legacy profiles have no phone).
  - **AC-LINK-03.2** — [NEG][PERM] *Given* the link opened in another account's session, *when* «أكّد الربط» is pressed, *then* the invalid-link text is shown.
  - **AC-LINK-03.3** — [NEG] *Given* a link older than 1 hour, or a link already used, *when* confirmed, *then* the invalid-link text is shown.
  - **AC-LINK-03.4** — [NEG] *Given* a signed-out visitor, *when* the link opens, *then* they land on `/login?next=/onboarding/seeker/link/{token}`.

#### REQ-LINK-04 — Effects of linking
- **Routes:** `/t/[token]`, `/talent/review/[token]`, `/talent/manage/[token]`
- **Priority:** P2
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/supabase/migrations/0020_seeker_accounts.sql:677-922`
- **Rules:** `user_id` is set; the step becomes `contact` when the phone is null, else `done`; verify and link tokens are cleared; a pending/processing analysis becomes `failed`; the legacy CV becomes the account's first `cv_version` (`size_bytes` null); the public token is unchanged, so `/t/{token}` keeps working; the legacy token pages stop serving the profile.
- **Acceptance criteria:**
  - **AC-LINK-04.1** — *Given* a published legacy profile just linked, *when* `/t/{token}` opens, *then* it still renders at the same URL.
  - **AC-LINK-04.2** — [NEG] *Given* the linked profile, *when* `/talent/manage/{token}` opens, *then* the 404 page is shown.

### F-SEEK-01 — Seeker portal layout and home `/me` (P1)

#### REQ-SEEK-01 — Portal navigation
- **Routes:** `/me/*`
- **Priority:** P1
- **Test type:** UI e2e; visual
- **Source:** `srp/components/seeker/portal/portal-nav.tsx`; `srp/app/(seeker)/me/layout.tsx:18-24`; `srp/lib/seeker.ts:125-139`
- **Rules:**
  - Nav labelled «بوابة الباحث عن عمل»: «الرئيسية» (`/me`, exact match), «الوظائف», «طلباتي», «ملفي», «الإعدادات»; the active link has `aria-current="page"`.
  - «مساحة الشركة» → `/admin` only with a company hat (outline button from `sm`, and an entry in the mobile menu).
  - Sign-out icon titled «تسجيل الخروج» from md. Below md, a `<details>` menu labelled «القائمة» with the links and sign-out; it closes after navigation.
  - Every `/me` page has a loading skeleton. Signed in with no profile or an unfinished step → `/onboarding/seeker`.
- **Acceptance criteria:**
  - **AC-SEEK-01.1** — *Given* a finished seeker on `/me/applications`, *when* the nav renders, *then* «طلباتي» has `aria-current="page"` and «الرئيسية» does not.
  - **AC-SEEK-01.2** — [PERM] *Given* a seeker with no membership, *when* `/me` renders, *then* «مساحة الشركة» is absent; *given* a two-hat user, *then* it is present and opens `/admin`.
  - **AC-SEEK-01.3** — *Given* a 390 px viewport, *when* the «القائمة» menu is opened and a link chosen, *then* the page navigates and the menu closes.
  - **AC-SEEK-01.4** — [PERM][NEG] *Given* the hr user without a seeker profile, *when* `/me` opens, *then* they land on `/onboarding/seeker`.

#### REQ-SEEK-02 — Home page content and states
- **Routes:** `/me`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/page.tsx`; `srp/components/seeker/portal/analysis-refresher.tsx`
- **Rules:**
  - H1 `مرحباً، {name}` or «مرحباً بك» without a name; subtitle «تابع طلباتك من هنا، وتقدّم للوظائف بملفك المحفوظ دون إعادة رفع السيرة.»
  - No phone → warning «أكمل بيانات التواصل» / «رقم الجوال مطلوب قبل أن تتقدّم لأي وظيفة بملفك.» / link «أكمل ملفك» → `/me/profile` (defensive; the contact step requires a phone).
  - Card «ملفك»: «تعديل الملف» → `/me/profile`; name (or email) and headline; «تحليل السيرة» badge «في انتظار التحليل» / «جارٍ التحليل» / «اكتمل التحليل» / «تعذّر التحليل»; «السيرة الذاتية» with the newest version's date; when published «صفحتك المهنية العامة منشورة» + «فتح الصفحة» (new tab, `/t/{token}`).
  - «آخر طلباتك»: up to 3 rows (title, company · date, status badge); «عرض الكل» → `/me/applications` when total > 0. Empty «لم تتقدّم لأي وظيفة بعد» / «اختر وظيفة وتقدّم بملفك المحفوظ.» + «تصفّح الوظائف». Read error «تعذّر تحميل البيانات».
  - «أحدث الوظائف»: up to 6 cards, «عرض الكل» → `/me/jobs`. Error «تعذّر تحميل البيانات» / «المشكلة مؤقتة وليست عندك — لا يعني هذا أنه لا توجد وظائف. حدّث الصفحة بعد قليل.» Empty «لا توجد وظائف منشورة حالياً» / «تُضاف وظائف جديدة باستمرار، فعُد قريباً.»
  - While the analysis is pending/processing the page refreshes every 4 s with no cap and no stale handling.
  - No recommendations, no "fits you" badges, no interview tasks.
- **Acceptance criteria:**
  - **AC-SEEK-02.1** — *Given* a seeker named «ليلى» with no applications, *when* `/me` opens, *then* the H1 reads `مرحباً، ليلى` and «لم تتقدّم لأي وظيفة بعد» is shown with «تصفّح الوظائف».
  - **AC-SEEK-02.2** — *Given* a seeker with 5 account applications, *when* `/me` opens, *then* «آخر طلباتك» shows 3 rows and «عرض الكل».
  - **AC-SEEK-02.3** — *Given* the seed jobs, *when* `/me` opens, *then* «أحدث الوظائف» shows the two published jobs.
  - **AC-SEEK-02.4** — *Given* a published profile, *when* «فتح الصفحة» is pressed, *then* `/t/{token}` opens in a new tab.

### F-SEEK-02 — Browse jobs `/me/jobs` (P1)

#### REQ-SEEK-03 — Job list, filters and paging
- **Routes:** `/me/jobs`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/data.ts:146-169`; `srp/components/seeker/portal/seeker-jobs-explorer.tsx`; `srp/components/seeker/portal/seeker-job-card.tsx`
- **Rules:**
  - Same source as the marketplace (published, not deleted, listed live orgs; newest 500), flattened and sorted by job date.
  - Header «الوظائف» / «كل الوظائف المنشورة في السوق. افتح التفاصيل، أو تقدّم مباشرة بملفك المحفوظ.»
  - Filters (state only): search «ابحث بالمسمى الوظيفي أو الشركة…» (title, company, department), «الموقع», «نوع الدوام»; count `{n} وظيفة`. 24 per page with «عرض المزيد»; any filter change resets paging.
  - States: no match «لا توجد نتائج مطابقة» / «جرّب تغيير كلمات البحث أو إزالة بعض عوامل التصفية.»; empty «لا توجد وظائف منشورة حالياً» / «عُد قريباً — تُضاف وظائف جديدة باستمرار.»; error «تعذّر تحميل البيانات» pair.
  - Card: company, title, type badge, department, location, `آخر موعد للتقديم: {date}` when set. Action: already applied with the account → success badge «تقدّمت لهذه الوظيفة» → `/me/applications`; else closed (server local date) → «انتهى موعد التقديم لهذه الوظيفة»; else «تقدّم بملفك» → `/me/apply/{id}`. Always «التفاصيل» → `/jobs/{id}`.
  - "Applied" counts **account** applications only; a guest application with the same email shows no badge.
- **Acceptance criteria:**
  - **AC-SEEK-03.1** — *Given* 30 published jobs, *when* `/me/jobs` opens, *then* 24 cards and «عرض المزيد» are shown; pressing it shows the remaining 6.
  - **AC-SEEK-03.2** — *Given* the seeker applied to job J with the account, *when* `/me/jobs` opens, *then* J shows «تقدّمت لهذه الوظيفة» instead of «تقدّم بملفك».
  - **AC-SEEK-03.3** — *Given* the seeker applied to job K as a guest with the same email, *when* `/me/jobs` opens, *then* K still shows «تقدّم بملفك».
  - **AC-SEEK-03.4** — *Given* a past-deadline published job, *when* `/me/jobs` opens, *then* its card shows «انتهى موعد التقديم لهذه الوظيفة» and no apply button.
  - **AC-SEEK-03.5** — *Given* `/me/jobs`, *when* inspected, *then* no score, rank, «مناسبة لك» badge or recommendation reason appears (P2 not built).

### F-SAPPLY-01 — Apply with the stored CV (P0, D27)

#### REQ-SAPPLY-01 — Access to the apply-with-profile page
- **Routes:** `/me/apply/[jobId]`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/apply/[jobId]/page.tsx:45-97`
- **Rules:** signed out → `/login?next=/me/apply/{id}`; no profile or unfinished step → `/onboarding/seeker`; 404 for a non-UUID id, an unpublished or deleted job, an **unlisted** company, or an org not `trial`/`active` or deleted. Header: «تفاصيل الوظيفة» (back to `/jobs/{id}`), company name, job title; subtitle «نرسل إلى الشركة نسخة من سيرتك المحفوظة وبيانات تواصلك بعد موافقتك، دون إعادة رفع.»; metadata title `التقديم بملفك: {job title}`.
- **Acceptance criteria:**
  - **AC-SAPPLY-01.1** — *Given* a finished seeker and seed job `…0001`, *when* `/me/apply/{id}` opens, *then* the header shows «شركة الأفق للتقنية» and «مطوّر واجهات أمامية».
  - **AC-SAPPLY-01.2** — [NEG] *Given* a published job of an unlisted company, *when* `/me/apply/{id}` opens, *then* the 404 page is shown.
  - **AC-SAPPLY-01.3** — [NEG] *Given* a seeker at step `contact`, *when* `/me/apply/{id}` opens, *then* they land on `/onboarding/seeker`.

#### REQ-SAPPLY-02 — Page states (first matching wins)
- **Routes:** `/me/apply/[jobId]`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/apply/[jobId]/page.tsx`
- **Rules:**

  | # | Condition | Shown |
  |---|---|---|
  | 1 | Already applied with the account | «سبق أن تقدّمت لهذه الوظيفة» / «تجد طلبك وحالته في صفحة طلباتي.» / «عرض طلباتي» |
  | 2 | Closed (`closes_at` < server-local today) | «التقديم مغلق» / «انتهى موعد التقديم لهذه الوظيفة» / «تصفّح الوظائف» |
  | 3 | Phone or full name missing | «أكمل بيانات التواصل أولاً» / «تحتاج الشركة إلى رقم جوال للتواصل معك. أضفه إلى ملفك ثم عُد إلى هذه الصفحة.» / «إكمال الملف» |
  | 4 | No CV version with analysis `done` | «لا توجد نسخة سيرة جاهزة» with «نحلّل سيرتك الآن، وتستطيع التقديم بها فور انتهاء التحليل.» (spinner, refresh every 4 s) when a version is in flight, else «ارفع سيرتك وانتظر اكتمال تحليلها، ثم تقدّم بها.»; button «إدارة السيرة» |
  | 5 | Otherwise | the form and the shared-data panel |
- **Acceptance criteria:**
  - **AC-SAPPLY-02.1** — [STATE] *Given* a seeker who already applied to J with the account, *when* `/me/apply/{J}` opens, *then* «سبق أن تقدّمت لهذه الوظيفة» and «عرض طلباتي» are shown and no form.
  - **AC-SAPPLY-02.2** — [STATE] *Given* a past-deadline job, *when* the page opens, *then* «التقديم مغلق» is shown.
  - **AC-SAPPLY-02.3** — [STATE] *Given* the only CV version failed analysis, *when* the page opens, *then* «لا توجد نسخة سيرة جاهزة» and «ارفع سيرتك وانتظر اكتمال تحليلها، ثم تقدّم بها.» are shown.
  - **AC-SAPPLY-02.4** — [STATE] *Given* a version still being analysed and no done version, *when* the page opens, *then* «نحلّل سيرتك الآن، وتستطيع التقديم بها فور انتهاء التحليل.» is shown with a spinner.

#### REQ-SAPPLY-03 — Apply form, per-application consent and shared-data panel
- **Routes:** `/me/apply/[jobId]`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/portal/apply-with-profile-form.tsx`; `srp/app/(seeker)/me/actions.ts:63-162`
- **Rules:**
  - «نسخة السيرة» select: done versions only, labelled `{type} — رُفعت في {date}`, the first with « (الأحدث)»; defaults to the newest done version.
  - Screening questions under «أسئلة من فريق التوظيف» (same types and limits as REQ-APPLY-04); «رسالة مختصرة (اختياري)» (maxLength 2000).
  - Consent checkbox, **unticked and never remembered**: `أوافق على مشاركة سيرتي وبيانات تواصلي مع «{company}» لهذه الوظيفة` with hint «موافقة لهذا الطلب وحده، ولا تُحفظ إذناً دائماً.» It uses `aria-required` (not `required`), so the refusal comes back from the server in Arabic.
  - Button «إرسال الطلب» (pending «جارٍ الإرسال…»).
  - Panel «ما سيصل إلى الشركة» (shown first on mobile): «الاسم الكامل», «البريد الإلكتروني», «رقم الجوال», «نسخة السيرة»: «نسخة من السيرة التي تختارها في النموذج، مع إجاباتك ورسالتك إن كتبتها. تحتفظ الشركة بنسختها وفق سياستها.»; link «تعديل بياناتي» → `/me/profile`.
  - The action sends only `job_id`, `mode=profile`, `cv_version_id`, `consent=on` (if ticked), `cover_note` and `sq_*`; never name, email, phone or a file. Name and phone come from the profile; the email from the verified auth identity.
- **Acceptance criteria:**
  - **AC-SAPPLY-03.1** — *Given* two done versions, *when* the form loads, *then* the select lists both, the first ends with « (الأحدث)» and is selected.
  - **AC-SAPPLY-03.2** — *Given* the form, *when* it loads, *then* the consent box is unticked and names the company in its label.
  - **AC-SAPPLY-03.3** — *Given* a 390 px viewport, *when* the page renders, *then* «ما سيصل إلى الشركة» appears above the form.
  - **AC-SAPPLY-03.4** — *Given* a previous successful application to another job, *when* this form loads, *then* the consent box is still unticked (consent is never remembered).

#### REQ-SAPPLY-04 — Profile-mode submission rules and messages
- **Routes:** Edge `submit-application` (`mode=profile`)
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/functions/submit-application/index.ts:20-30,363-699`; `srp/app/(seeker)/me/actions.ts:139-161`
- **Rules:**
  - Order: auth (401 `auth_required`; 500 on an auth outage; 403 `email_unverified`) → job (404/409 `job_closed`; `listed_publicly` is **not** checked) → profile (missing, or name/phone failing the guest rules → 409 `profile_incomplete`; cover note > 2000 → 400) → CV version (must belong to this profile, be `done`, be PDF/DOCX; absent → newest done; else `cv_version_id: invalid`) → consent (must be `on`, else `consent: required`) → screening (`sq_{id}: required`) → no captcha → throttle (`account:{user id}` 5/hour and 20/day; email 10/day **shared with guest submissions**) → duplicate (guest rows included) → copy CV → insert.
  - UI: `auth_required` → redirect to `/login?next=/me/apply/{id}`; `email_unverified` «أكّد بريدك الإلكتروني أولاً من الرابط الذي أرسلناه إليك، ثم حاول مجدداً.»; `profile_incomplete` «ملفك ينقصه الاسم أو رقم الجوال. أكمله من صفحة ملفي ثم حاول مجدداً.»; `duplicate` «سبق أن تقدّمت لهذه الوظيفة بهذا البريد الإلكتروني، بحسابك أو كضيف.»; `job_closed` «التقديم غير متاح لهذه الوظيفة حالياً.»; `rate_limited` «وصلنا عدد كبير من الطلبات خلال وقت قصير. حاول بعد قليل.»; `invalid_input` form-level «راجع الحقول المشار إليها.» with field messages `consent` «الموافقة على المشاركة مطلوبة لإرسال الطلب.», `cv_version_id` «اختر نسخة سيرة اكتمل تحليلها.», `cover_note` «الرسالة طويلة — 2000 حرف كحد أقصى.», `sq_*` «هذا السؤال إلزامي.»; anything else «تعذّر إتمام العملية، حاول مرة أخرى.». A non-UUID job id → «التقديم غير متاح لهذه الوظيفة حالياً.»
- **Acceptance criteria:**
  - **AC-SAPPLY-04.1** — [NEG] *Given* the consent box unticked, *when* «إرسال الطلب» is pressed, *then* «راجع الحقول المشار إليها.» and «الموافقة على المشاركة مطلوبة لإرسال الطلب.» are shown and nothing is submitted.
  - **AC-SAPPLY-04.2** — [NEG] *Given* an earlier guest application to J with the seeker's email, *when* the seeker applies to J with the profile, *then* «سبق أن تقدّمت لهذه الوظيفة بهذا البريد الإلكتروني، بحسابك أو كضيف.» is shown.
  - **AC-SAPPLY-04.3** — [API][PERM][NEG] *Given* another seeker's `cv_version_id`, *when* submitted, *then* the field error `cv_version_id` is returned and the UI shows «اختر نسخة سيرة اكتمل تحليلها.»
  - **AC-SAPPLY-04.4** — [NEG] *Given* the job closed between render and submit, *when* submitted, *then* «التقديم غير متاح لهذه الوظيفة حالياً.» is shown.
  - **AC-SAPPLY-04.5** — [API][NEG] *Given* no bearer token, *when* posted with `mode=profile`, *then* the reply is 401 `auth_required`.
  - **AC-SAPPLY-04.6** — [API] *Given* an unlisted company's published job, *when* posted directly in profile mode, *then* it is accepted (the function does not check `listed_publicly`; see OQ-13).
  - **AC-SAPPLY-04.7** — [API][NEG] *Given* 10 submissions with one email in a day across guest and profile modes, *when* an 11th profile submission is sent, *then* the reply is 429 and the UI shows «وصلنا عدد كبير من الطلبات خلال وقت قصير. حاول بعد قليل.»

#### REQ-SAPPLY-05 — Success and the company's own CV copy
- **Routes:** `/me/apply/[jobId]`; bucket `cvs`; `/admin/applications/[id]`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(seeker)/me/actions.ts:128-136`; `srp/supabase/functions/submit-application/index.ts`; `srp/app/(dashboard)/admin/applications/[id]/page.tsx:104-110,203-211`
- **Rules:**
  - Success: «أُرسل طلبك» / «وصلت سيرتك إلى الشركة، وتصلك رسالة تأكيد على بريدك. تتابع حالة الطلب من صفحة طلباتي.» / «رمز المتابعة» with an `HKM-XXXXXXXX` code / button «عرض طلباتي». The action does not revalidate, so the success screen stays; a later visit shows "already applied".
  - The CV is copied from `talent-cvs` to `cvs/{org_id}/{application_id}.{ext}` (the company's own copy, D27). The row gets `applicant_user_id` and `via_account = true` (only the service role may set them).
  - The company sees the badge «قدّم عبر حسابه» with tooltip «تقدّم المتقدم من حسابه بملفه المحفوظ. لا يظهر لك من بياناته إلا ما شاركه في هذا الطلب.»
  - The `application_received` email is sent; the analysis starts as for a guest.
- **Acceptance criteria:**
  - **AC-SAPPLY-05.1** — *Given* a valid profile application, *when* submitted, *then* «أُرسل طلبك» and a reference code are shown, and the application appears in `/me/applications`.
  - **AC-SAPPLY-05.2** — [DB] *Given* the stored application, *when* storage is inspected, *then* `cvs/{org_id}/{application_id}.{ext}` exists and is byte-identical to the chosen version.
  - **AC-SAPPLY-05.3** — *Given* HR opens that application, *when* the header renders, *then* the badge «قدّم عبر حسابه» is shown.
  - **AC-SAPPLY-05.4** — [DB][NEG] *Given* an hr session, *when* it updates `applicant_user_id` or `via_account`, *then* the trigger refuses with `applicant_user_id and via_account are set by the platform only`.
  - **AC-SAPPLY-05.5** — *Given* the seeker deletes their seeker data afterwards, *when* HR opens the application, *then* it and its CV remain.

### F-SAPPS-01 — My applications `/me/applications` (P1)

#### REQ-SAPPS-01 — Source, content and privacy
- **Routes:** `/me/applications?page=N`; RPC `my_applications`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(seeker)/me/applications/page.tsx`; `srp/app/(seeker)/me/data.ts:106-124`; `srp/supabase/migrations/0020_seeker_accounts.sql:935-982`
- **Rules:**
  - Only rows with `applicant_user_id = auth.uid()`, newest first: job title, org name and slug, status, `created_at`, `ref_code`, history. Nothing from `ai_evaluations`. Guest applications with the same email are not shown. Applications to later soft-deleted jobs or orgs still appear.
  - Header «طلباتي» / «الطلبات التي قدّمتها بحسابك، بحالاتها وتواريخها.»
  - Card: job title, company, status badge, «تاريخ التقديم», «رمز المتابعة», timeline «سجل الحالة» (label + date-time), always starting with «تم استلام الطلب». Labels as on `/track`; «تم الاعتذار» uses the neutral outline tone.
  - Footer: «الطلبات التي قدّمتها كضيف دون حساب لا تظهر هنا، وتتابعها برمز المتابعة من صفحة» + link «تتبّع طلبك» → `/track`.
- **Acceptance criteria:**
  - **AC-SAPPS-01.1** — *Given* a seeker with one account application moved to «قيد المراجعة», *when* `/me/applications` opens, *then* the card shows «قيد المراجعة», the reference code, and a timeline «تم استلام الطلب» → «قيد المراجعة».
  - **AC-SAPPS-01.2** — [PERM] *Given* the same seeker also applied as a guest with the same email, *when* the page opens, *then* the guest application is not listed.
  - **AC-SAPPS-01.3** — [PERM] *Given* an analysed application, *when* the page opens, *then* no score or AI text appears.

#### REQ-SAPPS-02 — Paging, empty and error states
- **Routes:** `/me/applications?page=N`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/applications/page.tsx`
- **Rules:** 10 per page; invalid or ≤ 0 page → page 1; nav «السابق» / «التالي» / `صفحة {page} من {pages}` only when there is more than one page. Empty (page 1 only): «لا توجد طلبات بعد» / «حين تتقدّم لوظيفة بملفك يظهر طلبك هنا مع كل تحديث لحالته.» + «تصفّح الوظائف». Error: «تعذّر تحميل البيانات» / «سجّلنا الخطأ ونعمل عليه. جرّب تحديث الصفحة أو العودة لاحقاً.» A page beyond the range shows an empty list without the empty state.
- **Acceptance criteria:**
  - **AC-SAPPS-02.1** — *Given* 12 account applications, *when* `/me/applications` opens, *then* 10 cards and `صفحة 1 من 2` are shown; «التالي» shows the other 2.
  - **AC-SAPPS-02.2** — *Given* `?page=0` or `?page=abc`, *when* opened, *then* page 1 is shown.
  - **AC-SAPPS-02.3** — [STATE] *Given* no account applications, *when* the page opens, *then* «لا توجد طلبات بعد» is shown.

### F-SPROF-01 — Seeker profile `/me/profile` (P1)

#### REQ-SPROF-01 — Analysis banners
- **Routes:** `/me/profile`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/profile/page.tsx`
- **Rules:** header «ملفي» / «ما يصل إلى الشركة حين تتقدّم بملفك: بيانات تواصلك، والنسخة التي تختارها من سيرتك.» Pending/processing → info «نحلّل أحدث نسخة من سيرتك الآن. تتحدّث هذه الصفحة تلقائياً عند الانتهاء.» (refresh every 4 s; stale is not checked). Failed → «تعذّر تحليل أحدث نسخة» with «ارفع نسخة أوضح من سيرتك. إن تكرّر الخطأ فأرسل إلينا الرسالة التالية كما هي:» (file side) or «تعثّر التحليل لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل، وإن تكرّر فأرسل إلينا الرسالة التالية كما هي:» (our side), plus the `{trace}/{step}` code.
- **Acceptance criteria:**
  - **AC-SPROF-01.1** — [STATE] *Given* a new version just uploaded, *when* `/me/profile` opens, *then* «نحلّل أحدث نسخة من سيرتك الآن. تتحدّث هذه الصفحة تلقائياً عند الانتهاء.» is shown and disappears once the analysis is done.
  - **AC-SPROF-01.2** — [STATE] *Given* the newest version failed at `configuration`, *when* the page opens, *then* «تعذّر تحليل أحدث نسخة» and the our-side text with the code are shown.

#### REQ-SPROF-02 — Contact form on the profile page
- **Routes:** `/me/profile`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/portal/contact-form.tsx`
- **Rules:** «بيانات التواصل» / «لا تصل إلى أي شركة إلا حين تتقدّم لوظيفتها وتوافق على المشاركة في ذلك الطلب.» Same RPC and rules as REQ-SONB-07; it does not change the onboarding step. Fields «الاسم الكامل», «رقم الجوال», «المدينة»; read-only «البريد الإلكتروني» with hint «بريد حسابك، ويُرسل مع كل طلب كما هو.»; «أنواع العمل المفضّلة»; «الاستعداد للانتقال إلى مدينة أخرى» («نعم» / «لا» / «لم أحدّد»). Button «حفظ» (pending «جارٍ الحفظ…»); success «تم الحفظ».
- **Acceptance criteria:**
  - **AC-SPROF-02.1** — *Given* a valid new phone, *when* «حفظ» is pressed, *then* «تم الحفظ» is shown and the apply panel later shows the new phone.
  - **AC-SPROF-02.2** — [NEG] *Given* phone `abc`, *when* saved, *then* «أدخل رقم جوال صحيحاً.» is shown.

#### REQ-SPROF-03 — Facts form and hide-only skills
- **Routes:** `/me/profile`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/portal/facts-form.tsx`
- **Rules:** «ما استخرجناه من سيرتك» / «الحقائق قابلة للتعديل لأنك أعرف بها. أما التحليل فيمكنك أن تخفي منه، ولا يمكن أن تضيف إليه.» Locked with «يُتاح تعديل هذه البيانات بعد اكتمال تحليل سيرتك.» until an analysis is done. Fields «المسمّى المهني» (160), «سنوات الخبرة» (0–60, step 0.1), «نبذة مختصرة» (300, hint «300 حرف كحد أقصى»). «المهارات» with hint «اضغط على مهارة لإخفائها من ملفك، ثم احفظ. لا تُضاف مهارة لم ترد في سيرتك.»; button titles «إخفاء» / «إظهار»; none → «لم نستخرج مهارات من سيرتك.» Uses `talent_save_my_review` (same messages as REQ-SONB-10); the saved name and city are sent as hidden fields, and if they are invalid the error reads `{form message} — {field message}`. Success «تم الحفظ».
- **Acceptance criteria:**
  - **AC-SPROF-03.1** — [STATE] *Given* no analysis done yet, *when* `/me/profile` opens, *then* the facts form is locked with «يُتاح تعديل هذه البيانات بعد اكتمال تحليل سيرتك.»
  - **AC-SPROF-03.2** — *Given* a skill hidden and saved, *when* `/t/{token}` is opened (published), *then* that skill is not listed.

#### REQ-SPROF-04 — Extracted profile (read-only) and CV versions
- **Routes:** `/me/profile`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/portal/extracted-profile.tsx`; `srp/app/(seeker)/me/profile/page.tsx`
- **Rules:**
  - Read-only: «نقاط القوة», «مجالات التركيز», «الخبرات» (dates LTR; missing start «غير محدد», missing end «حتى الآن»), «التعليم», «اللغات». Skills are the only hideable item anywhere.
  - «السيرة الذاتية» / «نحتفظ بآخر 3 نسخ. الأحدث هي المعتمدة في ملفك، وتختار عند كل تقديم النسخة التي تُرسل.» Each row: type (PDF/DOCX), «الحالية» on the newest, `رُفعت في {date}`, an analysis badge. None → «لا توجد نسخة مرفوعة بعد.». No download, delete or "make current" action.
- **Acceptance criteria:**
  - **AC-SPROF-04.1** — *Given* three uploaded versions, *when* the page opens, *then* three rows are listed and only the newest carries «الحالية».
  - **AC-SPROF-04.2** — *Given* an experience with no end date, *when* rendered, *then* it shows «حتى الآن».

#### REQ-SPROF-05 — Uploading a new CV version from the profile
- **Routes:** `/me/profile`; Edge `talent-upload`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/portal/cv-upload-form.tsx`
- **Rules:** label «رفع نسخة جديدة»; picker «اختر ملفاً» (then «تغيير الملف»); submit «رفع النسخة» (pending «جارٍ الرفع…»), disabled until a valid file is picked; hint «PDF أو DOCX بحجم أقصاه 4 ميجابايت. النسخة الجديدة يُعاد تحليلها، بحد 3 رفعات في اليوم.» Client errors use **different wording** from onboarding: wrong type «صيغة الملف غير مدعومة — أرفق ملف PDF أو DOCX»; over 4 MiB «حجم الملف يتجاوز 4 ميجابايت»; a 0-byte file has no client check and the server answers «أرفق سيرتك الذاتية.» Server errors as REQ-SONB-04. Success «رُفعت النسخة الجديدة ويجري تحليلها الآن.» or for the same file «هذا الملف مطابق لآخر نسخة رفعتها، فلم نُعِد تحليله.»; the input is reset.
- **Acceptance criteria:**
  - **AC-SPROF-05.1** — *Given* a new valid file, *when* «رفع النسخة» is pressed, *then* «رُفعت النسخة الجديدة ويجري تحليلها الآن.» is shown and a new row with «الحالية» appears.
  - **AC-SPROF-05.2** — *Given* the same file as the newest version (in flight or done), *when* uploaded, *then* «هذا الملف مطابق لآخر نسخة رفعتها، فلم نُعِد تحليله.» is shown.
  - **AC-SPROF-05.3** — [NEG] *Given* a PNG, *when* chosen, *then* «صيغة الملف غير مدعومة — أرفق ملف PDF أو DOCX» is shown.

#### REQ-SPROF-06 — Public page panel on the profile
- **Routes:** `/me/profile`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/profile/page.tsx`
- **Rules:** «الصفحة المهنية العامة»: published → «صفحتك منشورة برابط فريد، بلا أي وسيلة تواصل.» + «فتح الصفحة»; not published → «صفحتك العامة غير منشورة.»; always «إدارة الموافقات» → `/me/settings`.
- **Acceptance criteria:**
  - **AC-SPROF-06.1** — *Given* an unpublished profile, *when* the page opens, *then* «صفحتك العامة غير منشورة.» and «إدارة الموافقات» are shown.

### F-SSET-01 — Seeker settings `/me/settings` (P1)

#### REQ-SSET-01 — Account card and consents
- **Routes:** `/me/settings`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(seeker)/me/settings/page.tsx`; `srp/components/seeker/portal/consents-form.tsx`
- **Rules:**
  - Header «الإعدادات» / «موافقاتك، وبيانات حسابك.» Card «الحساب»: «البريد الإلكتروني»; without a company hat also «تمثّل شركة؟ يمكنك إنشاء مساحة لها بالحساب نفسه.» + «إنشاء مساحة شركة» → `/onboarding?as=company`.
  - «الموافقات» / «موافقتان منفصلتان واختياريتان، لا تعني إحداهما الأخرى، ويمكنك سحب أيٍّ منهما متى شئت.»: «صفحة مهنية عامة برابط فريد» (hint «تعرض اسمك ومسمّاك ومهاراتك الظاهرة ونقاط قوتك وخبراتك لمن يملك الرابط، ولا تعرض بريدك ولا جوالك.»); when ticked «إخفاء الصفحة عن محركات البحث» (hint «تبقى الصفحة متاحة لمن يملك الرابط، ولا تظهر في نتائج البحث.»); `أن تراني الشركات في «مرشحون مقترحون» وتدعوني للتقديم` (hint «تُعرض للشركات بطاقة مجهّلة: المهارات والسنوات والمدينة ونقاط القوة، بلا اسم ولا وسيلة تواصل. ولا تصلها بياناتك إلا حين تتقدّم بنفسك.»). Button «حفظ الموافقات» (pending «جارٍ الحفظ…»); success «تم حفظ الموافقات».
  - Without a completed analysis: the public box cannot be newly ticked; Save is disabled while it is ticked; the note «الصفحة العامة تعرض ما استخرجناه من سيرتك، فتُحفظ الموافقة عليها بعد اكتمال تحليل أحدث نسخة. يمكنك سحبها في أي وقت.» appears; withdrawing is never blocked.
- **Acceptance criteria:**
  - **AC-SSET-01.1** — *Given* a published profile, *when* the public box is unticked and saved, *then* «تم حفظ الموافقات» is shown and `/t/{token}` returns the 404 page immediately.
  - **AC-SSET-01.2** — *Given* the same profile, *when* the box is ticked again and saved, *then* `/t/{token}` renders again at the **same** URL.
  - **AC-SSET-01.3** — *Given* «إخفاء الصفحة عن محركات البحث» ticked and saved, *when* `/t/{token}` is fetched, *then* its HTML carries `noindex, nofollow` robots metadata.
  - **AC-SSET-01.4** — [PERM] *Given* a two-hat user, *when* the account card renders, *then* «إنشاء مساحة شركة» is not shown.

#### REQ-SSET-02 — Public link panel
- **Routes:** `/me/settings`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/components/seeker/portal/public-link.tsx`
- **Rules:** only when published: «رابط صفحتك العامة» with the full URL (`NEXT_PUBLIC_SITE_URL` + `/t/{token}`, else the path); «نسخ الرابط» → «تم النسخ» for 2 s (a refused clipboard fails silently); «فتح الصفحة» opens a new tab.
- **Acceptance criteria:**
  - **AC-SSET-02.1** — *Given* a published profile, *when* «نسخ الرابط» is pressed, *then* the clipboard holds the full `/t/{token}` URL and the button reads «تم النسخ».

#### REQ-SSET-03 — Delete seeker data
- **Routes:** `/me/settings`; Edge `seeker-account` action `delete`; RPC `talent_delete_seeker_data` (service role)
- **Priority:** P1
- **Test type:** UI e2e; API; DB-RLS
- **Source:** `srp/components/seeker/portal/delete-seeker-data.tsx`; `srp/supabase/functions/seeker-account/index.ts:93-183`; `srp/supabase/migrations/0020_seeker_accounts.sql:996-1032`
- **Rules:**
  - Section «حذف البيانات»: «حذف بياناتي كباحث» / «يحذف ملفك وكل نسخ سيرتك فوراً وبالكامل. لا يمكن التراجع عن ذلك.» with the destructive button «حذف بياناتي كباحث».
  - Dialog «حذف بياناتك كباحث نهائياً؟» with three points: «يُحذف ملفك وكل نسخ سيرتك من حكيم فوراً وبالكامل، وتتوقف صفحتك العامة إن كانت منشورة.» (the product name comes from `PRODUCT_NAME`); «الطلبات التي أرسلتها تبقى لدى الشركات التي تقدّمت إليها، وتخضع لسياسة الاحتفاظ لدى كل شركة.»; «إن لم يكن لحسابك دور في أي شركة يُحذف حسابك أيضاً، وإن كان له دور يبقى الحساب لمساحة الشركة وحدها.» Buttons «إلغاء» / «احذف بياناتي» (pending «جارٍ الحذف…»); the dialog cannot be closed while pending; failure «تعذّر إتمام العملية، حاول مرة أخرى.» inside the dialog.
  - Effects: applications are unlinked (`applicant_user_id = null`, `via_account` stays true); the profile, versions and skills are deleted; files are removed from `talent-cvs` (failures only logged). The auth account is deleted **unless** it has any membership (soft-deleted orgs included), is a platform admin, or appears in `status_history.changed_by`.
  - `account_deleted: true` → local sign-out, active-org cookie cleared, redirect `/login?notice=account_deleted`. `false` → redirect to `homePath()` (`/admin` with a live company hat, else `/onboarding`).
  - Submitted applications and the companies' CV copies remain. An unlinked legacy profile with the same email is **not** deleted (documented, not fixed).
- **Acceptance criteria:**
  - **AC-SSET-03.1** — *Given* a seeker with no company role, *when* they confirm «احذف بياناتي», *then* they land on `/login?notice=account_deleted` with «حُذف حسابك وكل بياناتك كباحث. الطلبات التي أرسلتها سابقاً تبقى لدى الشركات وفق سياسة كل منها.», and signing in with the old password fails.
  - **AC-SSET-03.2** — *Given* a two-hat user, *when* they delete seeker data, *then* they land on `/admin`, the sidebar no longer shows «حسابي كباحث», and the account still signs in.
  - **AC-SSET-03.3** — *Given* the deleted seeker's earlier account application, *when* HR opens it, *then* the application and CV remain; *when* the seeker (account kept) recreates a profile, *then* `/me/applications` does not list it, and re-applying to the same job returns the duplicate message.
  - **AC-SSET-03.4** — [STATE] *Given* the dialog open and the request pending, *when* the user presses Escape, *then* the dialog stays open.
  - **AC-SSET-03.5** — *Given* a published profile, *when* seeker data is deleted, *then* `/t/{token}` returns the 404 page.

### F-TALENT-01 — Public talent page `/t/[token]` (P1)

#### REQ-TALENT-01 — Visibility and privacy boundary
- **Routes:** `/t/[token]`; RPC `talent_public_profile` (anon)
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(talent)/t/[token]/page.tsx:17,47-96`; `srp/supabase/migrations/0017_talent_platform.sql:161-195`
- **Rules:**
  - A row is returned only when the token matches, `status = published` and `consent_public_at` is set (account and legacy profiles alike). Token must match `^[0-9a-f]{32}$`, else 404. `force-dynamic`, so withdrawal or deletion takes effect at once. The token never rotates.
  - Shown: name (H1), headline, city, `{years} سنوات خبرة`, about; «نقاط القوة» (words, never a score); «مجالات التركيز»; «المهارات» (hidden skills excluded); «الخبرة»; «التعليم»; «اللغات»; footer «التواصل يتم عبر المنصة». Shell header «ملفّي» → `/talent` with «صفحة مهنية واحدة، برابط واحد»; shell footer «جميع الحقوق محفوظة — حكيم» (note the order is reversed compared with the public footer «حكيم — جميع الحقوق محفوظة»).
  - Never shown: email, phone, CV, score.
  - Title `{name} — {headline}`, else «ملفّي». Not found → title «لم نعثر على هذه الصفحة» with the generic 404 body. noindex → `robots: {index:false, follow:false}`.
- **Acceptance criteria:**
  - **AC-TALENT-01.1** — *Given* a published profile, *when* `/t/{token}` opens, *then* the sections above are shown and the HTML contains neither the email nor the phone.
  - **AC-TALENT-01.2** — [NEG] *Given* a `draft` or `hidden` profile, *when* its URL opens, *then* the 404 body is shown.
  - **AC-TALENT-01.3** — [NEG] *Given* `/t/XYZ`, *when* opened, *then* the 404 page is shown.

### F-TALENT-02 — Legacy accountless token pages (P2)

#### REQ-TALENT-02 — Legacy verify, review and manage pages
- **Routes:** `/talent/verify/[token]`, `/talent/review/[token]`, `/talent/manage/[token]`; Edge `talent-analyze` (`verify_token` mode)
- **Priority:** P2
- **Test type:** UI e2e; API
- **Source:** `srp/app/(talent)/talent/*`; `srp/app/(talent)/talent/actions.ts:14-20`; `srp/supabase/migrations/0020_seeker_accounts.sql:775-939`
- **Rules:**
  - Verify: calls `talent-analyze` with the token (32 hex, else 400; unknown → 404 `expired`; sent more than 24 h ago → 410 `expired`). Success → `/talent/review/{public_token}`. Any failure → H1 «انتهت صلاحية الرابط. ارفع سيرتك من جديد.»
  - Review: pending/processing «نقرأ سيرتك الآن…» / «تستغرق العملية أقل من دقيقة عادةً.»; failed «حدث خطأ. حاول مرة أخرى.» plus the raw `analysis_error` (LTR, with a trace id); done → review form whose publish button is disabled until public consent is ticked.
  - Manage (`?published=1` → «صفحتك جاهزة» / «هذا رابطك الفريد — شاركه كما تشاء.»): copy link, hide or republish, delete permanently (dialog «حذف الصفحة نهائياً؟»). Delete redirects to `/talent?deleted=1` (no message shown).
  - All legacy token functions act only on rows with `user_id is null`; account profiles are never reachable by token.
- **Acceptance criteria:**
  - **AC-TALENT-02.1** — [NEG] *Given* a malformed verify token, *when* `/talent/verify/{token}` opens, *then* «انتهت صلاحية الرابط. ارفع سيرتك من جديد.» is shown.
  - **AC-TALENT-02.2** — [PERM][NEG] *Given* an account-owned profile's public token, *when* `/talent/manage/{token}` opens, *then* the 404 page is shown.
  - **AC-TALENT-02.3** — *Given* a legacy published profile, *when* «حذف الصفحة نهائياً؟» is confirmed, *then* the browser lands on `/talent?deleted=1` and `/t/{token}` returns 404.

### 5.6 Company workspace `/admin`

### F-DASH-01 — Workspace shell and dashboard (P1)

#### REQ-DASH-01 — Sidebar
- **Routes:** `/admin/*`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/layout.tsx:25-66`
- **Rules:** items «لوحة التحكم», «الوظائف», «التقويم», «الإحصائيات»; «الإعدادات» for owner and admin only; «حسابي كباحث» → `/me` only when the account also has a seeker profile; footer with full name, role badge, «تسجيل الخروج»; the org switcher (REQ-ROLE-03).
- **Acceptance criteria:**
  - **AC-DASH-01.1** — *Given* the owner, *when* `/admin` loads, *then* the sidebar shows «لوحة التحكم», «الوظائف», «التقويم», «الإحصائيات» and «الإعدادات», and not «حسابي كباحث».
  - **AC-DASH-01.2** — [PERM] *Given* the hr user, *when* `/admin` loads, *then* «الإعدادات» is absent.

#### REQ-DASH-02 — Dashboard tiles
- **Routes:** `/admin`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/page.tsx`
- **Rules:** greeting `مرحباً، {full name}`; tiles «إجمالي الطلبات», «وظائف منشورة», «بانتظار التحليل» (pending + processing); buttons to jobs and stats. Loading skeleton.
- **Acceptance criteria:**
  - **AC-DASH-02.1** — *Given* the seed org with no applications, *when* `/admin` loads, *then* «وظائف منشورة» shows 2 and «إجمالي الطلبات» shows 0.
  - **AC-DASH-02.2** — *Given* one new application whose analysis is pending, *when* `/admin` loads, *then* «بانتظار التحليل» shows 1.

### F-AJOBS-01 — Company jobs list (P0)

#### REQ-AJOBS-01 — Jobs list, filter and paging
- **Routes:** `/admin/jobs?status=&page=`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/jobs/page.tsx`
- **Rules:**
  - 10 per page, newest first; query filters `org_id = active org` and `deleted_at is null`.
  - Filter buttons «الكل», «مسودة», «منشورة», «مغلقة» (`?status=`); paging «السابق» / «التالي» with `{page} / {total}`, the counter only when there is more than one page.
  - Columns «المسمى الوظيفي», «القسم», «نوع الدوام», «الحالة», «آخر موعد», «إجراءات»; empty department or deadline «—».
  - Empty: no jobs «لا توجد وظائف بعد» / «ابدأ بإنشاء أول وظيفة ثم انشرها لتظهر في البوابة العامة.»; filter with no result «لا توجد نتائج مطابقة» / «جرّب تغيير كلمات البحث أو إزالة بعض عوامل التصفية.»
  - `?page=999` behaviour beyond the last page is unclear (OQ-14).
- **Acceptance criteria:**
  - **AC-AJOBS-01.1** — *Given* the seed org, *when* `/admin/jobs` opens, *then* the three seed jobs are listed with statuses منشورة, منشورة, مسودة.
  - **AC-AJOBS-01.2** — *Given* the filter «مسودة», *when* applied, *then* only «أخصائي تسويق رقمي» is listed.
  - **AC-AJOBS-01.3** — [PERM] *Given* Org B has jobs, *when* the seed owner opens `/admin/jobs`, *then* none of Org B's jobs are listed.
  - **AC-AJOBS-01.4** — [STATE] *Given* a new org with no jobs, *when* the page opens, *then* «لا توجد وظائف بعد» is shown.
  - **AC-AJOBS-01.5** — *Given* 11 jobs, *when* the page opens, *then* 10 rows and `1 / 2` are shown.

#### REQ-AJOBS-02 — Row actions and error banners
- **Routes:** `/admin/jobs`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/jobs/page.tsx`; `srp/lib/i18n/ar.ts` (`adminJobs.errors`)
- **Rules:**
  - «المتقدمون» and «تعديل» on every row; «نشر» on drafts; «إعادة النشر» on closed jobs; «إغلاق» on published jobs; «حذف» on every row (confirmation dialog). Buttons are visible to every role (viewers are refused server-side).
  - `?error=` banner: `invalidInput` «يرجى التحقق من الحقول المدخلة»; `publishNoRequirements` «لا يمكن نشر الوظيفة بدون نص المتطلبات»; `notFound` «الوظيفة غير موجودة»; `forbidden` «صلاحيتك في هذه المؤسسة للاطّلاع فقط»; `serverError` «حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى». Unknown keys are ignored.
- **Acceptance criteria:**
  - **AC-AJOBS-02.1** — *Given* the draft seed job, *when* its row renders, *then* it offers «نشر» and not «إغلاق»; the published rows offer «إغلاق» and not «نشر».
  - **AC-AJOBS-02.2** — *Given* each `?error=` key above, *when* `/admin/jobs?error={key}` opens, *then* exactly the matching message is shown; `?error=other` shows none.

### F-AJOBS-02 — Create and edit a job (P0)

#### REQ-AJOBS-03 — Job form fields and rules
- **Routes:** `/admin/jobs/new`, `/admin/jobs/[id]/edit`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/components/admin/job-form.tsx`; `srp/lib/validations/job.ts`; `srp/app/(dashboard)/admin/jobs/actions.ts:52-106`
- **Rules:**

  | Field | Rule |
  |---|---|
  | title | required, trimmed, 1–200 (`maxLength` 200) |
  | department, location | optional, ≤ 120; empty → null |
  | type | `full_time` / `part_time` / `contract` / `remote` / `internship` shown as «دوام كامل» / «دوام جزئي» / «عقد» / «عن بُعد» / «تدريب»; default full_time |
  | description | required, 1–20,000 (Markdown) |
  | requirements | 0–20,000; **may be empty while saving**; label «المتطلبات (Markdown) — تُستخدم في المطابقة بالذكاء الاصطناعي» |
  | skills | free text ≤ 2,000, split on `,` `،` or new line, trimmed; placeholder «مثال: React, TypeScript, SQL» |
  | min_years_experience | integer 0–50; empty → 0 |
  | closes_at | empty or `YYYY-MM-DD`; no future-date check |

  - Saving redirects to `/admin/jobs`. A new job is a **draft** (status is not a form field). Editing never changes status.
  - Errors: a screening-question error «تحقق من الأسئلة المخصصة: نص السؤال 3 أحرف على الأقل، وسؤالا الاختيار يحتاجان خيارين على الأقل»; any other field error «يرجى التحقق من الحقول المدخلة»; DB failure «حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى».
  - Buttons «إنشاء الوظيفة» or «حفظ التعديلات» (pending «جارٍ الحفظ…») and «إلغاء».
  - Edit page: 404 for a non-UUID id, another org's job, or a soft-deleted job.
- **Acceptance criteria:**
  - **AC-AJOBS-03.1** — *Given* hr fills title, description and type only, *when* «إنشاء الوظيفة» is pressed, *then* the job is created as «مسودة» and listed first.
  - **AC-AJOBS-03.2** — *Given* skills `React، SQL\nExcel`, *when* saved, *then* three skills React, SQL and Excel are stored.
  - **AC-AJOBS-03.3** — [NEG] *Given* `min_years_experience = 51` or `2.5`, *when* saved, *then* «يرجى التحقق من الحقول المدخلة» is shown.
  - **AC-AJOBS-03.4** — *Given* `closes_at` in the past, *when* saved, *then* the save succeeds.
  - **AC-AJOBS-03.5** — [PERM][NEG] *Given* an Org B job id, *when* `/admin/jobs/{id}/edit` opens for the seed owner, *then* the 404 page is shown.

#### REQ-AJOBS-04 — Screening questions builder
- **Routes:** `/admin/jobs/new`, `/admin/jobs/[id]/edit`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/questions-builder.tsx`; `srp/supabase/functions/_shared/screening.ts:16-38`
- **Rules:**
  - Section «أسئلة التقديم المخصصة», hint «تُعرض على المتقدم في نموذج التقديم وتدخل إجاباته في التحليل الذكي (10 أسئلة كحد أقصى).» Empty «لا توجد أسئلة مخصصة — يمكن إضافة أسئلة فرز اختيارية.» «إضافة سؤال» is hidden at 10 questions.
  - Each question: «نص السؤال» 3–300; type «نص حر» / «نعم / لا» / «اختيار واحد» / «اختيار متعدد»; «إلزامي»; for choice types «الخيارات (سطر لكل خيار)» with 2–10 options of 1–120 characters; «حذف السؤال». Switching away from a choice type drops its options.
  - Answers store the question label and type, so old answers stay readable after questions change.
- **Acceptance criteria:**
  - **AC-AJOBS-04.1** — *Given* 10 questions, *when* the builder renders, *then* «إضافة سؤال» is not shown.
  - **AC-AJOBS-04.2** — [NEG] *Given* a single-choice question with one option, *when* saved, *then* «تحقق من الأسئلة المخصصة: نص السؤال 3 أحرف على الأقل، وسؤالا الاختيار يحتاجان خيارين على الأقل» is shown.
  - **AC-AJOBS-04.3** — [NEG] *Given* a question text of 2 characters, *when* saved, *then* the same message is shown.
  - **AC-AJOBS-04.4** — *Given* an application with answers, *when* the question's text is later edited, *then* the application page still shows the original label with the answer.

### F-AJOBS-03 — Job lifecycle (P0)

#### REQ-AJOBS-05 — Publish and republish require requirements text
- **Routes:** `/admin/jobs`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/jobs/actions.ts:108-171`
- **Rules:** «نشر» and «إعادة النشر» refuse a job whose trimmed requirements are empty → `?error=publishNoRequirements`. A missing or soft-deleted job → `?error=notFound`. Publishing does not check `closes_at`. Editing a published job may empty its requirements and it stays published (FR-01 is enforced at publish time only).
- **Acceptance criteria:**
  - **AC-AJOBS-05.1** — [NEG] *Given* a draft with whitespace-only requirements, *when* «نشر» is pressed, *then* «لا يمكن نشر الوظيفة بدون نص المتطلبات» is shown and it stays a draft.
  - **AC-AJOBS-05.2** — *Given* the seed draft `…0003`, *when* «نشر» is pressed, *then* it becomes «منشورة» and appears on `/jobs` within 60 s.
  - **AC-AJOBS-05.3** — *Given* a published job edited to empty requirements, *when* saved, *then* it stays published (records current behaviour; OQ-15).
  - **AC-AJOBS-05.4** — *Given* a job with a past `closes_at`, *when* it is published, *then* it is published; its public page shows «انتهى موعد التقديم لهذه الوظيفة».

#### REQ-AJOBS-06 — Close and republish
- **Routes:** `/admin/jobs`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/jobs/actions.ts`
- **Rules:** «إغلاق» sets `closed`: the job disappears from public pages and applying is refused (`job_closed`). «إعادة النشر» returns it to `published` (same requirements check). `draft` → `closed` is not offered.
- **Acceptance criteria:**
  - **AC-AJOBS-06.1** — *Given* a published job, *when* «إغلاق» is pressed, *then* it shows «مغلقة», `/jobs/{id}` returns 404 after revalidation, and a guest submit returns «التقديم غير متاح لهذه الوظيفة حالياً».
  - **AC-AJOBS-06.2** — *Given* the closed job, *when* «إعادة النشر» is pressed, *then* it is public again.

#### REQ-AJOBS-07 — Soft delete
- **Routes:** `/admin/jobs`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/jobs/actions.ts`; `srp/supabase/migrations/0006_multitenancy.sql:693`
- **Rules:** dialog «حذف الوظيفة؟» / «ستُخفى الوظيفة من البوابة ولوحة التحكم. طلبات التقديم المرتبطة بها تبقى محفوظة.» / «نعم، احذف» / «إلغاء». Sets `deleted_at` (D9); hard DELETE is revoked. No restore UI. After deletion: gone from the list and public pages; edit page and interview-bank page 404; the applicants page and application pages **still open by URL**; stats totals still count its applications.
- **Acceptance criteria:**
  - **AC-AJOBS-07.1** — *Given* a job with applications, *when* «حذف» → «نعم، احذف» is confirmed, *then* it disappears from `/admin/jobs` and from `/jobs`, and its applications still exist.
  - **AC-AJOBS-07.2** — *Given* the deleted job, *when* `/admin/jobs/{id}/applicants` opens, *then* the list still renders.
  - **AC-AJOBS-07.3** — [DB][NEG] *Given* an hr session, *when* it runs `delete from jobs`, *then* it is refused (DELETE revoked).

#### REQ-AJOBS-08 — Public pages are revalidated after job changes
- **Routes:** `/jobs/{id}`, `/c/{slug}`, `/`, `/jobs`, `/companies`, `/admin/jobs`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/lib/revalidate.ts`
- **Rules:** every job action revalidates the six paths above.
- **Acceptance criteria:**
  - **AC-AJOBS-08.1** — *Given* a job published from the dashboard, *when* `/c/{slug}` is reloaded, *then* the job appears without waiting for the 60 s ISR window.

#### REQ-AJOBS-09 — Job writes are limited to write roles of the same org
- **Routes:** `/admin/jobs*`; table `jobs`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/jobs/actions.ts`; `srp/supabase/tests/tenant_isolation.sql`
- **Rules:** a viewer's job action → `?error=forbidden`. RLS checks `is_org_member(org, owner|admin|hr)` for insert and update. A member of another org can neither insert nor update this org's jobs.
- **Acceptance criteria:**
  - **AC-AJOBS-09.1** — [PERM][NEG] *Given* a viewer, *when* they press «إغلاق» on a published job, *then* «صلاحيتك في هذه المؤسسة للاطّلاع فقط» is shown and the job stays published.
  - **AC-AJOBS-09.2** — [DB][PERM][NEG] *Given* Org B's hr session, *when* it updates a seed-org job, *then* 0 rows change; *when* it inserts a job with the seed org's id, *then* the insert is refused.

### F-RANK-01 — Ranked applicants (P0)

#### REQ-RANK-01 — Ranking order and paging
- **Routes:** `/admin/jobs/[id]/applicants?status=&page=`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/jobs/[id]/applicants/page.tsx:67-93`; `srp/supabase/migrations/0013_stats_and_fit_score.sql:25-45`
- **Rules:** 20 per page; ordered by `applications.fit_score desc nulls last`, then `created_at asc`. `fit_score` is a trigger-maintained copy of the evaluation score. «#» is the rank within the filtered view: `(page − 1) × 20 + i + 1`. 404 for a non-UUID or another org's job.
- **Acceptance criteria:**
  - **AC-RANK-01.1** — *Given* applicants with scores 62, 88 and none, *when* the list opens, *then* the order is 88, 62, then the unscored one, with «#» 1, 2, 3.
  - **AC-RANK-01.2** — *Given* two unscored applicants, *when* the list opens, *then* the earlier submission ranks first.
  - **AC-RANK-01.3** — *Given* 21 applicants, *when* page 2 opens, *then* one row with «#» 21 is shown.
  - **AC-RANK-01.4** — [PERM][NEG] *Given* an Org B job id, *when* the seed owner opens its applicants URL, *then* the 404 page is shown.

#### REQ-RANK-02 — Columns, score bands and the advisory label
- **Routes:** `/admin/jobs/[id]/applicants`
- **Priority:** P0
- **Test type:** UI e2e; visual
- **Source:** `srp/components/admin/score-badge.tsx:5-9`; applicants page
- **Rules:** header «المتقدمون: {job title}», back link «إدارة الوظائف», button «بنك أسئلة المقابلة» → the interview bank. Columns «#», «الاسم» (email beneath), «درجة الملاءمة (استشاري)» (tooltip), «حالة الطلب», «التحليل», «تاريخ التقديم», «إجراءات» (button «عرض الملف»). Score badge `{n} استشاري`; missing «—». Bands: ≥ 75 green, 50–74 amber, < 50 red (success / warning / destructive tokens).
- **Acceptance criteria:**
  - **AC-RANK-02.1** — *Given* scores 75, 74, 50 and 49, *when* rendered, *then* 75 is green, 74 and 50 amber, 49 red (visual).
  - **AC-RANK-02.2** — *Given* an unanalysed applicant, *when* rendered, *then* the score cell shows «—».
  - **AC-RANK-02.3** — *Given* a row, *when* «عرض الملف» is pressed, *then* `/admin/applications/{id}` opens.

#### REQ-RANK-03 — Analysis column and retry
- **Routes:** `/admin/jobs/[id]/applicants`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** applicants page lines 291-327
- **Rules:** pending → spinner «التحليل قيد الانتظار…»; processing → spinner «جارٍ التحليل…»; failed → red button `إعادة التحليل ({attempts})`; done → green check, no text. No auto-refresh. `?error=retryFailed` → «تعذّرت إعادة التحليل، حاول لاحقاً».
- **Acceptance criteria:**
  - **AC-RANK-03.1** — [STATE] *Given* a failed analysis with 2 attempts, *when* the list renders, *then* the button reads `إعادة التحليل (2)`.
  - **AC-RANK-03.2** — [STATE] *Given* a pending analysis, *when* the list renders, *then* «التحليل قيد الانتظار…» is shown with a spinner.
  - **AC-RANK-03.3** — [NEG] *Given* a double-click on «إعادة التحليل» (the second call gets 409), *when* the page reloads, *then* «تعذّرت إعادة التحليل، حاول لاحقاً» is shown.

#### REQ-RANK-04 — Status filter and empty states
- **Routes:** `/admin/jobs/[id]/applicants?status=`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** applicants page
- **Rules:** filter «الكل», «تم استلام الطلب», «قيد المراجعة», «دعوة لمقابلة», «تم القبول», «تم الاعتذار». Empty: no applicants «لا توجد طلبات تقديم» / «لم يتقدّم أحد لهذه الوظيفة بعد.»; filter with no result «لا توجد نتائج مطابقة» / «لا توجد طلبات بهذه الحالة.»
- **Acceptance criteria:**
  - **AC-RANK-04.1** — *Given* one applicant in «دعوة لمقابلة», *when* that filter is chosen, *then* only that applicant is listed with «#» 1.
  - **AC-RANK-04.2** — [STATE] *Given* a job with no applicants, *when* the list opens, *then* «لا توجد طلبات تقديم» is shown.

### F-ANL-01 — AI CV analysis pipeline (P0)

The analysis runs only inside the Edge Function `analyze-application` (D3). One evaluation model call per analysis (two with blind screening), never on page render (§8).

#### REQ-ANL-01 — Who may trigger an analysis
- **Routes:** Edge `analyze-application`
- **Priority:** P0
- **Test type:** API
- **Source:** `srp/supabase/functions/analyze-application/index.ts`; `srp/supabase/migrations/0006_multitenancy.sql:321-334`
- **Rules:**
  - Input `{application_id, force?}`. Bad JSON → 400 `invalid JSON body`; bad id → 400 `invalid application_id`; lookup error → 500; not found → 404 `application not found`.
  - A `pending` row may be analysed by any caller that passes the gateway (SEC-05).
  - Any other status requires `force:true` **and** either the exact service-role bearer or `can_manage_application(app)` true for the caller (owner, admin or hr of the application's org). Otherwise 409 if `processing`, 403 if `done` or `failed`, body `{"error":"re-run requires a staff caller with force"}`.
- **Acceptance criteria:**
  - **AC-ANL-01.1** — [API][NEG] *Given* a `done` application, *when* it is posted without `force`, *then* the reply is 403.
  - **AC-ANL-01.2** — [API][PERM][NEG] *Given* a `failed` seed-org application, *when* Org B's owner JWT posts it with `force:true`, *then* the reply is 403.
  - **AC-ANL-01.3** — [API][PERM][NEG] *Given* a `failed` application, *when* a viewer's JWT posts it with `force:true`, *then* the reply is 403.
  - **AC-ANL-01.4** — [API][NEG] *Given* a random UUID, *when* posted, *then* the reply is 404 `application not found`.

#### REQ-ANL-02 — Atomic claim and attempt counting
- **Routes:** Edge `analyze-application`; RPC `claim_application_for_analysis` (service role)
- **Priority:** P0
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/migrations/0012_security_hardening.sql`
- **Rules:** the claim atomically sets `processing`, increments `analysis_attempts` and clears `analysis_error`. Without force it succeeds only from `pending`; with force from `failed`, `done` or `processing`. A lost race → 409 `analysis already in progress`. Every claim increments attempts, including claims that end in a quota refusal.
- **Acceptance criteria:**
  - **AC-ANL-02.1** — [API] *Given* two concurrent forced calls on one application, *when* both run, *then* one proceeds and the other returns 409 `analysis already in progress`.
  - **AC-ANL-02.2** — [DB] *Given* an application analysed once successfully, *when* inspected, *then* `analysis_attempts = 1` and `analysis_error` is null.

#### REQ-ANL-03 — CV handling before the model call
- **Routes:** Edge `analyze-application`
- **Priority:** P0
- **Test type:** API
- **Source:** `srp/supabase/functions/analyze-application/index.ts`
- **Rules:** download the CV from `cvs`. PDF → sent to the model as `inlineData` (`application/pdf`). DOCX → text via `mammoth.extractRawText`, truncated to `MAX_CV_TEXT_CHARS = 30000` with a note appended to the prompt. Answered entries of the manual interview record are added to the prompt (REQ-NOTES-03). The model never receives the CV content in logs (§8).
- **Acceptance criteria:**
  - **AC-ANL-03.1** — [API] *Given* `cv-ar-frontend.docx`, *when* analysed, *then* it ends `done` with an evaluation whose `extracted.cv_language` is `ar` or `mixed`.
  - **AC-ANL-03.2** — [API] *Given* a DOCX with more than 30,000 characters, *when* analysed, *then* it ends `done` (the text is truncated, not refused).
  - **AC-ANL-03.3** — [API][NEG] *Given* a ZIP renamed `.docx`, *when* analysed, *then* it ends `failed` and the quota unit is refunded (model not reached).

#### REQ-ANL-04 — Model call parameters and structured-output validation (D2, D5, D6)
- **Routes:** Edge `analyze-application`
- **Priority:** P0
- **Test type:** API
- **Source:** `srp/supabase/functions/analyze-application/prompts.ts:8-11`; `srp/supabase/functions/_shared/evaluation.ts`
- **Rules:**
  - Model `gemini-3.5-flash`, `PROMPT_VERSION "1.1"`, temperature 0.2, JSON mode with `responseSchema`, thinking level LOW. Every evaluation row stores `model` and `prompt_version`.
  - zod `Evaluation`: breakdown `required_skills` 0–40, `experience_relevance` 0–30, `experience_years` 0–15, `education_fit` 0–10, `bonus_signals` 0–5; strengths ≤ 6 (no minimum), gaps ≤ 6, red flags ≤ 4; interview questions exactly 0 (non-CV fallback) or 8–10; `confidence` `high` / `medium` / `low`.
  - Invalid output → nothing stored, row `failed`, error message stored; the quota unit stays consumed.
- **Acceptance criteria:**
  - **AC-ANL-04.1** — [DB] *Given* a done evaluation, *when* its row is read, *then* `model = 'gemini-3.5-flash'` and `prompt_version = '1.1'`.
  - **AC-ANL-04.2** — [API] *Given* a non-CV PDF, *when* analysed, *then* the stored `fit_score` is 0, and the questions tab may list 0 questions (the «نسخ الكل» button is still shown).
  - **AC-ANL-04.3** — [DB] *Given* any done evaluation, *when* read, *then* the question count is 0 or between 8 and 10, and every breakdown value is within its limit.

#### REQ-ANL-05 — The stored score is the sum of the breakdown
- **Routes:** Edge `analyze-application`; trigger `ai_evaluations_sync_fit_score`
- **Priority:** P0
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/functions/analyze-application/index.ts` (`computeFitScore`); `srp/supabase/migrations/0013_stats_and_fit_score.sql`
- **Rules:** `fit_score = round(sum of breakdown)`, clamped 0–100, always overwriting the model's total. The trigger copies it to `applications.fit_score`. Clients cannot write `fit_score`.
- **Acceptance criteria:**
  - **AC-ANL-05.1** — [DB] *Given* any done evaluation, *when* read, *then* `fit_score` equals the rounded sum of its five breakdown values, and `applications.fit_score` equals it.
  - **AC-ANL-05.2** — [DB][NEG] *Given* an hr session, *when* it updates `applications.fit_score` or inserts into `ai_evaluations`, *then* it is refused.

#### REQ-ANL-06 — Upsert keeps HR notes and the first creation time
- **Routes:** Edge `analyze-application`
- **Priority:** P1
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/functions/analyze-application/index.ts`
- **Rules:** the evaluation is upserted on `application_id` (one row per application). `interview_notes` and `created_at` are not in the payload, so a re-run keeps the HR notes and the first run's `created_at`. The row is then set `done`; reply 200 `{ok:true, fit_score}`.
- **Acceptance criteria:**
  - **AC-ANL-06.1** — *Given* HR notes saved on an evaluation, *when* the analysis is re-run successfully, *then* the notes are still shown (see OQ-16 for the evaluation date shown in the footer).
  - **AC-ANL-06.2** — [DB] *Given* the re-run, *when* `ai_evaluations` is read, *then* there is still exactly one row for that application.

#### REQ-ANL-07 — Failure handling and quota refund
- **Routes:** Edge `analyze-application`
- **Priority:** P0
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/functions/analyze-application/index.ts:450-467`
- **Rules:** any thrown error → `failed`, `analysis_error = message[:500]`, HTTP 500 `analysis failed`. The quota unit is refunded only when the model was never reached (CV download failure, unsupported MIME, missing `GEMINI_API_KEY`, DOCX parse failure). Model errors and invalid output keep it consumed. `analysis_error` is never shown in the HR UI. The application stays fully usable: HR can open the CV.
- **Acceptance criteria:**
  - **AC-ANL-07.1** — [STATE] *Given* `GEMINI_API_KEY` unset, *when* an application is analysed, *then* the evaluation tab shows «فشل التحليل — يمكن قراءة السيرة يدوياً وإعادة المحاولة (المحاولات: 1)» and «عرض السيرة الذاتية» still opens the CV.
  - **AC-ANL-07.2** — [DB] *Given* the same failure, *when* `analysis_usage` is read, *then* `used` did not increase.
  - **AC-ANL-07.3** — *Given* any failure, *when* the HR pages render, *then* the raw `analysis_error` text is not displayed.

#### REQ-ANL-08 — Re-run from the dashboard
- **Routes:** `/admin/jobs/[id]/applicants`, `/admin/applications/[id]?tab=evaluation`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/applications/actions.ts:38-62`
- **Rules:** «إعادة التحليل» appears on the list for failed analyses, on the evaluation tab as an outline button when failed and as a ghost button when done; never while pending or processing. The action requires a write role in the active org (else redirect to `/admin`), invokes with `force:true` and the user's JWT, and waits at most 3 s. An error within 3 s → `{returnPath}?error=retryFailed`. Manual re-runs have no attempt cap.
- **Acceptance criteria:**
  - **AC-ANL-08.1** — *Given* a failed analysis and a working model, *when* hr presses «إعادة التحليل» on the evaluation tab, *then* after a reload the tab shows the score and justification.
  - **AC-ANL-08.2** — [PERM][NEG] *Given* a viewer, *when* they submit the re-run form, *then* they are redirected to `/admin` and no analysis starts.
  - **AC-ANL-08.3** — [KD-07] *Given* the quota is exhausted, *when* hr presses «إعادة التحليل» on the **detail page**, *then* a failure message is shown. (Observed in code: the page redirects to `?error=retryFailed`, which the detail page never reads, so nothing is shown; only the applicants page shows «تعذّرت إعادة التحليل، حاول لاحقاً».)
  - **AC-ANL-08.4** — *Given* an application already at 3 attempts, *when* hr re-runs it, *then* the run is accepted and attempts becomes 4.

#### REQ-ANL-09 — Blind screening (when enabled)
- **Routes:** Edge `analyze-application`; `/admin/applications/[id]?tab=evaluation`
- **Priority:** P1
- **Test type:** API; UI e2e
- **Source:** `srp/supabase/functions/analyze-application/index.ts:263-325`; `srp/supabase/migrations/0016_blind_screening_and_saudization.sql`
- **Rules:** with `organizations.blind_screening = true`, a redaction call (temperature 0, `REDACTION_PROMPT_VERSION "1.0"`) runs first; only the redacted text is evaluated; the cover note is dropped; empty redacted text fails the analysis (the original is never used as a fallback). Two model calls, **one** quota unit. The evaluation stores `blind = true`; the tab shows «قُيّم مُعمّى». Logs carry only the count of removed categories. The UI switch currently cannot be saved (KD-01), so tests set the column by SQL.
- **Acceptance criteria:**
  - **AC-ANL-09.1** — *Given* `blind_screening = true` set by SQL, *when* an application is analysed, *then* the evaluation tab shows «قُيّم مُعمّى» and `analysis_usage.used` increased by exactly 1.
  - **AC-ANL-09.2** — *Given* blind screening on and a cover note, *when* analysed, *then* the evaluation does not reference the cover note's content (manual review).

### F-EVAL-01 — Application detail and AI evaluation (P0)

#### REQ-EVAL-01 — Header, tabs and access
- **Routes:** `/admin/applications/[id]?tab=…`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/applications/[id]/page.tsx`
- **Rules:** back link «قائمة المتقدمين»; applicant name; status badge; «قدّم عبر حسابه» when `via_account`; meta `الوظيفة: {title}` (link to the list), `تاريخ التقديم: {date}`, `رمز المتابعة: {ref_code}`. Tabs «الملف», «التقييم الذكي», «أسئلة المقابلة», «المقابلة» (`?tab=profile|evaluation|questions|interview`; unknown → profile). 404 for a non-UUID or another org's application. Loading skeleton.
- **Acceptance criteria:**
  - **AC-EVAL-01.1** — *Given* a guest application, *when* its page opens, *then* the header shows the name, «تم استلام الطلب», the job link and the reference code, and no «قدّم عبر حسابه».
  - **AC-EVAL-01.2** — *Given* `?tab=foo`, *when* the page opens, *then* the «الملف» tab is active.
  - **AC-EVAL-01.3** — [PERM][NEG] *Given* an Org B application id, *when* the seed hr user opens it, *then* the 404 page is shown.

#### REQ-EVAL-02 — Profile tab and the signed CV link
- **Routes:** `/admin/applications/[id]?tab=profile`; bucket `cvs`
- **Priority:** P0
- **Test type:** UI e2e; DB-RLS
- **Source:** application page line 130; `srp/supabase/migrations/0007_storage_isolation.sql:84-90`
- **Rules:** «البريد الإلكتروني» (mailto) and «رقم الجوال» (tel); button «عرض السيرة الذاتية» opens a signed URL valid **600 seconds** in a new tab, with «رابط السيرة صالح لمدة 10 دقائق»; no URL → «تعذّر إنشاء رابط السيرة الذاتية»; «الرسالة التعريفية» if present; «إجابات أسئلة التقديم» if present (multi-choice joined with «، »); the status changer (REQ-STATUS-01); the Saudization control (REQ-SET-04). CV read is allowed for all four roles of the org, never for another org or a platform admin.
- **Acceptance criteria:**
  - **AC-EVAL-02.1** — *Given* a viewer, *when* they press «عرض السيرة الذاتية», *then* the CV opens and the note «رابط السيرة صالح لمدة 10 دقائق» is shown.
  - **AC-EVAL-02.2** — [NEG] *Given* a signed CV URL, *when* it is fetched 11 minutes after creation, *then* it is refused.
  - **AC-EVAL-02.3** — [DB][PERM][NEG] *Given* Org B's hr session, *when* it requests a signed URL for a seed-org CV object, *then* it is refused.
  - **AC-EVAL-02.4** — *Given* answers to a multiple-choice question, *when* the tab renders, *then* they are joined with «، ».

#### REQ-EVAL-03 — Evaluation tab states
- **Routes:** `/admin/applications/[id]?tab=evaluation`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** application page lines 396-431
- **Rules:** always: the disclaimer, the button «تصدير تقرير الشفافية», and «قُيّم مُعمّى» when blind. pending → «التحليل قيد الانتظار…»; processing → «جارٍ التحليل…»; failed → alert «فشل التحليل — يمكن قراءة السيرة يدوياً وإعادة المحاولة (المحاولات: {n})» + «إعادة التحليل»; done but missing or invalid → «التقييم غير متاح». The evaluation is fetched only when the status is `done`.
- **Acceptance criteria:**
  - **AC-EVAL-03.1** — [STATE] *Given* a processing analysis, *when* the tab opens, *then* «جارٍ التحليل…» is shown with the disclaimer and «تصدير تقرير الشفافية».
  - **AC-EVAL-03.2** — [STATE] *Given* a previously done application whose forced re-run failed, *when* the tab opens, *then* the failed alert is shown and the old evaluation is hidden (while the ranked list still shows the old score; OQ-17).

#### REQ-EVAL-04 — Evaluation content
- **Routes:** `/admin/applications/[id]?tab=evaluation`
- **Priority:** P0
- **Test type:** UI e2e; visual
- **Source:** application page; `srp/lib/i18n/ar.ts:954-975`
- **Rules:**
  - Large score with «استشاري» and the advisory tooltip, coloured by band, labelled «درجة الملاءمة».
  - Low confidence (`justification.confidence = low`) → badge «موثوقية منخفضة — يُنصح بمراجعة السيرة يدوياً».
  - «تفصيل الدرجة» bars `{v} / {max}`: «المهارات المطلوبة» /40, «صلة الخبرة» /30, «سنوات الخبرة» /15, «الملاءمة التعليمية» /10, «إشارات إضافية» /5.
  - Lists «نقاط القوة», «الفجوات», «نقاط تحتاج استيضاحاً» (empty → «—»).
  - Footer `النموذج: {model} — إصدار البرومبت: {version}` — `{date time}`.
- **Acceptance criteria:**
  - **AC-EVAL-04.1** — *Given* a done evaluation, *when* the tab renders, *then* the five criteria show values over 40, 30, 15, 10 and 5, and their rounded sum equals the large score.
  - **AC-EVAL-04.2** — *Given* a scanned, unreadable PDF evaluated with low confidence, *when* the tab renders, *then* «موثوقية منخفضة — يُنصح بمراجعة السيرة يدوياً» is shown.
  - **AC-EVAL-04.3** — *Given* a done evaluation, *when* the footer renders, *then* it reads `النموذج: gemini-3.5-flash — إصدار البرومبت: 1.1` followed by a date and time.
  - **AC-EVAL-04.4** — *Given* an English CV, *when* the evaluation renders, *then* strengths, gaps and red flags are written in Arabic (technical terms may stay in English).

#### REQ-EVAL-05 — Extracted CV profile
- **Routes:** `/admin/applications/[id]?tab=evaluation`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** application page
- **Rules:** «الملف المستخرج من السيرة»: `إجمالي سنوات الخبرة: {n} سنة`; `لغة السيرة: {العربية|الإنجليزية|مختلطة}`; «الخبرات العملية» timeline `start ← end` (null start «؟», null end «حتى الآن»); «التعليم», «المهارات», «اللغات».
- **Acceptance criteria:**
  - **AC-EVAL-05.1** — *Given* `cv-en-accountant.pdf` analysed, *when* the tab renders, *then* «لغة السيرة» shows «الإنجليزية».
  - **AC-EVAL-05.2** — *Given* a current job with no end date, *when* the timeline renders, *then* it shows «حتى الآن».

### F-NOTES-01 — Interview questions, HR notes and the manual interview record (P1)

#### REQ-NOTES-01 — Suggested interview questions
- **Routes:** `/admin/applications/[id]?tab=questions`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/interview-questions.tsx`
- **Rules:** without a valid evaluation «التقييم غير متاح». With one: «أسئلة المقابلة المقترحة»; each question shows a kind badge «تقني» / «سلوكي» / «استيضاح» and a rationale line; the AI questions are read-only. «نسخ الكل» copies `1. {question}` lines (question text only) and reads «تم النسخ» for 2 s.
- **Acceptance criteria:**
  - **AC-NOTES-01.1** — *Given* a done evaluation with 9 questions, *when* the tab renders, *then* 9 questions with kind badges and rationales are shown and none is editable.
  - **AC-NOTES-01.2** — *Given* the tab, *when* «نسخ الكل» is pressed, *then* the clipboard holds 9 numbered lines with the question texts only.

#### REQ-NOTES-02 — HR interview notes (separate from the AI original, FR-07)
- **Routes:** `/admin/applications/[id]?tab=questions`; column `ai_evaluations.interview_notes`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/components/admin/interview-questions.tsx`; `srp/supabase/migrations/0002_interview_notes.sql:13`
- **Rules:** field «ملاحظات المقابلة (تحرير الموارد البشرية)», hint «تعديلاتك تُحفظ هنا ولا تمس الأسئلة الأصلية المولّدة.», placeholder «دوّن تعديلاتك أو أسئلتك الإضافية هنا…»; at most 4,000 characters (maxLength and a server slice); blank → null. Button «حفظ الملاحظات» (pending «جارٍ الحفظ…»); success «تم حفظ الملاحظات»; failure «تعذّر حفظ الملاحظات، حاول مرة أخرى». `interview_notes` is the only client-updatable column of `ai_evaluations` (write roles).
- **Acceptance criteria:**
  - **AC-NOTES-02.1** — *Given* hr types notes, *when* «حفظ الملاحظات» is pressed, *then* «تم حفظ الملاحظات» is shown and the AI questions are unchanged.
  - **AC-NOTES-02.2** — [DB][NEG] *Given* an hr session, *when* it updates `ai_evaluations.justification`, *then* it is refused; *when* it updates `interview_notes`, *then* it succeeds.
  - **AC-NOTES-02.3** — [PERM][NEG] *Given* a viewer, *when* they press «حفظ الملاحظات», *then* they are redirected to `/admin` and nothing is saved.

#### REQ-NOTES-03 — Manual interview record (schedule and answers)
- **Routes:** `/admin/applications/[id]?tab=interview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/interview-manager.tsx`; `srp/app/(dashboard)/admin/applications/actions.ts:137-182`
- **Rules:**
  - Shown below the virtual-interview panel. Status line `موعد المقابلة: {datetime}` or «لم يُحدد موعد للمقابلة بعد». Hint `سجّل إجابات المرشح على الأسئلة المقترحة أو أضف أسئلة جديدة بإجاباتها، ثم استخدم «إعادة التحليل» ليأخذها التقييم في الحسبان.`
  - «موعد المقابلة» `datetime-local`; clearing sets it to null.
  - Entries: AI questions (badge «مقترح آلياً») merged with stored ones; HR questions (badge «سؤال إضافي», button «حذف»). Answer placeholder «إجابة المرشح…» (≤ 4,000). New question «سؤال جديد», placeholder «اكتب نص السؤال الجديد…» (≤ 500); «إضافة السؤال» disabled when empty or at 30 entries (unanswered AI entries count).
  - Saving keeps answered entries and all HR entries; unanswered AI suggestions are not stored. Server limits: ≤ 30 entries, question 1–500, answer ≤ 4,000, `source` `ai` or `hr`.
  - Button «حفظ سجل المقابلة» (pending «جارٍ الحفظ…»); success «تم حفظ سجل المقابلة»; failure «تعذّر الحفظ، حاول مرة أخرى». Saving does not change status, send email or create a calendar invite. Answered entries feed the next analysis prompt.
  - Time zone handling between the browser and the server is a known risk (OQ-18).
- **Acceptance criteria:**
  - **AC-NOTES-03.1** — *Given* an interview time and two answers, *when* «حفظ سجل المقابلة» is pressed, *then* «تم حفظ سجل المقابلة» is shown, the status line shows the time, and the application status is unchanged.
  - **AC-NOTES-03.2** — *Given* 30 entries, *when* the user types a new question, *then* «إضافة السؤال» stays disabled.
  - **AC-NOTES-03.3** — *Given* an HR question added and saved, *when* the page reloads, *then* it shows «سؤال إضافي» with a «حذف» button.
  - **AC-NOTES-03.4** — *Given* saved answers, *when* the analysis is re-run, *then* the new evaluation is produced with the answers in its input (observable via a changed evaluation; manual review).

### F-STATUS-01 — Status pipeline and applicant emails (P0)

#### REQ-STATUS-01 — Status changer UI
- **Routes:** `/admin/applications/[id]?tab=profile`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/components/admin/status-changer.tsx`; `srp/app/(dashboard)/admin/applications/actions.ts:85-129`
- **Rules:** card «تغيير حالة الطلب»: select «الحالة الجديدة» with all 5 statuses; note «ملاحظة (اختياري — تُحفظ في سجل الحالة)» (≤ 1,000, longer text truncated server-side); hint `عند اختيار «دعوة لمقابلة» أو «تم الاعتذار» يُرسَل بريد تلقائي للمتقدم.`; button «تحديث الحالة» (pending «جارٍ التحديث…»), **disabled while the selection equals the current status**. Success «تم تحديث الحالة»; failure «تعذّر تحديث الحالة، حاول مرة أخرى».
- **Acceptance criteria:**
  - **AC-STATUS-01.1** — *Given* a new application, *when* the select still shows «تم استلام الطلب», *then* «تحديث الحالة» is disabled.
  - **AC-STATUS-01.2** — *Given* hr selects «قيد المراجعة» with a note, *when* «تحديث الحالة» is pressed, *then* «تم تحديث الحالة» is shown and the badge reads «قيد المراجعة».
  - **AC-STATUS-01.3** — *Given* a 1,200-character note, *when* saved, *then* the stored note is 1,000 characters.

#### REQ-STATUS-02 — Status RPC rules and history
- **Routes:** RPC `change_application_status`; table `status_history`; trigger `applications_status_history`
- **Priority:** P0
- **Test type:** DB-RLS; API
- **Source:** `srp/supabase/migrations/0006_multitenancy.sql:451-517`; `srp/supabase/migrations/0003_status_rpc.sql:46`
- **Rules:** the RPC locks the row and requires `is_org_member(app.org_id, owner|admin|hr)`, else raises `forbidden` (42501). Same status → silent no-op, no history row. Otherwise the status changes and the trigger writes `from`, `to`, `changed_by = auth.uid()` and the note. **Any status may move to any other**; there is no transition table. Direct `UPDATE` of `status` is denied.
- **Acceptance criteria:**
  - **AC-STATUS-02.1** — [DB] *Given* an `accepted` application, *when* hr moves it to `new`, *then* it succeeds and a history row `accepted → new` is written.
  - **AC-STATUS-02.2** — [DB][NEG] *Given* a viewer, *when* they call the RPC, *then* it raises `forbidden`.
  - **AC-STATUS-02.3** — [DB][PERM][NEG] *Given* Org B's hr, *when* they call the RPC on a seed-org application, *then* it raises `forbidden`.
  - **AC-STATUS-02.4** — [DB] *Given* the current status `interview`, *when* the RPC is called with `interview`, *then* no history row is added.
  - **AC-STATUS-02.5** — [DB] *Given* any change by hr, *when* history is read, *then* `changed_by` is that hr user's id.

#### REQ-STATUS-03 — Status emails
- **Routes:** Edge `send-email` kinds `interview_invited`, `accepted`, `rejected`
- **Priority:** P0
- **Test type:** UI e2e (mail capture); API
- **Source:** `srp/app/(dashboard)/admin/applications/actions.ts:72-78,98-125`; `srp/supabase/functions/send-email/templates.ts`
- **Rules:** sent by the Next action **after** the RPC succeeds (not by the RPC; a direct RPC call sends nothing): `interview` → EM-02, `accepted` → EM-03, `rejected` → EM-04; `new` and `under_review` send nothing. Sent with the anon key; failure never fails the change. Sender name from the applicant's own org. The UI hint does not mention `accepted` (OQ-19).
- **Acceptance criteria:**
  - **AC-STATUS-03.1** — *Given* hr sets «دعوة لمقابلة», *when* the change succeeds, *then* the applicant receives `دعوة لمقابلة — {jobTitle}` with the reference code.
  - **AC-STATUS-03.2** — *Given* hr sets «تم القبول», *when* the change succeeds, *then* the applicant receives `تهانينا — {jobTitle}`.
  - **AC-STATUS-03.3** — *Given* hr sets «قيد المراجعة», *when* the change succeeds, *then* no email is sent.
  - **AC-STATUS-03.4** — *Given* `RESEND_API_KEY` unset, *when* hr sets «تم الاعتذار», *then* «تم تحديث الحالة» is shown and no email is sent.
  - **AC-STATUS-03.5** — [KD-15] *Given* two tabs, where tab 1 already set «دعوة لمقابلة» and tab 2 (stale, still showing «تم استلام الطلب») submits «دعوة لمقابلة», *when* tab 2 submits, *then* no second email should be sent. (Observed in code: the RPC no-ops but the action sends the email again.)

### F-CAL-01 — Interview calendar (P2)

#### REQ-CAL-01 — Month grid and lists
- **Routes:** `/admin/calendar?m=YYYY-MM`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/calendar/page.tsx`
- **Rules:**
  - Reads the org's applications with status `interview` **or** a set `interview_at`, ordered by `interview_at`, at most 300 rows (no paging).
  - Grid: weeks start on Saturday, headers «السبت» … «الجمعة»; today circled with tooltip «اليوم»; «الشهر السابق» / «الشهر التالي» via `?m=`; a value failing the format regex shows the current month. Chips `HH:mm {name}` → `/admin/applications/{id}?tab=interview`.
  - «بانتظار تحديد موعد» (count badge): status `interview` with no date; hint «مرشحون في مرحلة المقابلة دون موعد محدد — افتح الملف لتحديد الموعد.»
  - «المقابلات القادمة»: `interview_at >= now`. Cards: name, score badge, job title, date, `{suggested} سؤالاً مقترحاً — {answered} إجابة مسجلة`, button «إدارة المقابلة».
  - Empty (no rows at all): «لا توجد مقابلات مجدولة» / `عند نقل مرشح إلى مرحلة «دعوة لمقابلة» وتحديد موعده سيظهر هنا.`
- **Acceptance criteria:**
  - **AC-CAL-01.1** — *Given* an application in «دعوة لمقابلة» with no time, *when* the calendar opens, *then* it is listed under «بانتظار تحديد موعد».
  - **AC-CAL-01.2** — *Given* an interview time tomorrow, *when* the calendar opens, *then* a chip appears on tomorrow's cell and the card is under «المقابلات القادمة».
  - **AC-CAL-01.3** — [STATE] *Given* no interviews, *when* the calendar opens, *then* «لا توجد مقابلات مجدولة» is shown.
  - **AC-CAL-01.4** — [NEG] *Given* `?m=abc`, *when* opened, *then* the current month is shown.
  - **AC-CAL-01.5** — [KD-06][NEG] *Given* `?m=2026-13`, *when* opened, *then* a safe fallback (current month) should be shown. (Observed in code: it passes the regex and date-fns throws, so the global error page «حدث خطأ غير متوقع» appears.)

### F-STATS-01 — Statistics (P1)

#### REQ-STATS-01 — KPIs, charts and empty state
- **Routes:** `/admin/stats`; RPCs `org_stats`, `org_quota`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/stats/page.tsx`; `srp/supabase/migrations/0013_stats_and_fit_score.sql:78-151`
- **Rules:**
  - KPIs: «إجمالي الطلبات», «وظائف منشورة», «متوسط درجة الملاءمة (استشاري)» (rounded integer, «—» if none), «بانتظار التحليل», «تحليلات متعثرة».
  - 0 applications → «لا توجد بيانات بعد» / «ستظهر الإحصائيات فور استلام أول طلب توظيف.» Otherwise: «الطلبات لكل وظيفة» (bars, only jobs with count > 0); «مسار حالات الطلبات» (all 5 statuses, zeros included); «الطلبات خلال آخر 30 يوماً» (area chart, 30 days); «ملخص الوظائف» table «الوظيفة» / «الطلبات» / «متوسط الدرجة (استشاري)» with score badges for all non-deleted jobs. Tooltip unit «طلب».
  - Totals include applications of soft-deleted jobs; per-job rows exclude deleted jobs. Aggregation happens in the database (no row cap).
  - `org_stats` and `org_quota` are members-only (42501 'not a member of this organization').
- **Acceptance criteria:**
  - **AC-STATS-01.1** — [STATE] *Given* a new org, *when* `/admin/stats` opens, *then* «لا توجد بيانات بعد» is shown.
  - **AC-STATS-01.2** — *Given* 3 applications (one accepted, two new) with scores 60 and 80 and one unscored, *when* the page opens, *then* «إجمالي الطلبات» is 3, «متوسط درجة الملاءمة (استشاري)» is 70, and the funnel shows all five statuses with 2 and 1 in the right places.
  - **AC-STATS-01.3** — [DB][PERM][NEG] *Given* a seeker-only user or Org B's owner, *when* they call `org_stats` for the seed org, *then* it raises 42501.

### F-QUOTA-01 — Monthly analysis quota (P0, D16)

#### REQ-QUOTA-01 — Quota enforcement inside the analysis
- **Routes:** Edge `analyze-application`; RPCs `consume_analysis_quota`, `release_analysis_quota` (service role)
- **Priority:** P0
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/migrations/0014_analysis_quota.sql`
- **Rules:**
  - `organizations.monthly_analysis_quota`: default 25; null = uncapped (usage still counted); 0 = no analyses. `plan_code` is free text (default `trial`) and maps to nothing; only the 25 default exists in code.
  - Usage per org per calendar month (`date_trunc('month', now())`, server time). `used` increments atomically while `used < quota`.
  - Checked inside the function **before** the model call. Refusal → row `failed`, `analysis_error = 'monthly analysis quota exhausted'`, HTTP 429 `{"error":"quota exceeded"}`. RPC error → `failed`, 500.
  - Release (refund) decrements but never below 0.
  - Tenants cannot update `monthly_analysis_quota` or `plan_code`.
- **Acceptance criteria:**
  - **AC-QUOTA-01.1** — [API] *Given* quota 2 and 3 new applications, *when* they are analysed in turn, *then* the first two end `done` and the third ends `failed` with HTTP 429.
  - **AC-QUOTA-01.2** — [API] *Given* quota 0, *when* any application is analysed, *then* it ends `failed` with 429 and no model call is made.
  - **AC-QUOTA-01.3** — [DB] *Given* quota null, *when* analyses run, *then* they all succeed and `analysis_usage.used` still increases.
  - **AC-QUOTA-01.4** — [DB][PERM][NEG] *Given* the owner, *when* they update `monthly_analysis_quota`, *then* it is refused.

#### REQ-QUOTA-02 — Quota display on the stats page
- **Routes:** `/admin/stats`
- **Priority:** P0
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/stats/page.tsx`; `srp/supabase/migrations/0014_analysis_quota.sql:135-165`
- **Rules:** card «حصة التحليل الشهرية»: `{used} من {quota} تحليلاً`, or «بلا حدّ» when uncapped. Side text `المتبقي: {n}`, or «انتهت حصتك الشهرية» in red at 0. At 0 a banner «انتهت حصتك الشهرية» with «الطلبات الجديدة تُستقبل كالمعتاد ويمكنك قراءة السير بنفسك، لكن التحليل الآلي متوقف حتى بداية الشهر القادم أو ترقية الباقة.» There is no near-limit warning.
- **Acceptance criteria:**
  - **AC-QUOTA-02.1** — *Given* the seed org with 3 analyses this month, *when* `/admin/stats` opens, *then* the card reads `3 من 25 تحليلاً` and `المتبقي: 22`.
  - **AC-QUOTA-02.2** — [STATE] *Given* used = quota, *when* the page opens, *then* «انتهت حصتك الشهرية» and the banner text are shown.
  - **AC-QUOTA-02.3** — *Given* quota null, *when* the page opens, *then* the card shows «بلا حدّ».
  - **AC-QUOTA-02.4** — [KD-08] *Given* the `org_quota` read fails, *when* the page opens, *then* an error state should be shown. (Observed in code: the default `{quota:null}` renders «بلا حدّ».)

#### REQ-QUOTA-03 — Behaviour when the quota is exhausted
- **Routes:** `/jobs/[id]/apply`; `/admin/applications/[id]`; Edge `housekeeping`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `srp/supabase/functions/analyze-application/index.ts`; `srp/supabase/functions/housekeeping/index.ts`
- **Rules:** applying still succeeds (D4); the analysis ends `failed` and the CV stays readable; HR sees only the generic failure «فشل التحليل — يمكن قراءة السيرة يدوياً وإعادة المحاولة», not the quota reason; housekeeping retries while attempts < 3, each retry incrementing attempts; manual re-runs keep incrementing attempts.
- **Acceptance criteria:**
  - **AC-QUOTA-03.1** — *Given* an exhausted quota, *when* a guest applies, *then* the success screen is shown and HR sees the application with the failed alert and a working «عرض السيرة الذاتية».
  - **AC-QUOTA-03.2** — [API] *Given* that application, *when* housekeeping runs three times, *then* `analysis_attempts` stops at 3 and the application is not retried further automatically.

### F-SET-01 — Company settings (P1)

#### REQ-SET-01 — Branding and careers page settings
- **Routes:** `/admin/settings`; bucket `org-assets`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/components/admin/branding-form.tsx`; `srp/app/(dashboard)/admin/settings/branding-actions.ts`; `srp/supabase/migrations/0011_org_branding.sql`; `0012_security_hardening.sql:59-61`
- **Rules:**
  - Card «هوية الشركة وصفحة التوظيف»: «اسم الشركة» (2–200); «الرابط المختصر» (client forces lower-case `[a-z0-9-]`, ≤ 40; server regex `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`); «القطاع», «المدينة» (≤ 100 each); «الموقع الإلكتروني» (URL ≤ 200 or empty); «لون الشركة» (hex `#RRGGBB`, hint «يظهر في غلاف صفحة التوظيف»); «نبذة عن الشركة» (≤ 4,000, Markdown); «الشعار», «صورة الغلاف» (hint «PNG أو JPG أو WEBP بحجم أقصاه 2 ميجابايت»); checkbox «إظهار الشركة في دليل الوظائف العام». Link «معاينة» opens `/c/{slug}` with the slug currently typed.
  - Messages: general «يرجى التحقق من الحقول المدخلة»; fields «اسم الشركة حرفان على الأقل», «الرابط بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ولا يقل عن ثلاثة أحرف», «أدخل رابطاً صحيحاً يبدأ بـ https», «اختر لوناً صحيحاً»; images «صيغة الصورة غير مدعومة», «حجم الصورة يتجاوز 2 ميجابايت», «تعذّر رفع الصورة، حاول مرة أخرى»; slug collision «هذا الرابط محجوز، اختر غيره»; reserved slug → the format message; other «تعذّر الحفظ، حاول مرة أخرى»; success «تم الحفظ».
  - Images go to `org-assets/{org_id}/{kind}-{timestamp}.{ext}` (public bucket; PNG, JPEG, WEBP ≤ 2 MB; only owner/admin of that org may write). A slug change revalidates the old and new `/c/` paths; the old one then 404s (no redirect). The colour input always posts a value (cannot be cleared; first save stores `#2383e2` if none was set).
- **Acceptance criteria:**
  - **AC-SET-01.1** — *Given* the owner sets industry, city, a brand colour and «about», *when* saved, *then* «تم الحفظ» is shown and `/c/default` shows them.
  - **AC-SET-01.2** — [NEG] *Given* slug `jobs`, *when* saved, *then* «الرابط بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ولا يقل عن ثلاثة أحرف» is shown.
  - **AC-SET-01.3** — [NEG] *Given* Org B's slug, *when* saved, *then* «هذا الرابط محجوز، اختر غيره» is shown.
  - **AC-SET-01.4** — [NEG] *Given* a 2.5 MB PNG logo, *when* saved, *then* «حجم الصورة يتجاوز 2 ميجابايت» is shown.
  - **AC-SET-01.5** — [KD-12][NEG] *Given* an SVG logo, *when* saved, *then* «صيغة الصورة غير مدعومة» should be shown. (Observed in code: the server accepts SVG, the bucket refuses it, so «تعذّر رفع الصورة، حاول مرة أخرى» appears.)
  - **AC-SET-01.6** — *Given* the slug changed from `default` to `ufq`, *when* saved, *then* `/c/ufq` renders and `/c/default` returns 404.
  - **AC-SET-01.7** — *Given* «إظهار الشركة في دليل الوظائف العام» unticked and saved, *when* `/companies` and `/jobs` reload, *then* the org and its jobs are absent, while `/c/{slug}` and `/jobs/{id}` still render.
  - **AC-SET-01.8** — [DB][PERM][NEG] *Given* an hr session, *when* it uploads to `org-assets/{org_id}/`, *then* it is refused.
  - **AC-SET-01.9** — *Given* website `http://example.com`, *when* saved, *then* it is accepted (although the message mentions https; OQ-20).

#### REQ-SET-02 — Company name and retention period
- **Routes:** `/admin/settings`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/settings/actions.ts`
- **Rules:** card «بيانات الشركة والاحتفاظ»: «اسم الشركة» (2–200, same column as branding) and «مدة الاحتفاظ بالطلبات (بالأشهر)» (integer 1–60, also a DB check); hint «تُحذف الطلبات وسيرها الذاتية نهائياً بعد هذه المدة (من 1 إلى 60 شهراً) وفق مهمة التنظيف اليومية.»; button «حفظ الإعدادات» (pending «جارٍ الحفظ…»); success «تم حفظ الإعدادات»; any failure «تعذّر الحفظ، حاول مرة أخرى». Owners update the org but never its `status`.
- **Acceptance criteria:**
  - **AC-SET-02.1** — *Given* retention 6, *when* saved, *then* «تم حفظ الإعدادات» is shown and the value persists after reload.
  - **AC-SET-02.2** — [NEG] *Given* retention 0 or 61 sent by a crafted request, *when* saved, *then* «تعذّر الحفظ، حاول مرة أخرى» is shown.
  - **AC-SET-02.3** — [DB][PERM][NEG] *Given* the owner, *when* they update `organizations.status`, *then* it is refused.

#### REQ-SET-03 — Compliance: blind screening and Nitaqat
- **Routes:** `/admin/settings`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/settings/actions.ts` (`updateCompliance`); `srp/supabase/migrations/0016_blind_screening_and_saudization.sql`; `0006_multitenancy.sql:562-566`
- **Rules:** card «الفرز المُعمّى · السعودة (نطاقات)»: checkbox «تفعيل الفرز المُعمّى» with the warning «يستهلك تحليلين بدل واحد لكل سيرة — أي ضعف الحصة الشهرية.» (contradicts the code; OQ-21); select «النطاق الحالي»: «لم يُحدَّد» / «بلاتيني» / «أخضر مرتفع» / «أخضر متوسط» / «أخضر منخفض» / «أصفر» / «أحمر»; «نسبة السعودة المستهدفة» (0–100, step 0.01, or empty). Same save button and messages as REQ-SET-02. The Saudization indicator is manual, at offer stage, never inferred and never an input to the score.
- **Acceptance criteria:**
  - **AC-SET-03.1** — [KD-01] *Given* the owner ticks «تفعيل الفرز المُعمّى», picks «أخضر متوسط» and target 30, *when* «حفظ الإعدادات» is pressed, *then* «تم حفظ الإعدادات» should be shown and the values persist. (Observed in code, verified on a scratch database: `authenticated` has no UPDATE privilege on `blind_screening`, `nitaqat_band` or `saudization_target`, so «تعذّر الحفظ، حاول مرة أخرى» appears for owner and admin alike.)
  - **AC-SET-03.2** — [PERM] *Given* the hr user, *when* `/admin/settings` opens, *then* they are redirected to `/admin` (no compliance access).

#### REQ-SET-04 — Saudization indicator on an application
- **Routes:** `/admin/applications/[id]?tab=profile`
- **Priority:** P2
- **Test type:** UI e2e
- **Source:** application page line 334; `srp/app/(dashboard)/admin/applications/actions.ts` (`setSaudizationCounting`)
- **Rules:** shown only when the status is `interview` or `accepted`: «هل يُحتسب هذا التعيين ضمن السعودة؟» with «نعم» / «لا» / «لم يُسجَّل» and hint «تسجيل يدوي لأغراض نطاقات فقط — لا يؤثر على درجة الملاءمة بأي حال.» The selection updates immediately and reverts if the save fails; no success text.
- **Acceptance criteria:**
  - **AC-SET-04.1** — *Given* a `new` application, *when* the profile tab renders, *then* the Saudization control is absent; *given* `accepted`, *then* it is present.
  - **AC-SET-04.2** — [KD-02] *Given* an accepted application, *when* hr clicks «نعم», *then* the choice should persist after reload. (Observed in code: `counts_toward_saudization` is not updatable by `authenticated`, so the button flips back with no message.)
  - **AC-SET-04.3** — *Given* any Saudization value, *when* the analysis re-runs, *then* the fit score is unaffected.

#### REQ-SET-05 — Team members and roles
- **Routes:** `/admin/settings`
- **Priority:** P1
- **Test type:** UI e2e; DB-RLS
- **Source:** `srp/components/admin/settings-forms.tsx`; `srp/supabase/migrations/0006_multitenancy.sql:579-606`
- **Rules:** card «فريق التوظيف», hint «أضف أعضاء الفريق وحدّد أدوارهم — الحسابات الجديدة تدخل مباشرة.»; table «العضو» / «الدور», listing only members with a `profiles` row. Own row: badge + «(أنت)», not editable. Other rows: role select (viewer / hr / admin, plus owner when you are an owner or the row is an owner) and «حفظ»; success = a check icon only; failure «تعذّر تحديث الدور»; admin choosing owner «المالك وحده يستطيع تعيين مالك آخر». No remove-member button.
- **Acceptance criteria:**
  - **AC-SET-05.1** — *Given* the owner, *when* they change hr to viewer and press «حفظ», *then* a check appears and the hr user's next request is read-only.
  - **AC-SET-05.2** — *Given* the owner's own row, *when* the table renders, *then* it shows «(أنت)» and no select.
  - **AC-SET-05.3** — [PERM] *Given* an admin, *when* the table renders, *then* the owner option is absent except on an owner's row.

#### REQ-SET-06 — Manual account creation
- **Routes:** `/admin/settings`; Edge `manage-users` action `create`
- **Priority:** P2
- **Test type:** UI e2e; API
- **Source:** `srp/supabase/functions/manage-users/index.ts:209-267`
- **Rules:** collapsible «إنشاء حساب بكلمة مرور مؤقتة» (hint «استخدمه فقط إذا تعذّر وصول البريد للعضو.»); form «إضافة عضو جديد»: full name 2–120, email, temporary password 8–72 (hint «8 أحرف على الأقل — شاركها مع العضو ليغيّرها لاحقاً.»), role **hr or admin only**. Button «إنشاء الحساب» (pending «جارٍ الإنشاء…»); success «تم إنشاء الحساب بنجاح»; invalid «تحقق من الحقول: بريد صحيح وكلمة مرور 8 أحرف على الأقل واسم كامل»; already a member, or existing but not found within the first 4,000 auth users, «هذا البريد مسجّل مسبقاً»; other «تعذّر إنشاء الحساب، حاول مرة أخرى». Accounts are created already confirmed. An email belonging to an account elsewhere gets a membership **without** changing its password or profile.
- **Acceptance criteria:**
  - **AC-SET-06.1** — *Given* a new email and valid fields, *when* «إنشاء الحساب» is pressed, *then* «تم إنشاء الحساب بنجاح» is shown and the account can sign in at once with the temporary password.
  - **AC-SET-06.2** — [NEG] *Given* `hr@example.com`, *when* created again, *then* «هذا البريد مسجّل مسبقاً» is shown.
  - **AC-SET-06.3** — [NEG] *Given* a 7-character password, *when* submitted, *then* «تحقق من الحقول: بريد صحيح وكلمة مرور 8 أحرف على الأقل واسم كامل» is shown.
  - **AC-SET-06.4** — [KD-10] *Given* `seeker@example.com` (an account with no `public.profiles` row), *when* it is created as hr, *then* that user should reach `/admin`. (Observed in code: a membership is added without a profile, so `getSession` fails and the user is sent to `/onboarding`; they are also missing from the team table.)

### F-TRANS-01 — Transparency report (P1, D24)

#### REQ-TRANS-01 — Export and content
- **Routes:** `GET /admin/applications/[id]/transparency`; RPC `application_transparency_report`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** `srp/app/(dashboard)/admin/applications/[id]/transparency/route.ts`; `srp/supabase/migrations/0015_transparency_report.sql`
- **Rules:**
  - The button «تصدير تقرير الشفافية» has the `download` attribute. Response `text/html`, `Content-Disposition: attachment; filename="transparency-{ref_code}.html"`, `Cache-Control: no-store, private`. Any role, viewer included.
  - Content: title «تقرير شفافية التقييم», «تاريخ إصدار التقرير»; the advisory notice (REQ-ETH-01); applicant table «رمز الطلب», «المتقدم», «الوظيفة», «تاريخ التقديم», «الحالة الحالية»; section «التقييم الآلي» with `{score} / 100`, «تفصيل الدرجة», «التبرير» («نقاط القوة» / «الفجوات» / «ملاحظات للاستيضاح»), «النموذج», «إصدار الموجّه», «تاريخ التقييم» — or «لم يُجرَ تقييم آلي لهذا الطلب.»; trail «سجل القرارات البشرية»: rows `from ← to`, the changer's name or «النظام», «قرار بشري» or «—», the note.
  - Dates use `toLocaleString("ar-SA")` (may print Hijri dates; OQ-22).
- **Acceptance criteria:**
  - **AC-TRANS-01.1** — *Given* an analysed application moved to «قيد المراجعة» by hr, *when* the viewer clicks «تصدير تقرير الشفافية», *then* a file `transparency-{ref}.html` downloads containing the advisory notice, the score over 100, the justification lists, and a trail with «النظام» for the first row and «قرار بشري» for the hr change.
  - **AC-TRANS-01.2** — *Given* an unanalysed application, *when* exported, *then* it contains «لم يُجرَ تقييم آلي لهذا الطلب.»
  - **AC-TRANS-01.3** — [KD-11] *Given* the trail, *when* its column headers are read, *then* they should describe the change date and transition. (Observed in code: the date column is labelled «تاريخ التقييم» and the transition column «الحالة الحالية».)

#### REQ-TRANS-02 — Report access errors
- **Routes:** `GET /admin/applications/[id]/transparency`
- **Priority:** P1
- **Test type:** API
- **Source:** transparency route; `srp/lib/auth.ts:144-148`
- **Rules:** signed out → `/login`; signed in without a membership → `/onboarding`; another org's, unknown or non-UUID id → the RPC raises and the route returns **HTTP 500** `{"error":"report_failed"}`; a null result → 404 `{"error":"not_found"}`.
- **Acceptance criteria:**
  - **AC-TRANS-02.1** — [API][PERM][NEG] *Given* the seed hr session, *when* it requests the report of an Org B application, *then* the reply is 500 `{"error":"report_failed"}` and contains no Org B data.
  - **AC-TRANS-02.2** — [API][NEG] *Given* a signed-out request, *when* sent, *then* it redirects to `/login`.

### F-RET-01 — Daily housekeeping and retention (P1, D8)

#### REQ-RET-01 — Automatic analysis retries
- **Routes:** Edge `housekeeping` (pg_cron 03:00 UTC)
- **Priority:** P1
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/functions/housekeeping/index.ts:46-100`; `srp/supabase/migrations/0012_security_hardening.sql:13-47`
- **Rules:** scheduled only when `app.housekeeping_url` and `app.housekeeping_key` exist. At most `RETRY_CAP = 10` retries per run in total, each `analyze-application {force:true}` with the service role: `failed` with attempts < 3 (oldest first); `pending` older than 15 minutes; `processing` whose **`created_at`** is older than 1 hour. Response counters only: `{retried, deleted_applications, deleted_files, erased_interviews, errors}`.
- **Acceptance criteria:**
  - **AC-RET-01.1** — [API] *Given* a failed application with 1 attempt and a working model, *when* housekeeping runs, *then* it becomes `done` and `retried` ≥ 1.
  - **AC-RET-01.2** — [API] *Given* a failed application with 3 attempts, *when* housekeeping runs, *then* it is not retried.
  - **AC-RET-01.3** — [API] *Given* 15 eligible failed applications, *when* housekeeping runs once, *then* exactly 10 are retried.

#### REQ-RET-02 — Retention deletion per organization
- **Routes:** Edge `housekeeping`
- **Priority:** P1
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/functions/housekeeping/index.ts:102-188`
- **Rules:** per org (soft-deleted orgs included), cutoff = now − `retention_months`; up to 500 applications per org per run. Interviews with an agent id are first erased on the agent (`DELETE /v1/platform/interviews/{id}`); if the agent is not configured or the call fails, that application is **kept** and counted as an error. Then the CV files are removed and the applications hard-deleted — the only hard-delete path (D9); evaluations, history and interview rows cascade. `/track/{ref}` then shows "not found".
- **Acceptance criteria:**
  - **AC-RET-02.1** — [API] *Given* retention 1 month and an application created 40 days ago, *when* housekeeping runs, *then* the application, its evaluation, history and CV object are gone, and `/track/{ref}` shows «لم نعثر على طلب بهذا الرمز».
  - **AC-RET-02.2** — [API] *Given* an application within the retention period, *when* housekeeping runs, *then* it remains.
  - **AC-RET-02.3** — [API] *Given* an expired application with a bound interview and the agent unreachable, *when* housekeeping runs, *then* the application remains and `errors` ≥ 1.

#### REQ-RET-03 — Orphan files and throttle log cleanup
- **Routes:** Edge `housekeeping`
- **Priority:** P2
- **Test type:** API
- **Source:** `srp/supabase/functions/housekeeping/index.ts`
- **Rules:** lists `cvs/{org_id}/` (1000 objects) and removes objects older than the cutoff that no application references; deletes `submission_attempts` older than 24 hours. It does **not** clean `talent.upload_attempts`, `interview_webhook_events`, `analysis_usage` or `talent-cvs`.
- **Acceptance criteria:**
  - **AC-RET-03.1** — [API] *Given* an unreferenced CV object older than the cutoff, *when* housekeeping runs, *then* it is removed.
  - **AC-RET-03.2** — [DB] *Given* throttle rows older than 24 h, *when* housekeeping runs, *then* they are deleted.


### 5.7 Virtual interview — question bank and interview set-up (I0 + I1)

Everything in this area runs through the Edge Function `interview-gateway`, the platform's only door to the separate interview agent (D30). With the seed data (`monthly_interview_quota = 0`) every costly action returns 402 and the UI shows the "not in plan" alert; set the quota by SQL to test the rest (§3.3). Nothing in this area changes an application's status or shows a score (REQ-VINT-11). In this area the read-only role message reads «صلاحيتك في هذه المنشأة للاطلاع فقط.» (different from the jobs page wording).

### F-BANK-01 — Job core question bank (P1)

#### REQ-BANK-01 — Bank page access, header and alerts
- **Routes:** `/admin/jobs/[id]/interview-bank`; entry button «بنك أسئلة المقابلة» on `/admin/jobs/[id]/applicants`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/jobs/[id]/interview-bank/page.tsx:81-185`; `srp/lib/i18n/ar.ts:1786-1875`
- **Rules:**
  - Any member of the **active** org may open it; owner, admin and hr can write; a viewer reads only and sees «صلاحيتك في هذه المنشأة للاطلاع فقط.» Signed out → `/login`; no membership → `/onboarding`; non-UUID, another org's or a soft-deleted job → 404.
  - Reads (each with an explicit `org_id` filter plus RLS): the job, up to 50 bank versions (newest first), the org's `monthly_interview_quota`. The bank on screen is the newest version that is not `superseded`; its questions come from the gateway `bank_get`.
  - Tab title «بنك أسئلة المقابلة». Back link «المتقدمون» → `/admin/jobs/{id}/applicants`. Heading `بنك أسئلة المقابلة: {job title}`. With a bank: «النسخة» + number + status badge: `generating` «قيد التوليد», `awaiting_review` «بانتظار المراجعة», `locked` «مقفل», `failed` «تعذّر التوليد», `superseded` «استُبدلت بنسخة أحدث».
  - `bank_get` failure → destructive alert «تعذّر عرض أسئلة البنك الآن.» with the mapped error. In `awaiting_review` it is the only content; in `locked` the summary comes from the platform row without the question list.
  - An older locked version while the shown version is not locked → info `النسخة {version} المعتمدة تبقى سارية للمقابلات الجديدة حتى تُقفل هذه النسخة.`
- **Acceptance criteria:**
  - **AC-BANK-01.1** — *Given* hr on the applicants page, *when* «بنك أسئلة المقابلة» is pressed, *then* the bank page opens with the heading `بنك أسئلة المقابلة: {job title}` and the back link «المتقدمون».
  - **AC-BANK-01.2** — [PERM] *Given* a viewer, *when* the bank page opens, *then* «صلاحيتك في هذه المنشأة للاطلاع فقط.» is shown and no generate, edit or lock control is present.
  - **AC-BANK-01.3** — [PERM][NEG] *Given* an Org B job id or a soft-deleted job, *when* the bank page opens, *then* the 404 page is shown.
  - **AC-BANK-01.4** — [STATE] *Given* a bank in `awaiting_review` and the agent unreachable, *when* the page loads, *then* «تعذّر عرض أسئلة البنك الآن.» and «تعذّر الوصول إلى خدمة المقابلات أو تأخر ردها. حدّث الصفحة لترى آخر حالة، ثم أعد المحاولة إن لزم.» are shown.

#### REQ-BANK-02 — No bank yet, and the "not in plan" state
- **Routes:** `/admin/jobs/[id]/interview-bank`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** interview-bank page lines 122-125, 188-211, 273-281
- **Rules:**
  - Card «البنك الأساسي للوظيفة», body «مجموعة أسئلة تُولَّد مرة واحدة لهذه الوظيفة من متطلباتها، فتراجعها سؤالاً سؤالاً ثم تقفلها. بعد القفل تُبنى عليها كل مقابلة افتراضية لهذه الوظيفة، فيُقارَن المتقدمون على البنية نفسها، وتُضاف لكل متقدم أسئلة استيضاح قليلة من سيرته.», steps «التوليد: من عنوان الوظيفة ومتطلباتها ومهاراتها.» / «المراجعة: تعتمد كل سؤال أو تعدّله أو تحذفه أو تولّد بديلاً عنه.» / «القفل: لا يتغير البنك بعده، وأي تغيير لاحق ينشئ نسخة جديدة تراجعها من جديد.», fairness note «تُستبعد آلياً الأسئلة العامة وأي سؤال يمسّ العمر أو الحالة الاجتماعية أو الجنسية أو الدين أو الصحة، ويبقى قرار اعتماد كل سؤال لك.»
  - Quota = 0 (a failed quota read also counts as 0) → info alert «المقابلات الافتراضية غير مفعّلة في باقتك» / «تحتاج المقابلات الافتراضية إلى باقة تتضمنها. تواصل معنا لتفعيلها.», shown to viewers too; this replaces Generate, Retry and New version. Otherwise writers see «توليد بنك الأسئلة».
  - NULL and positive quotas look identical; no UI shows used or remaining interviews.
- **Acceptance criteria:**
  - **AC-BANK-02.1** — [STATE] *Given* the seed org (quota 0), *when* the owner opens a job's bank page, *then* «المقابلات الافتراضية غير مفعّلة في باقتك» is shown and «توليد بنك الأسئلة» is not.
  - **AC-BANK-02.2** — *Given* quota 5, *when* hr opens a job with no bank, *then* «البنك الأساسي للوظيفة», the three steps, the fairness note and «توليد بنك الأسئلة» are shown.

#### REQ-BANK-03 — Generating a bank or a new version
- **Routes:** `/admin/jobs/[id]/interview-bank`; gateway `bank_create`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** `srp/components/admin/interview-bank/bank-actions.tsx:16-56`; `srp/app/(dashboard)/admin/interviews/actions.ts:90-108`; `srp/supabase/functions/interview-gateway/index.ts:393-557`; `interview-agent/src/contract/index.ts:105-115`
- **Rules:**
  - Buttons «توليد بنك الأسئلة», or «إنشاء نسخة جديدة» (outline) from the locked state; pending «جارٍ الطلب…»; errors inline under the button (`role=alert`); the page is revalidated either way.
  - Checks in order: writer role (else «صلاحيتك في هذه المنشأة للاطلاع فقط.»); job UUID in the active org and not deleted (else `not_found`); gateway `can_manage_job` (else 404); cost gate — org not `trial`/`active` or deleted → 403 `organization_inactive`, quota 0 → 402 `interviews_not_in_plan`; job fits the contract (title 1–200, location ≤ 200, min years 0–60, ≤ 50 skills of 1–80, requirements 1–20,000, description ≤ 20,000) else 422 `job_unusable`; unacknowledged `generating` rows older than 2 minutes are marked `failed` / `agent_unreachable`; a version already `generating` or `awaiting_review` → 409 `bank_in_progress`; insert failure → 500 `insert_failed`.
  - An agent refusal marks the new row `failed` with `last_error = code` and returns the code, so the inline error and (after refresh) the failed card show the same text. Agent codes: 503 `llm_not_configured`, 402 `interviews_not_in_plan`, 409 `bank_in_progress`, 429 `rate_limited` (10 generation starts per tenant per UTC day); network failure `agent_unreachable`; other non-2xx `agent_refused`.
  - Success: a row with status `generating`; the page shows the generating state. The agent targets 24 questions (warm-up 2, technical 12, behavioral 6, situational 4) and needs at least 15 after filtering (≥ 1 warm-up, ≥ 6 technical, ≥ 4 behavioral + situational), with 2 attempts.
  - Messages: `organization_inactive` «حساب منشأتك غير نشط حالياً، فلا يمكن بدء ما يستهلك رصيد المقابلات.»; `interviews_not_in_plan` «المقابلات الافتراضية غير مفعّلة في باقتك.»; `job_unusable` «بيانات الوظيفة لا تكفي لتوليد الأسئلة: تأكد من وجود عنوان ومتطلبات واضحة، وأن الوصف والمتطلبات ضمن الطول المسموح.»; `bank_in_progress` «توجد نسخة من بنك الأسئلة قيد التوليد أو المراجعة لهذه الوظيفة. أكملها أولاً.»; `rate_limited` «بلغت منشأتك الحد اليومي لتوليد بنوك الأسئلة. أعد المحاولة غداً.»; `llm_not_configured` «نموذج توليد الأسئلة غير مهيّأ في خدمة المقابلات حالياً. تواصل مع الدعم.»; `insert_failed` «تعذّر حفظ الطلب. أعد المحاولة.»; `not_found` «لم نجد هذا العنصر، أو لم يعد متاحاً لك.»
- **Acceptance criteria:**
  - **AC-BANK-03.1** — *Given* quota 5 and a reachable agent with a model key, *when* hr presses «توليد بنك الأسئلة», *then* the page shows «نولّد بنك الأسئلة الآن» and version 1 with «قيد التوليد».
  - **AC-BANK-03.2** — [NEG] *Given* a job whose requirements are empty, *when* generation is requested, *then* «بيانات الوظيفة لا تكفي لتوليد الأسئلة: تأكد من وجود عنوان ومتطلبات واضحة، وأن الوصف والمتطلبات ضمن الطول المسموح.» is shown.
  - **AC-BANK-03.3** — [NEG] *Given* two tabs, *when* both press generate, *then* the second shows «توجد نسخة من بنك الأسئلة قيد التوليد أو المراجعة لهذه الوظيفة. أكملها أولاً.»
  - **AC-BANK-03.4** — [NEG] *Given* an org set to `suspended` with quota 5, *when* hr generates, *then* «حساب منشأتك غير نشط حالياً، فلا يمكن بدء ما يستهلك رصيد المقابلات.» is shown.
  - **AC-BANK-03.5** — [API][PERM][NEG] *Given* a viewer's JWT, *when* it calls the gateway `bank_create` directly, *then* the reply is 404 `not_found`.
  - **AC-BANK-03.6** — [NEG] *Given* 10 generation starts by one org in the current UTC day, *when* an 11th is requested, *then* «بلغت منشأتك الحد اليومي لتوليد بنوك الأسئلة. أعد المحاولة غداً.» is shown.

#### REQ-BANK-04 — Generating state and polling
- **Routes:** `/admin/jobs/[id]/interview-bank`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** interview-bank page lines 214-233; `srp/components/admin/interview-bank/auto-refresh.tsx:10-17`
- **Rules:** spinner (`role=status`) «نولّد بنك الأسئلة الآن» / «قد يستغرق ذلك دقيقة تقريباً. تتحدث الصفحة تلقائياً عند الانتهاء.»; `router.refresh()` every 4,000 ms only while the tab is visible; each refresh calls `bank_get`, which syncs the row from the agent. Banks emit no webhooks. A row stuck `generating` with no agent id for more than 2 minutes shows the failed card with the unreachable text on the next load.
- **Acceptance criteria:**
  - **AC-BANK-04.1** — [STATE] *Given* a generating bank, *when* the agent finishes, *then* the page switches to the review state without a manual reload.
  - **AC-BANK-04.2** — [STATE] *Given* the tab hidden, *when* 20 s pass, *then* no refresh requests are made until it is visible again.
  - **AC-BANK-04.3** — [STATE] *Given* a bank row created while the agent was down (no agent id) more than 2 minutes ago, *when* the page loads, *then* the failed card shows «تعذّر توليد بنك الأسئلة» with «تعذّر الوصول إلى خدمة المقابلات أو تأخر ردها. حدّث الصفحة لترى آخر حالة، ثم أعد المحاولة إن لزم.»

#### REQ-BANK-05 — Failed bank and retry
- **Routes:** `/admin/jobs/[id]/interview-bank`; gateway `bank_retry`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** interview-bank page lines 236-250; `bank-actions.tsx:58-82`; `interviews/actions.ts:148-159`; gateway lines 646-703
- **Rules:**
  - Destructive alert «تعذّر توليد بنك الأسئلة» with the mapped failure; writers get «إعادة المحاولة» (or the not-in-plan alert at quota 0).
  - Planner failure messages: `insufficient_questions` «لم يُنتج التوليد عدداً كافياً من الأسئلة الصالحة بعد التصفية. أعد المحاولة.»; `invalid_output` «أعاد النموذج مخرجات غير صالحة فلم يُحفظ منها شيء. أعد المحاولة.»; `model_error` «تعذّر الوصول إلى نموذج التوليد. أعد المحاولة بعد قليل.»; `budget_exceeded` «بلغ التوليد سقف الاستهلاك المسموح فتوقف. أعد المحاولة، وإن تكرر فتواصل مع الدعم.»; `aborted` «توقف التوليد قبل اكتماله. أعد المحاولة.»
  - Retry only from `failed` (else 409 `invalid_transition` «لا تسمح الحالة الحالية بهذا الإجراء. حدّث الصفحة لترى آخر حالة.»); the cost gate applies. A row the agent never acknowledged → the **next version** is created as a new row (the failed row stays in history). Otherwise the row moves to `generating` (race → `bank_in_progress`) and the agent's retry counts toward the daily limit; on refusal the row is re-synced or restored to `failed`.
- **Acceptance criteria:**
  - **AC-BANK-05.1** — [STATE] *Given* a bank failed with `insufficient_questions`, *when* the page loads, *then* «تعذّر توليد بنك الأسئلة» and «لم يُنتج التوليد عدداً كافياً من الأسئلة الصالحة بعد التصفية. أعد المحاولة.» are shown with «إعادة المحاولة».
  - **AC-BANK-05.2** — *Given* a failed, unacknowledged version 1, *when* «إعادة المحاولة» is pressed with the agent back up, *then* version 2 is created and «سجل النسخ» lists version 1 as «تعذّر التوليد».
  - **AC-BANK-05.3** — [API][NEG] *Given* a bank in `awaiting_review`, *when* `bank_retry` is called, *then* the reply is 409 `invalid_transition`.

#### REQ-BANK-06 — Review summary and question list
- **Routes:** `/admin/jobs/[id]/interview-bank` (status `awaiting_review`)
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** interview-bank page lines 283-331; `srp/components/admin/interview-bank/question-list.tsx:13-58`; `helpers.ts:52-101`
- **Rules:**
  - Card «مراجعة البنك», hint «راجع كل سؤال: اعتمده كما هو، أو عدّله، أو احذفه، أو ولّد بديلاً عنه. مراجعة البنك الأساسي إلزامية قبل استخدامه في أي مقابلة.»; counters «بانتظار المراجعة» / «معتمد» / «محذوف»; line `المعتمد حسب النوع: تمهيدي {warmup} · تقني {technical} · سلوكي وموقفي {behavioral}` (situational counts as behavioral).
  - Groups in order «التمهيد», «الأسئلة التقنية», «الأسئلة السلوكية والموقفية», «أسئلة الاستيضاح», «أسئلة أخرى», each with a count in parentheses. Numbering is continuous across groups; within a group by position; a removed question sorts after the replacement that took its position.
- **Acceptance criteria:**
  - **AC-BANK-06.1** — *Given* a generated bank, *when* the review state renders, *then* the three counters add up to the number of questions and the groups appear in the order above.
  - **AC-BANK-06.2** — *Given* 2 approved situational and 3 approved behavioral questions, *when* the summary renders, *then* «سلوكي وموقفي» shows 5.

#### REQ-BANK-07 — Question cards and review actions
- **Routes:** `/admin/jobs/[id]/interview-bank`; gateway `bank_edit`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/interview-bank/question-card.tsx:83-297`; `interview-agent/src/api/review.ts:33-70`; `interview-agent/src/api/job-banks.ts:41-47,100-152`
- **Rules:**
  - Card: number; kind badge تمهيدي / تقني / سلوكي / موقفي / استيضاح / برمجي; status badge «بانتظار المراجعة» / «معتمد» / «محذوف»; «معدَّل» when edited; «بديل مولَّد» when it replaces another. Text = staff version if any, else the model's. Removed = struck through on a muted background.
  - Details: «الكفاءة»; «المستوى» أساسي / متوسط / متقدم; «الحد الزمني» «بلا حد», `{n} ثانية`, `{n} دقيقة`, `{n} دقائق` (3–10 minutes), «دقيقتان»; «المتابعة» «بلا متابعة» / «متابعة عند الإجابة المبهمة» / «متابعة للتحقق من ادعاء»; «ما تتضمنه الإجابة الجيدة» list; collapsible `معايير التقييم ({n})` with `الوزن {n}` and «ممتاز» / «مقبول» / «ضعيف». A warm-up shows «سؤال تمهيدي لا يُقيَّم، يفتتح المقابلة فقط.» instead. An edited card has «عرض النص الأصلي» labelled «ما ولّده النموذج».
  - Buttons (writers, bank not locked): `pending` → «اعتماد», «تعديل», `ولّد بديلاً (متبقٍ {n})`, «حذف»; `approved` → «تعديل», `ولّد بديلاً (متبقٍ {n})`, «حذف»; `removed` → «استعادة» only. While an action runs every button on that card is disabled and «جارٍ الحفظ…» or «جارٍ توليد البديل…» shows; a refusal appears in red under the card (`role=alert`).
  - Agent effects: approve → `approved` (removed → 409 `question_not_editable`); remove → `removed`; restore → `removed` → `pending`; edit stores staff content separately and sets `approved` (the model's original never changes; removed → `question_not_editable`; kind change → 422 `kind_mismatch`). Bank locked → 409 `bank_locked`; other non-review state → 409 `invalid_transition`.
  - Messages: `question_not_editable` «لا يمكن تعديل سؤال محذوف. استعده أولاً.»; `kind_mismatch` «لا يمكن تغيير نوع السؤال عند تعديله.»; `bank_locked` «هذه الأسئلة مقفلة ولا تقبل تعديلاً. لتغيير بنك الوظيفة أنشئ نسخة جديدة.»
- **Acceptance criteria:**
  - **AC-BANK-07.1** — *Given* a pending question, *when* «اعتماد» is pressed, *then* its badge becomes «معتمد», the «اعتماد» button disappears, and the counters update.
  - **AC-BANK-07.2** — *Given* an approved question, *when* «حذف» is pressed, *then* it shows «محذوف», struck through, with only «استعادة».
  - **AC-BANK-07.3** — *Given* a removed question, *when* «استعادة» is pressed, *then* it returns to «بانتظار المراجعة».
  - **AC-BANK-07.4** — [NEG] *Given* one tab locked the bank, *when* another tab edits a question, *then* «هذه الأسئلة مقفلة ولا تقبل تعديلاً. لتغيير بنك الوظيفة أنشئ نسخة جديدة.» is shown under the card.
  - **AC-BANK-07.5** — *Given* a warm-up question, *when* its card renders, *then* «سؤال تمهيدي لا يُقيَّم، يفتتح المقابلة فقط.» replaces the rubric.

#### REQ-BANK-08 — Editing a question
- **Routes:** `/admin/jobs/[id]/interview-bank`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `question-card.tsx:299-419`; `srp/lib/interviews.ts:51-94`; `interviews/actions.ts:118-121`
- **Rules:**
  - Fields: «نص السؤال» (required, minLength 8, maxLength 600); «الكفاءة (المتطلب الذي يختبره السؤال)» (required, maxLength 120); «المستوى» (1 / 2 / 3); «ما تتضمنه الإجابة الجيدة — نقطة في كل سطر، حتى 6 نقاط» (required; blank lines dropped); «الحد الزمني بالثواني (30–1200، اتركه فارغاً لبلا حد)» (number 30–1200, step 1; empty = no limit). Note «تبقى معايير التقييم كما هي، ويُحفظ تعديلك منفصلاً عن النص الأصلي.» Buttons «حفظ واعتماد» (pending «جارٍ الحفظ…») and «إلغاء». Kind, rubric and follow-up policy are copied unchanged. Several cards may be in edit mode at once.
  - Server re-validation: text 8–600, competency 1–120, 1–6 points of ≤ 300 characters each, time limit an integer 30–1200 or null. Failure → `invalid_edit`: «راجع التعديل: النص من 8 إلى 600 حرف، والكفاءة حتى 120 حرفاً، ومن نقطة إلى 6 نقاط متوقعة (300 حرف لكل نقطة)، والحد الزمني بين 30 و1200 ثانية أو فارغ.»
  - Breaking `required`, `minLength` or `min`/`max` triggers the browser's native bubble, whose wording is not from ar.ts (do not assert its text).
- **Acceptance criteria:**
  - **AC-BANK-08.1** — *Given* a valid edit, *when* «حفظ واعتماد» is pressed, *then* the card shows the new text, «معتمد» and «معدَّل», and «عرض النص الأصلي» reveals the model's text under «ما ولّده النموذج».
  - **AC-BANK-08.2** — [NEG] *Given* 7 point lines, or one point over 300 characters, or a time limit of 45.5, *when* saved, *then* the `invalid_edit` message is shown and the question is unchanged.
  - **AC-BANK-08.3** — *Given* the time limit left empty, *when* saved, *then* «الحد الزمني» shows «بلا حد».
  - **AC-BANK-08.4** — *Given* a time limit of 120, *when* saved, *then* «الحد الزمني» shows «دقيقتان».

#### REQ-BANK-09 — Content filters on edits (fairness)
- **Routes:** `/admin/jobs/[id]/interview-bank`, `/admin/applications/[id]?tab=interview` (gap-probe edits)
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `interview-agent/src/planner/validate.ts:119-341,398-413`; `interview-agent/src/api/review.ts:57-59`
- **Rules:**
  - Every staff edit passes the same filters as generated questions, over the text, competency, expected points and rubric.
  - Protected categories: age (including graduation-year questions), marital/family, origin/nationality/tribe, religion, health/disability, gender, politics, address → 422 `protected_category`: «التعديل يمسّ موضوعاً محمياً كالعمر أو الحالة الاجتماعية أو الجنسية أو الدين أو الصحة. أعد صياغة السؤال حول متطلبات الوظيفة.»
  - Allowed technical phrases, e.g. «race condition», «توزيع الحمل», «عمر الجلسة», «زوج المفاتيح», «التحقق من صحة», «صحة البيانات».
  - Generic questions ("tell me about yourself", strengths/weaknesses, "why hire you", "where do you see yourself", "why work here", in Arabic and English) → 422 `generic_question`: «السؤال عام لا يختبر متطلباً محدداً في الوظيفة. اربطه بمهارة أو موقف من صميم العمل.»
- **Acceptance criteria:**
  - **AC-BANK-09.1** — [NEG] *Given* an edit to «كم عمرك؟» or «ما حالتك الاجتماعية؟», *when* saved, *then* the `protected_category` message is shown and the question is unchanged.
  - **AC-BANK-09.2** — *Given* an edit to «كيف تتحقق من صحة البيانات قبل حفظها؟», *when* saved, *then* it is accepted.
  - **AC-BANK-09.3** — [NEG] *Given* an edit to «حدثنا عن نفسك», *when* saved, *then* «السؤال عام لا يختبر متطلباً محدداً في الوظيفة. اربطه بمهارة أو موقف من صميم العمل.» is shown.

#### REQ-BANK-10 — Regenerating a question
- **Routes:** `/admin/jobs/[id]/interview-bank`; gateway `bank_edit` (op `regenerate`)
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** gateway lines 622-630; `interview-agent/src/api/review.ts:87-133`; `interview-agent/src/orchestrator/budget.ts:10-20,177-185`
- **Rules:** the cost gate applies first (403 `organization_inactive` / 402 `interviews_not_in_plan`). Agent: 503 `llm_not_configured`; removed → 409 `question_not_editable`; out of regenerations → 429 `regeneration_limit` «استُنفد عدد مرات توليد البدائل المتاح هنا.»; model failure or a filtered-out replacement → 502 `generation_failed` «تعذّر توليد بديل مناسب هذه المرة، وبقي السؤال كما كان. أعد المحاولة.» On success the old question becomes `removed` (still visible) and a new `pending` one takes its position with «بديل مولَّد»; the replacement must differ from every existing text. Counter `متبقٍ {n}`: job bank `min(15 − used, 20 − model calls used)`; disabled at 0. Timeouts: agent 45 s, gateway PATCH 55 s, Next.js 65 s. Regenerate is not idempotency-keyed: a retry spends another regeneration.
- **Acceptance criteria:**
  - **AC-BANK-10.1** — *Given* a pending question, *when* «ولّد بديلاً» is pressed, *then* the old one shows «محذوف», a new card with «بديل مولَّد» and «بانتظار المراجعة» takes its place, and the counter drops by one.
  - **AC-BANK-10.2** — [STATE] *Given* the counter at 0, *when* the card renders, *then* the regenerate button is disabled.
  - **AC-BANK-10.3** — [NEG] *Given* quota set back to 0 while a bank is in review, *when* «ولّد بديلاً» is pressed, *then* «المقابلات الافتراضية غير مفعّلة في باقتك.» is shown, while approve, edit, remove and lock still work.

#### REQ-BANK-11 — Locking the bank
- **Routes:** `/admin/jobs/[id]/interview-bank`; gateway `bank_lock`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** `lock-bank-button.tsx`; `confirm-button.tsx:46-88`; interview-bank page lines 287-320; `interview-agent/src/api/job-banks.ts:157-186`; gateway lines 732-743; `interviews/actions.ts:140-145`
- **Rules:**
  - Button «اعتماد البنك وقفله» (pending «جارٍ القفل…»), disabled on the client with a reason line; pending questions take precedence: `لا يمكن القفل قبل مراجعة كل الأسئلة: بقي {n} بانتظار المراجعة.`; else approved < 6: `يحتاج القفل إلى {min} أسئلة معتمدة على الأقل، والمعتمد الآن {n}.` (min = 6).
  - Dialog «اعتماد البنك وقفله؟» / «بعد القفل لا يتغير هذا البنك أبداً، وتُبنى عليه كل مقابلة افتراضية لهذه الوظيفة. أي تغيير لاحق ينشئ نسخة جديدة تراجعها من جديد.» / «اعتماد وقفل» / «تراجع». It cannot be dismissed while the action runs; errors show under the button.
  - Server: 409 `pending_questions` «بقيت أسئلة بانتظار المراجعة. اعتمد كل سؤال أو احذفه قبل القفل.»; 409 `too_few_questions` «يحتاج القفل إلى 6 أسئلة معتمدة على الأقل.»; 409 `invalid_transition` when not in review; locking a locked bank is idempotent. No per-kind mix is checked here (it is checked at interview create).
  - On success: the agent computes `bank_hash`; older locked versions of the job become `superseded`; Next.js revalidates the bank page and every applicant page.
- **Acceptance criteria:**
  - **AC-BANK-11.1** — [STATE] *Given* 1 pending question, *when* the review renders, *then* the lock button is disabled with `لا يمكن القفل قبل مراجعة كل الأسئلة: بقي 1 بانتظار المراجعة.`
  - **AC-BANK-11.2** — [STATE] *Given* 0 pending and 5 approved, *when* the review renders, *then* the button is disabled with `يحتاج القفل إلى 6 أسئلة معتمدة على الأقل، والمعتمد الآن 5.`
  - **AC-BANK-11.3** — *Given* 0 pending and ≥ 6 approved, *when* «اعتماد البنك وقفله» → «اعتماد وقفل» is confirmed, *then* the locked view appears.
  - **AC-BANK-11.4** — [API][NEG] *Given* a crafted `bank_lock` with 5 approved, *when* sent, *then* the reply is 409 `too_few_questions`.
  - **AC-BANK-11.5** — *Given* a lock double-click, *when* both requests finish, *then* the bank is locked once with one hash and no error is shown.

#### REQ-BANK-12 — Locked view, versions and history
- **Routes:** `/admin/jobs/[id]/interview-bank`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** interview-bank page lines 333-454; `helpers.ts:26-28`
- **Rules:** title «البنك معتمد ومقفل»; «النسخة», «البصمة» (first 12 hex characters, LTR, full hash as tooltip), «تاريخ القفل» (or «—»), «الأسئلة المعتمدة», the by-kind line; hint «النسخة المقفلة لا تتغير. لتعديل الأسئلة أنشئ نسخة جديدة وراجعها، وتبقى هذه سارية حتى تُقفل الجديدة.»; writers get «إنشاء نسخة جديدة» (or the not-in-plan alert at quota 0); a read-only list of **approved questions only**. History «سجل النسخ» only with more than one version (at most 50 rows): columns «النسخة» / «الحالة» / «تاريخ الإنشاء» / «البصمة» (12 characters or «—»). A locked bank stays in effect until a newer version locks.
- **Acceptance criteria:**
  - **AC-BANK-12.1** — *Given* a locked bank, *when* the page renders, *then* «البنك معتمد ومقفل» is shown, «البصمة» shows 12 hex characters with the full hash in its tooltip, and removed questions are not listed.
  - **AC-BANK-12.2** — *Given* v1 locked and v2 created, *when* the page renders, *then* the info alert `النسخة 1 المعتمدة تبقى سارية للمقابلات الجديدة حتى تُقفل هذه النسخة.` is shown.
  - **AC-BANK-12.3** — *Given* v2 then locked, *when* the page renders, *then* «سجل النسخ» lists v1 as «استُبدلت بنسخة أحدث» and v2 as «مقفل».
  - **AC-BANK-12.4** — *Given* only one version, *when* the page renders, *then* «سجل النسخ» is not shown.

### F-VINT-01 — Virtual-interview panel on the application page (P1)

#### REQ-VINT-01 — Panel header, reads and status badge
- **Routes:** `/admin/applications/[id]?tab=interview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/virtual-interview/virtual-interview-panel.tsx:27-139`; `srp/lib/interviews.ts:362-442`
- **Rules:**
  - Placed above the manual interview card. Reads (org-filtered): the org's quota (failed read = 0), the job's newest locked bank (`superseded` excluded), the application's newest assignment. A draft is **stale** when unacknowledged and older than 2 minutes. "Live" = not stale and not `cancelled`, `expired` or `failed`.
  - The panel calls the agent (`interview_bank_get`) only for a non-stale, agent-bound, not-yet-locked assignment in `draft`, `planning` or `awaiting_review`; that call also syncs status and lock. A failure shows a destructive alert with the mapped code and no title.
  - Header «المقابلة الافتراضية»; intro «مقابلة أولية نصية مبنية على بنك أسئلة الوظيفة المعتمد، تُضاف إليها أسئلة استيضاح من سيرة المتقدم.» When live: `عدد الأسئلة: {count} · المدة: {minutes} د` (when the stored config parses) and a status badge; when `awaiting_review` and locked, the badge reads «الأسئلة جاهزة».
- **Acceptance criteria:**
  - **AC-VINT-01.1** — *Given* any application, *when* the «المقابلة» tab opens, *then* «المقابلة الافتراضية» is shown above the manual interview card.
  - **AC-VINT-01.2** — *Given* an interview created with the default mix, *when* the panel renders, *then* it shows `عدد الأسئلة: 10 · المدة: 30 د`.
  - **AC-VINT-01.3** — *Given* an interview in `awaiting_review` whose questions are locked, *when* the panel renders, *then* the badge reads «الأسئلة جاهزة», never «بانتظار المراجعة».

#### REQ-VINT-02 — Preconditions for starting an interview (checked in order)
- **Routes:** `/admin/applications/[id]?tab=interview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `virtual-interview-panel.tsx:283-387`
- **Rules:**
  1. Quota 0 → «المقابلات الافتراضية غير مفعّلة في باقتك» / «تحتاج المقابلات الافتراضية إلى باقة تتضمنها. تواصل معنا لتفعيلها.» (every role).
  2. No locked bank → «اعتمد بنك أسئلة الوظيفة أولاً» / «تُبنى كل مقابلة على البنك المعتمد للوظيفة، ليُقارَن المتقدمون على البنية نفسها.» + «الانتقال إلى بنك الأسئلة» → `/admin/jobs/{jobId}/interview-bank` (viewers too).
  3. Analysis not `done` → «تحتاج المقابلة إلى اكتمال تحليل السيرة الذاتية أولاً، لأن أسئلة الاستيضاح تُبنى عليه.»
  4. Viewer → «لا توجد مقابلة افتراضية لهذا المتقدم.» when there is no earlier assignment, otherwise nothing.
  5. Writer → `تُبنى على النسخة {version} من بنك أسئلة الوظيفة (الأسئلة المعتمدة: {n}).` + the config form.
- **Acceptance criteria:**
  - **AC-VINT-02.1** — [STATE] *Given* the seed org (quota 0), *when* any role opens the tab, *then* «المقابلات الافتراضية غير مفعّلة في باقتك» is shown and no form.
  - **AC-VINT-02.2** — [STATE] *Given* quota 5 and no locked bank, *when* hr opens the tab, *then* «اعتمد بنك أسئلة الوظيفة أولاً» and «الانتقال إلى بنك الأسئلة» are shown.
  - **AC-VINT-02.3** — [STATE] *Given* quota 5, a locked bank, and analysis `failed`, *when* hr opens the tab, *then* «تحتاج المقابلة إلى اكتمال تحليل السيرة الذاتية أولاً، لأن أسئلة الاستيضاح تُبنى عليه.» is shown.
  - **AC-VINT-02.4** — [PERM] *Given* all preconditions met and a viewer, *when* the tab opens, *then* «لا توجد مقابلة افتراضية لهذا المتقدم.» is shown and no form.
  - **AC-VINT-02.5** — *Given* all preconditions met and hr, *when* the tab opens, *then* `تُبنى على النسخة {version} من بنك أسئلة الوظيفة (الأسئلة المعتمدة: {n}).` and «إعداد المقابلة» are shown.

#### REQ-VINT-03 — Interview configuration form
- **Routes:** `/admin/applications/[id]?tab=interview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/virtual-interview/interview-config-form.tsx:26-295`
- **Rules:**

  | Field | Default | Rule |
  |---|---|---|
  | «ابدأ بسؤال تمهيدي (لا يُقيَّم)» | checked | warmup 1 or 0 |
  | «أسئلة تقنية» | 4 | 0–15, required |
  | «أسئلة سلوكية وموقفية» | 3 | 0–15, required |
  | «أسئلة استيضاح من السيرة» | 2 | 0–15, required; hint «تُولَّد لهذا المتقدم وحده، ومراجعتها اختيارية.» |
  | «أسئلة برمجة» | 0 | disabled, badge «قريباً» |
  | `إجمالي الأسئلة: {n}` | 10 | outside 4–15 it turns red, adds « — يجب أن يكون إجمالي الأسئلة بين 4 و15 سؤالاً.» and **disables submit** |
  | «نمط المقابلة» | — | «نصي» checked and disabled; «صوتي» unchecked, disabled, «قريباً» |
  | «مدة المقابلة بالدقائق (10–120)» | 30 | 10–120, required |
  | «وقت إضافي لترتيبات خاصة (٪ من المدة، 0–100)» | 0 | 0–100, required |
  | «ما يراه المتقدم بعد انتهائه» | `completion` | «لا شيء» / «لا يرى المتقدم أي شيء عن نتيجته.» · «اكتمال المقابلة» / «يرى أن مقابلته اكتملت ووصلت، دون أي تقييم.» · «ملخص» / «يرى نقاط قوته ومجالات تطويره، بلا أرقام ولا درجات.» |
  | «اللصق في الإجابات» | `record` | «مسموح مع التسجيل» / «يستطيع المتقدم اللصق، ويُسجَّل حدوثه.» · «ممنوع» / «لا يقبل حقل الإجابة اللصق.» |

  - Title «إعداد المقابلة». Controlled fields keep their values after a server refusal. Submit «إنشاء المقابلة وتجهيز الأسئلة» (pending «جارٍ الإنشاء…»).
- **Acceptance criteria:**
  - **AC-VINT-03.1** — *Given* the form, *when* it loads, *then* the defaults above are shown and the total reads `إجمالي الأسئلة: 10`.
  - **AC-VINT-03.2** — [NEG] *Given* technical 1, behavioral 1, gap 0 and warm-up unchecked (total 2), *when* the total updates, *then* it turns red with « — يجب أن يكون إجمالي الأسئلة بين 4 و15 سؤالاً.» and submit is disabled.
  - **AC-VINT-03.3** — [NEG] *Given* a total of 16, *when* the total updates, *then* submit is disabled.
  - **AC-VINT-03.4** — *Given* the mode controls, *when* rendered, *then* «نصي» is checked and disabled and «صوتي» is disabled with «قريباً»; «أسئلة برمجة» is disabled with «قريباً».

#### REQ-VINT-04 — Server-side validation of the configuration
- **Routes:** server action `createVirtualInterview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/app/(dashboard)/admin/interviews/actions.ts:191-271`; `srp/supabase/functions/_shared/interview-contract.ts`
- **Rules:** integers must match `^\d{1,4}$`. Field errors: count outside 0–15 «أعداد الأسئلة أعداد صحيحة من 0 إلى 15.»; total outside 4–15 (checked only when every count is valid) «يجب أن يكون إجمالي الأسئلة بين 4 و15 سؤالاً.»; duration «المدة بين 10 و120 دقيقة.»; extra time «الوقت الإضافي بين 0 و100٪.»; tampered radio «اختر أحد الخيارات.». Any field error also shows «إعدادات المقابلة غير صالحة. راجع الحقول وأعد المحاولة.» Whatever is posted, the server forces `modes:["text"]`, `coding:0` and `question_count` = the sum; the gateway forces `language:"ar"`.
- **Acceptance criteria:**
  - **AC-VINT-04.1** — [NEG] *Given* a crafted post with duration 121, *when* submitted, *then* «المدة بين 10 و120 دقيقة.» and «إعدادات المقابلة غير صالحة. راجع الحقول وأعد المحاولة.» are shown.
  - **AC-VINT-04.2** — [NEG] *Given* a crafted `paste_policy=allow`, *when* submitted, *then* «اختر أحد الخيارات.» is shown.
  - **AC-VINT-04.3** — [NEG] *Given* a crafted count `2.5`, *when* submitted, *then* «أعداد الأسئلة أعداد صحيحة من 0 إلى 15.» is shown.
  - **AC-VINT-04.4** — *Given* a crafted post with `modes=voice` and `coding=2`, *when* submitted with otherwise valid values, *then* the interview is created as text with 0 coding questions.

#### REQ-VINT-05 — Creating the interview
- **Routes:** gateway `create`
- **Priority:** P1
- **Test type:** UI e2e; API
- **Source:** gateway lines 763-937; `interview-agent/src/api/platform.ts:131-194`
- **Rules:**
  - Gateway checks in order: `can_manage_application` (404); contract `InterviewConfig` (400 `invalid_config`); application lookup (404); cost gate (403 `organization_inactive` / 402 `interviews_not_in_plan`); analysis `done` with an evaluation (409 `analysis_required` «تحتاج المقابلة إلى اكتمال تحليل السيرة الذاتية أولاً.»); extracted profile fits the contract (422 `profile_unusable` «البيانات المستخرجة من السيرة لا تصلح لبناء أسئلة الاستيضاح. أعد تحليل السيرة ثم حاول مجدداً.»); newest locked bank with an agent id (409 `bank_required` «اعتمد بنك أسئلة الوظيفة أولاً، ثم أنشئ المقابلة.»); stale drafts marked `failed` / `agent_unreachable`; insert (unique violation → 409 `interview_exists` «توجد مقابلة افتراضية جارية لهذا المتقدم.»; other → 500 `insert_failed`); agent create (a refusal marks the unbound row `failed` with `last_error`).
  - Agent codes: 409 `insufficient_bank` «الأسئلة المعتمدة أقل مما يتطلبه توزيع المقابلة. قلّل عدد الأسئلة من النوع الناقص، أو استعد أسئلة محذوفة، أو أنشئ نسخة أوسع من بنك الوظيفة.»; 503 `llm_not_configured` (only when gap probes > 0); 402 `interviews_not_in_plan`; 402 `quota_exceeded` «استُنفد رصيد المقابلات الافتراضية لهذا الشهر.»; 403 `tenant_mismatch` «بنك الأسئلة لا يخص منشأتك.»; 409 `bank_not_locked` «بنك أسئلة الوظيفة لم يُقفل بعد.»; 409 `external_ref_exists` «هذه المقابلة مسجّلة من قبل في خدمة المقابلات.»; 422 `voice_unavailable` «المقابلة الصوتية غير متاحة بعد.»; 422 `coding_unavailable` «أسئلة البرمجة غير متاحة بعد.»
  - Display: a refusal recorded on a row appears once, in the failed notice (the form hides the identical text). Refusals before any row is written (cost gate, `analysis_required`, `bank_required`, `profile_unusable`, `interview_exists`, `invalid_config`, `not_found`) appear only inline in the form.
  - Success: status `planning` when gap probes > 0, or `awaiting_review` at once when 0. One monthly interview unit is claimed per create (given back only on a terminal planning failure, never on cancel).
- **Acceptance criteria:**
  - **AC-VINT-05.1** — *Given* all preconditions and the default form, *when* «إنشاء المقابلة وتجهيز الأسئلة» is pressed, *then* the panel shows «نجهّز أسئلة الاستيضاح».
  - **AC-VINT-05.2** — *Given* gap probes set to 0, *when* created, *then* the panel goes straight to «أسئلة الاستيضاح» with «لا تتضمن هذه المقابلة أسئلة استيضاح.» and the lock button enabled, even if the agent has no model key.
  - **AC-VINT-05.3** — [NEG] *Given* a bank locked with 6 approved questions of which 2 are technical, *when* an interview with 4 technical is created, *then* the failed notice shows «تعذّر تجهيز المقابلة» with the `insufficient_bank` text and the suffix « يمكنك البدء من جديد بالإعداد أدناه.»
  - **AC-VINT-05.4** — [NEG] *Given* a live interview already exists, *when* a second create is sent (second tab), *then* «توجد مقابلة افتراضية جارية لهذا المتقدم.» is shown inline.
  - **AC-VINT-05.5** — [NEG] *Given* quota 1 already used this month, *when* an interview is created, *then* the failed notice shows «استُنفد رصيد المقابلات الافتراضية لهذا الشهر.» **without** the start-again suffix.
  - **AC-VINT-05.6** — [API][PERM][NEG] *Given* Org B's hr JWT and a seed-org application id, *when* the gateway `create` is called, *then* the reply is 404 `not_found`.

#### REQ-VINT-06 — Sending and planning states
- **Routes:** `/admin/applications/[id]?tab=interview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `virtual-interview-panel.tsx:141-281`; `interview-agent/src/planner/worker.ts:176-231`
- **Rules:** `draft` with no agent id → «نرسل المقابلة إلى خدمة المقابلات» / «تتحدث هذه اللوحة تلقائياً.»; `planning`, or a draft with an agent id → «نجهّز أسئلة الاستيضاح» / «تتحدث هذه اللوحة تلقائياً عند الانتهاء.» Both poll every 4 s and offer cancel. The planner asks for `max(wanted, min(wanted + 2, 10))` probes and succeeds when at least `wanted` survive filtering; after 2 failed attempts the interview is `failed` and the unit is returned. A stale draft (unacknowledged > 2 minutes) shows the failed notice with the unreachable text and the form, not a spinner.
- **Acceptance criteria:**
  - **AC-VINT-06.1** — [STATE] *Given* planning, *when* the agent finishes, *then* the panel moves to «أسئلة الاستيضاح» without a manual reload.
  - **AC-VINT-06.2** — [STATE] *Given* a draft created while the agent was down, *when* more than 2 minutes pass and the tab reloads, *then* «تعذّر تجهيز المقابلة» with «تعذّر الوصول إلى خدمة المقابلات أو تأخر ردها. حدّث الصفحة لترى آخر حالة، ثم أعد المحاولة إن لزم.» and the form are shown.
  - **AC-VINT-06.3** — [STATE] *Given* a planning failure learned only through the panel's sync (no webhook), *when* the panel renders, *then* the notice reads «لم تكتمل تهيئة أسئلة المقابلة.»

#### REQ-VINT-07 — Reviewing gap probes and locking the interview
- **Routes:** `/admin/applications/[id]?tab=interview`; gateway `interview_bank_get`, `interview_bank_edit`, `interview_bank_lock`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `virtual-interview-panel.tsx:233-269`; `interview-agent/src/api/platform.ts:212-324`
- **Rules:**
  - Title «أسئلة الاستيضاح». Hint when probes exist: «مراجعتها اختيارية: ما لم تراجعه يُعتمد عند القفل. أما أسئلة البنك الأساسي فقد اعتُمدت مع بنك الوظيفة.»; none: «لا تتضمن هذه المقابلة أسئلة استيضاح.» Cards as in the bank, without group headings; core questions are not shown or editable here. Gap regenerations: `min(5 − used, 30 − calls used)`.
  - Writers: «اعتماد الأسئلة وقفلها» (pending «جارٍ القفل…»), disabled when non-removed probes are fewer than the mix, with `المطلوب {need} من أسئلة الاستيضاح، والمتاح للاعتماد {n}. استعد سؤالاً محذوفاً أو ولّد بديلاً.`
  - Dialog «اعتماد أسئلة المقابلة وقفلها؟» / «نسحب أسئلة هذا المتقدم من البنك المعتمد ومن أسئلة الاستيضاح بالترتيب الذي ستُطرح به، ولا تتغير بعد القفل. الأسئلة التي لم تراجعها تُعتمد كما هي.» / «اعتماد وقفل» / «تراجع».
  - On lock the agent approves pending probes, draws the plan (warm-up first, a random interleave of the mix from the core bank, then probes) and computes `plan_hash`. **The status stays `awaiting_review`.** Refusals 409 `insufficient_bank`, `bank_not_locked`, `invalid_transition`; repeat lock is idempotent.
- **Acceptance criteria:**
  - **AC-VINT-07.1** — *Given* 2 wanted probes and 3 generated, *when* one is removed, *then* the lock stays enabled; *when* a second is removed, *then* it is disabled with `المطلوب 2 من أسئلة الاستيضاح، والمتاح للاعتماد 1. استعد سؤالاً محذوفاً أو ولّد بديلاً.`
  - **AC-VINT-07.2** — *Given* pending probes, *when* «اعتماد الأسئلة وقفلها» → «اعتماد وقفل» is confirmed, *then* the panel shows «الأسئلة مقفلة» and the probes count as approved.
  - **AC-VINT-07.3** — [NEG] *Given* a gap-probe edit to «ما ديانتك؟», *when* saved, *then* the `protected_category` message is shown.

#### REQ-VINT-08 — Locked interview; dispatch not available
- **Routes:** `/admin/applications/[id]?tab=interview`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `virtual-interview-panel.tsx:162-210,392-420`
- **Rules:** «الأسئلة مقفلة»; «الأسئلة حسب النوع» badges (behavioral shown as «سلوكي / موقفي» once drawn from the stored config); «بصمة الأسئلة» (12 characters) and «تاريخ القفل»; **disabled** «إرسال للمتقدم» with «إرسال المقابلة إلى المتقدم يصل مع غرفة المقابلة في المرحلة القادمة.»; cancel button. Any later status (`scheduled` onward) would show `حالة المقابلة: {status}` but is not reachable today.
- **Acceptance criteria:**
  - **AC-VINT-08.1** — *Given* a locked interview, *when* the panel renders, *then* «إرسال للمتقدم» is disabled and «إرسال المقابلة إلى المتقدم يصل مع غرفة المقابلة في المرحلة القادمة.» is shown.
  - **AC-VINT-08.2** — *Given* the locked interview, *when* «بصمة الأسئلة» is read, *then* it shows 12 hex characters.

#### REQ-VINT-09 — Cancelling an interview and earlier outcomes
- **Routes:** `/admin/applications/[id]?tab=interview`; gateway `cancel`
- **Priority:** P1
- **Test type:** UI e2e
- **Source:** `srp/components/admin/virtual-interview/interview-buttons.tsx:14-26`; `interviews/actions.ts:282-296`; gateway lines 939-980; `srp/supabase/migrations/0019_interviews.sql:51-55`
- **Rules:**
  - Destructive «إلغاء المقابلة» (pending «جارٍ الإلغاء…»), offered in `draft`, `planning`, `awaiting_review`, `scheduled`, `open`, `in_progress`. Dialog «إلغاء المقابلة الافتراضية؟» / «تتوقف هذه المقابلة ولا يمكن استئنافها، ويمكنك إنشاء مقابلة جديدة بعدها.» / «إلغاء المقابلة» / «تراجع».
  - Unbound → cancelled locally; bound → cancelled on the agent (twice is fine; other states 409 `invalid_transition`). The monthly unit is **not** refunded.
  - Notices above the start section: previous failed or stale draft → «تعذّر تجهيز المقابلة» + the mapped `last_error` (no code → «لم تكتمل تهيئة أسئلة المقابلة.»), with the suffix « يمكنك البدء من جديد بالإعداد أدناه.» only when a new interview can start and the code is not `quota_exceeded`; previous cancelled → «أُلغيت المقابلة السابقة.» (same suffix rule); previous expired → «انتهت صلاحية المقابلة السابقة.»
  - After `cancelled`, `expired` or `failed` a new interview may be created (one live interview per application). There is no retry of a failed interview; staff start a new one.
- **Acceptance criteria:**
  - **AC-VINT-09.1** — *Given* an interview in planning, *when* «إلغاء المقابلة» → «إلغاء المقابلة» is confirmed, *then* the panel shows «أُلغيت المقابلة السابقة. يمكنك البدء من جديد بالإعداد أدناه.» and a new config form.
  - **AC-VINT-09.2** — [DB] *Given* the cancel, *when* the agent database's `tenant_usage` row for the current UTC month is read, *then* the unit is still counted.
  - **AC-VINT-09.3** — *Given* a cancelled interview, *when* a new one is created, *then* it succeeds.

#### REQ-VINT-10 — Interview panel permissions and isolation
- **Routes:** `/admin/applications/[id]?tab=interview`; interview server actions; gateway
- **Priority:** P1
- **Test type:** UI e2e; API; DB-RLS
- **Source:** `interviews/actions.ts:21-82`; gateway lines 5-10; `srp/supabase/migrations/0021_interview_banks.sql:31-40,164-200`; `srp/supabase/tests/interview_isolation.sql`
- **Rules:** owner, admin and hr have identical rights here; viewers read only (no form, lock or cancel). A crafted viewer action → «صلاحيتك في هذه المنشأة للاطلاع فقط.»; a direct gateway call by a viewer → 404. Another org's bank or assignment id in an action → «لم نجد هذا العنصر، أو لم يعد متاحاً لك.»; at the gateway → 404 (not visible and not allowed look the same). No client role can write `interview_job_banks` or `interview_assignments`, or update `monthly_interview_quota`.
- **Acceptance criteria:**
  - **AC-VINT-10.1** — [PERM][NEG] *Given* a crafted `cancelVirtualInterview` call by a viewer, *when* sent, *then* «صلاحيتك في هذه المنشأة للاطلاع فقط.» is returned and the interview is unchanged.
  - **AC-VINT-10.2** — [PERM][NEG] *Given* an Org B assignment id, *when* the seed hr calls `cancelVirtualInterview` with it, *then* «لم نجد هذا العنصر، أو لم يعد متاحاً لك.» is returned.
  - **AC-VINT-10.3** — [DB][PERM][NEG] *Given* the owner, *when* they update `organizations.monthly_interview_quota`, *then* it is refused.

#### REQ-VINT-11 — Interviews never change status and show no score
- **Routes:** `/admin/applications/[id]`
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `virtual-interview-panel.tsx:41-44`; `interviews/actions.ts:29-30`; gateway (writes only interview tables)
- **Rules:** creating, locking or cancelling an interview never changes `applications.status` or writes a score; `interview_reports` is never written; no interview report or score is displayed (I3 not built).
- **Acceptance criteria:**
  - **AC-VINT-11.1** — *Given* an application in «قيد المراجعة», *when* an interview is created, locked and cancelled, *then* the status is still «قيد المراجعة» and no new `status_history` row exists.

### F-IGW-01 — Interview gateway and webhook, black-box (P1)

#### REQ-IGW-01 — Gateway request handling
- **Routes:** `POST {SUPABASE_URL}/functions/v1/interview-gateway`
- **Priority:** P1
- **Test type:** API
- **Source:** `srp/supabase/functions/interview-gateway/index.ts:91-120,1055-1072`
- **Rules:** non-POST 405 `method_not_allowed`; body not JSON 400 `invalid_json`; unknown `action` shape 400 `invalid_request`; missing `INTERVIEW_AGENT_URL`, `INTERVIEW_AGENT_KEYS` or a ≥ 32-character `INTERVIEW_REF_SECRET` → 503 `interviews_not_configured`. Actions: `bank_create`, `bank_get`, `bank_edit`, `bank_lock`, `bank_retry`, `create`, `cancel`, `interview_bank_get`, `interview_bank_edit`, `interview_bank_lock`. A row the caller cannot see and an action the caller may not perform both return 404 `not_found`.
- **Acceptance criteria:**
  - **AC-IGW-01.1** — [API][NEG] *Given* a body `{"action":"explode"}`, *when* posted with a staff JWT, *then* the reply is 400 `invalid_request`.
  - **AC-IGW-01.2** — [API][NEG] *Given* the gateway secrets unset, *when* `bank_create` is posted, *then* the reply is 503 `interviews_not_configured` and the UI shows «خدمة المقابلات الافتراضية غير مهيّأة على المنصة بعد. تواصل مع الدعم.»
  - **AC-IGW-01.3** — [API][PERM][NEG] *Given* an Org B bank id, *when* the seed hr posts `bank_get`, *then* the reply is 404 `not_found`.

#### REQ-IGW-02 — Interview quota (D33)
- **Routes:** gateway; agent
- **Priority:** P1
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/migrations/0021_interview_banks.sql:22-40`; gateway lines 109, 316-324, 393-399; `interview-agent/src/orchestrator/budget.ts:200-235`
- **Rules:** `monthly_interview_quota` default 0 = not in plan (402 for every costly action: bank create, retry, regenerate, interview create); NULL = uncapped but counted (values above 100,000 are clamped when sent); positive N = N interview creates per UTC calendar month, claimed atomically by the agent (402 `quota_exceeded` when used up), returned only on a terminal planning failure. Bank generation needs a non-zero quota but consumes no unit. Only the service role can change the column.
- **Acceptance criteria:**
  - **AC-IGW-02.1** — [API] *Given* quota 0, *when* `bank_create`, `bank_retry`, a `regenerate` edit and `create` are posted, *then* each returns 402 `interviews_not_in_plan`; *when* `bank_get` or an `approve` edit is posted, *then* it is not refused for quota.
  - **AC-IGW-02.2** — [API] *Given* quota 1, *when* two interviews (on two applications) are created in the same month, *then* the second fails with `quota_exceeded`.
  - **AC-IGW-02.3** — [DB] *Given* a new organization, *when* inspected, *then* `monthly_interview_quota = 0`.

#### REQ-IGW-03 — Agent error passthrough, timeouts and stale rows
- **Routes:** gateway
- **Priority:** P1
- **Test type:** API
- **Source:** gateway lines 116, 256-311, 424-434; `srp/lib/interviews.ts:249-324`
- **Rules:** agent statuses 402, 403, 404, 409, 422, 429, 502 and 503 pass through with the agent's code; any other non-2xx (400, 401, 500) becomes 502 `agent_refused` («رفضت خدمة المقابلات الطلب. أعد المحاولة، وإن تكرر فتواصل مع الدعم.»), so a signing-key mismatch shows as `agent_refused`; network error or timeout (15 s, 55 s for PATCH) → 502 `agent_unreachable`; a reply off-contract → 502 `agent_invalid_response` («وصل من خدمة المقابلات رد غير متوقع فلم نعرضه. أعد المحاولة.»). The agent's own message never leaves the gateway. Next.js adds `unauthorized` («انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.»), `gateway_unreachable` (40 s, 65 s for edits; same text as `agent_unreachable`), `forbidden`, `invalid_edit`. An unmapped code shows «تعذّر إتمام العملية. أعد المحاولة.» Banks stuck `generating` or assignments stuck `draft` without an agent id for more than 2 minutes become `failed` with `agent_unreachable`.
- **Acceptance criteria:**
  - **AC-IGW-03.1** — [API] *Given* mismatched signing keys between the platform and the agent, *when* `bank_create` is posted, *then* the reply is 502 `agent_refused` and the UI shows «رفضت خدمة المقابلات الطلب. أعد المحاولة، وإن تكرر فتواصل مع الدعم.»
  - **AC-IGW-03.2** — [API] *Given* the agent URL pointing at a closed port, *when* `bank_create` is posted, *then* the reply is 502 `agent_unreachable` and the new bank row is later shown as failed.

#### REQ-IGW-04 — Webhook authentication
- **Routes:** `POST {SUPABASE_URL}/functions/v1/interview-webhook` (`verify_jwt = false`)
- **Priority:** P1
- **Test type:** API
- **Source:** `srp/supabase/functions/interview-webhook/index.ts:17-106`; `srp/supabase/functions/_shared/interview-hmac.ts`
- **Rules:** in order: non-POST 405; `INTERVIEW_WEBHOOK_SECRETS` unset → 503 `not_configured`; body > 256 KB → 413 `too_large`; HMAC → 401 `unauthorized` on missing headers, unknown key id, timestamp more than ±300 s off, or bad signature. Headers `x-hakeem-key-id`, `x-hakeem-timestamp`, `x-hakeem-nonce`, `x-hakeem-signature: v1=<hex>`; signed string `v1\n{ts}\n{nonce}\n{METHOD}\n{path}\n{sha256(body)}`; the path is accepted with or without `/functions/v1`. HMAC-SHA256, constant-time compare. The two directions use different secrets.
- **Acceptance criteria:**
  - **AC-IGW-04.1** — [API][NEG] *Given* a correctly signed event whose timestamp is 301 s old, *when* posted, *then* the reply is 401.
  - **AC-IGW-04.2** — [API][NEG] *Given* an unknown key id, or one changed body byte after signing, *when* posted, *then* the reply is 401.
  - **AC-IGW-04.3** — [API][NEG] *Given* a 300 KB body, *when* posted, *then* the reply is 413.
  - **AC-IGW-04.4** — [API] *Given* a valid event signed over the path without the `/functions/v1` prefix, *when* posted, *then* it is accepted.

#### REQ-IGW-05 — Webhook event semantics
- **Routes:** `interview-webhook`; RPC `apply_interview_event` (service role)
- **Priority:** P1
- **Test type:** API; DB-RLS
- **Source:** `srp/supabase/migrations/0021_interview_banks.sql:223-309`
- **Rules:** body must match `InterviewEvent` (else 400 `invalid_event`); types `interview.planned`, `.bank_locked`, `.started`, `.submitted`, `.evaluated`, `.expired`, `.failed`, `.cancelled` (only planned, bank_locked, failed and cancelled are emitted today). Outcomes, all HTTP 200 `{ok, outcome}`: `applied`; `duplicate` (same `event_id`); `stale` (older `occurred_at`, or the change would create a second live interview); `unknown` (no matching assignment). It binds the agent id to an unbound `draft`; a draft accepts any agent event (clock-skew rule). `interview.failed` stores its reason only if it matches `^[a-z_]{1,60}$`. An RPC error → 500 `apply_failed` (the agent retries; a non-UUID `external_ref` produces this). Staff cannot call `apply_interview_event`.
- **Acceptance criteria:**
  - **AC-IGW-05.1** — [API] *Given* a valid `interview.planned` event for a planning assignment, *when* posted twice, *then* the first returns `applied` and the second `duplicate`.
  - **AC-IGW-05.2** — [API] *Given* an event older than the assignment's last applied event, *when* posted, *then* it returns `stale` and the status is unchanged.
  - **AC-IGW-05.3** — [API] *Given* an event for an unknown assignment id, *when* posted, *then* it returns 200 `unknown`.
  - **AC-IGW-05.4** — [API] *Given* `interview.failed` with reason `model_error`, *when* applied, *then* the panel shows «تعذّر الوصول إلى نموذج التوليد. أعد المحاولة بعد قليل.»; with reason `Bad Reason!`, *then* `last_error` is not stored.
  - **AC-IGW-05.5** — [DB][NEG] *Given* an hr session, *when* it calls `apply_interview_event`, *then* it is refused.

#### REQ-IGW-06 — Personal data sent to the agent is minimised
- **Routes:** gateway `create`
- **Priority:** P1
- **Test type:** API
- **Source:** `srp/supabase/functions/_shared/interview-agent-client.ts:77-92`; `interview-agent/src/contract/index.ts:118-154,307-316`
- **Rules:** the agent receives `candidate_ref = "c_" + 32 hex` (HMAC of the application id with `INTERVIEW_REF_SECRET`) and `tenant.ref = "t_" + 32 hex`; `candidate_profile` is the extracted CV **without `full_name`** (the contract is strict, so a name is refused). Never sent: name, email, phone, user id, CV file, fit score or justification, org name or id.
- **Acceptance criteria:**
  - **AC-IGW-06.1** — [API] *Given* an interview create intercepted at the agent, *when* the body is inspected, *then* `candidate_ref` matches `^c_[0-9a-f]{32}$`, `tenant.ref` matches `^t_[0-9a-f]{32}$`, and the body contains no applicant name, email, phone or score.

### 5.8 Tenant isolation and data protection (cross-cutting)

### F-ISO-01 — Tenant isolation, two layers (P0, D11, D12, §10.10)

#### REQ-ISO-01 — A member of org A never reaches org B
- **Routes:** all `/admin/*` pages and actions; all tenant tables
- **Priority:** P0
- **Test type:** DB-RLS; UI e2e
- **Source:** `srp/supabase/tests/tenant_isolation.sql`; CLAUDE.md §2.2 isolation invariant
- **Rules:** every tenant query filters `org_id` in application code **and** is constrained by RLS (`org_id in (select unnest(current_org_ids()))`). A cross-org id in a page URL → 404; in an action → redirect to `/admin` or no-op; in the transparency route → 500. RLS reads return 0 rows; refused inserts raise 42501; updates and deletes outside the policy match 0 rows.
- **Acceptance criteria:**
  - **AC-ISO-01.1** — [DB][PERM][NEG] *Given* ACME's hr session, *when* it selects from `applications`, `ai_evaluations`, `status_history`, `memberships`, `profiles` and CV objects, *then* no Globex row is returned.
  - **AC-ISO-01.2** — [PERM][NEG] *Given* the seed hr signed in, *when* they open Org B's job applicants page, application page, edit page and bank page by URL, *then* each shows the 404 page.
  - **AC-ISO-01.3** — [DB][PERM] *Given* ACME's hr, *when* it reads `jobs`, *then* it sees a Globex job only if it is published and live (the public policy), never a Globex draft.
  - **AC-ISO-01.4** — [DB] *Given* an outsider (signed in, no membership), *when* it selects from tenant tables, *then* it gets 0 rows.

#### REQ-ISO-02 — `anon` never writes; consistency guards
- **Routes:** all tables and buckets
- **Priority:** P0
- **Test type:** DB-RLS
- **Source:** `srp/supabase/tests/tenant_isolation.sql`; `srp/supabase/tests/rls_check.sql`; `srp/supabase/migrations/0022_revoke_stray_client_grants.sql`
- **Rules:** `anon` has no INSERT/UPDATE/DELETE grant on any table or bucket (§10.11); no client role has TRUNCATE, REFERENCES or TRIGGER. Triggers enforce `applications.org_id = jobs.org_id` and make evaluations and history inherit their application's `org_id`; a spoofed `org_id` is overwritten. RLS is enabled on every tenant table. A reserved slug is refused.
- **Acceptance criteria:**
  - **AC-ISO-02.1** — [DB][NEG] *Given* the catalog, *when* grants are listed, *then* `anon` holds no write privilege on any table, and no client role holds TRUNCATE, REFERENCES or TRIGGER.
  - **AC-ISO-02.2** — [DB] *Given* a service-role insert of an application whose `org_id` differs from its job's, *when* stored, *then* `org_id` equals the job's org.
  - **AC-ISO-02.3** — [DB] *Given* every tenant table, *when* `pg_class.relrowsecurity` is read, *then* it is true.

#### REQ-ISO-03 — Storage isolation
- **Routes:** buckets `cvs`, `org-assets`, `talent-cvs`
- **Priority:** P0
- **Test type:** DB-RLS
- **Source:** `srp/supabase/migrations/0007_storage_isolation.sql`; `0011_org_branding.sql`; `0017_talent_platform.sql:322-333`
- **Rules:** `cvs`: private, 5 MB, PDF/DOCX; SELECT for authenticated users whose `storage_org_id(name)` is among their **membership** orgs (all four roles); not through impersonation, not for platform admins; no client write. `org-assets`: public read, 2 MB, PNG/JPEG/WEBP; owner/admin of the folder's org may write. `talent-cvs`: no policies, service role only.
- **Acceptance criteria:**
  - **AC-ISO-03.1** — [DB][PERM][NEG] *Given* a platform admin with a live impersonation session for the seed org, *when* it reads a seed-org CV object, *then* it is refused.
  - **AC-ISO-03.2** — [DB][NEG] *Given* a seeker session, *when* it reads `talent-cvs`, *then* it is refused, including its own files.

#### REQ-ISO-04 — Seeker and company data never cross
- **Routes:** `talent.*` tables; `public.talent_*` and `my_*` functions
- **Priority:** P0
- **Test type:** DB-RLS
- **Source:** `srp/supabase/tests/seeker_isolation.sql`; CLAUDE.md D26, §9.1
- **Rules:** `talent` tables have no client grants or policies (except `talent.skills` select); seekers reach their own data only through security-definer functions keyed on `auth.uid()`; `talent_my_profile()` returns a fixed column list with no CV path, hash or token other than `public_token`; seekers read no tenant data; staff read no talent data; seeker RPCs are refused for `anon`. Nothing joins `public.*` to `talent.*` directly.
- **Acceptance criteria:**
  - **AC-ISO-04.1** — [DB][NEG] *Given* a seeker session, *when* it selects from `talent.profiles` or `talent.cv_versions` directly, *then* it is refused.
  - **AC-ISO-04.2** — [DB] *Given* a seeker session, *when* `talent_my_profile()` is called, *then* the result has no CV path, file hash, verify token or link token.
  - **AC-ISO-04.3** — [DB][NEG] *Given* an hr session, *when* it selects from `talent.profiles`, *then* it is refused.
  - **AC-ISO-04.4** — [DB][NEG] *Given* `anon`, *when* it calls `talent_my_profile` or `my_applications`, *then* it is refused.

#### REQ-ISO-05 — Platform admins and impersonation (database level only)
- **Routes:** tables `platform_admins`, `impersonation_sessions`
- **Priority:** P1
- **Test type:** DB-RLS
- **Source:** `srp/supabase/migrations/0006_multitenancy.sql:247-263`; `srp/supabase/tests/tenant_isolation.sql`
- **Rules:** platform admins live in `platform_admins` (D13), never in the tenant role enum. As implemented they can read all orgs and tenant rows (OQ-02) but no CV objects and cannot create jobs without a session. A live impersonation session puts exactly the target org into `current_org_ids()`; it ends on `ended_at` or expiry (default 60 minutes). While live, `is_org_member()` returns true for any role filter, so owner-level writes pass (SEC-06), while `org_role()` returns null (so `manage-users` answers 403). Sessions are created only by SQL; there is no UI or banner (S4).
- **Acceptance criteria:**
  - **AC-ISO-05.1** — [DB] *Given* a platform admin with no session, *when* it selects from `applications`, *then* it sees rows of every tenant (as implemented; OQ-02) but no CV object, and an insert into `jobs` is refused.
  - **AC-ISO-05.2** — [DB] *Given* a session with `ended_at` set, *when* the admin reads through it, *then* the org is no longer in `current_org_ids()`.
  - **AC-ISO-05.3** — [DB][NEG] *Given* a tenant owner, *when* they insert into `platform_admins` or `impersonation_sessions`, *then* it is refused.
  - **AC-ISO-05.4** — [DB] *Given* a live session for the seed org, *when* the admin inserts a job into the seed org, *then* it succeeds (SEC-06); *when* it inserts a job into Org B, *then* it is refused.

#### REQ-ISO-06 — The database test suites pass
- **Routes:** `cd srp && npm run test:db`; `cd interview-agent && npm test`
- **Priority:** P0
- **Test type:** DB-RLS
- **Source:** `srp/supabase/tests/run.sh`; CLAUDE.md §9.2
- **Rules:** `tenant_isolation.sql` (55), `onboarding.sql` (23), `interview_isolation.sql` (79), `seeker_isolation.sql` (132) and `rls_check.sql` all pass against a throwaway database built from the harness, migrations `0001`–`0022` and the seed; the agent suite (210) passes.
- **Acceptance criteria:**
  - **AC-ISO-06.1** — [DB] *Given* a clean checkout, *when* `npm run test:db` runs in `srp/`, *then* it exits 0.
  - **AC-ISO-06.2** — *Given* a clean checkout, *when* `npm test` runs in `interview-agent/`, *then* it exits 0.


---

## 6. State machines

Each table lists: state | allowed next states | trigger | observable effect. "UI" names the Arabic label a test can assert.

### ST-APP-STATUS — Application status (`applications.status`, enum `app_status`)

Source: `srp/supabase/migrations/0006_multitenancy.sql:451-517`; `srp/supabase/migrations/0003_status_rpc.sql:46`; `srp/app/(dashboard)/admin/applications/actions.ts:72-78`.

| State (UI label) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| (none) → `new` «تم استلام الطلب» | — | Insert by `submit-application` | History row `new` with `changed_by` null («النظام» in the transparency report); `/track/{ref}` shows «تم استلام الطلب»; email EM-01 |
| `new` | `under_review`, `interview`, `accepted`, `rejected` | `change_application_status` by owner/admin/hr of the org | History row `from → to` with the actor and note; `/track` and `/me/applications` timelines gain a row |
| `under_review` «قيد المراجعة» | any other status | same | same; no email |
| `interview` «دعوة لمقابلة» | any other status | same | email EM-02; appears in the calendar («بانتظار تحديد موعد» when no time); Saudization control appears |
| `accepted` «تم القبول» | any other status | same | email EM-03; Saudization control appears |
| `rejected` «تم الاعتذار» | any other status | same | email EM-04 (generic, no AI reasoning) |
| any | the same status | same RPC | No-op: no history row. (The Next action still sends the email for interview/accepted/rejected — KD-15) |

Rules: there is no transition table (any → any); nothing automatic changes status (REQ-ETH-02); direct `UPDATE` of `status` is denied; hard deletion only by retention (D9).

### ST-ANALYSIS — CV analysis status (`applications.analysis_status`)

Source: `srp/supabase/functions/analyze-application/index.ts`; `srp/supabase/migrations/0012_security_hardening.sql`; `srp/supabase/functions/housekeeping/index.ts`.

| State (HR UI) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `pending` («التحليل قيد الانتظار…») | `processing` | Any caller claims it (submit-application, housekeeping when older than 15 min) | `analysis_attempts + 1`, error cleared |
| `processing` («جارٍ التحليل…») | `done`, `failed`; `processing` again only with force | Valid upsert → `done`; any error or quota refusal → `failed`; force claim by staff or housekeeping (`created_at` older than 1 h) | `done`: evaluation shown, `fit_score` copied; `failed`: alert with attempts |
| `done` (green check / evaluation) | `processing` | Forced re-run by owner/admin/hr or the service role | Attempts + 1; evaluation hidden until it ends |
| `failed` («فشل التحليل — يمكن قراءة السيرة يدوياً وإعادة المحاولة (المحاولات: {n})») | `processing` | Forced re-run (no cap); housekeeping while attempts < 3 (max 10 per run) | Attempts + 1; `analysis_error` stored (never shown) |

### ST-JOB — Job status (`jobs.status` × `deleted_at`)

Source: `srp/app/(dashboard)/admin/jobs/actions.ts`.

| State (UI label) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| (none) → `draft` «مسودة» | — | «إنشاء الوظيفة» | Not public |
| `draft` | `published`; soft-deleted | «نشر» (requires non-empty requirements); «حذف» | Published: on `/jobs` (if org listed), `/c/{slug}`, `/companies` count, sitemap |
| `published` «منشورة» | `closed`; soft-deleted | «إغلاق»; «حذف» | Closed: removed from public pages; submissions get `job_closed` |
| `closed` «مغلقة» | `published`; soft-deleted | «إعادة النشر» (requirements check); «حذف» | Public again |
| soft-deleted | — (terminal in the UI; no restore) | — | Hidden from the list and public pages; applicants page still reachable by URL |

A published job past `closes_at` stays `published` and listed, but its detail and apply pages show «انتهى موعد التقديم لهذه الوظيفة» and submissions get `job_closed`.

### ST-ORG — Organization status (`organizations.status`)

| State | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `trial` (on creation) | `active`, `past_due`, `suspended`, `cancelled` | Service role / SQL only (no UI; tenants have no grant) | Public pages live |
| `active` | any other | same | Public pages live |
| `past_due`, `suspended`, `cancelled` | any other | same | Careers page, jobs and directory entry disappear for `anon`; submissions → `job_closed`; interview cost gate → 403 `organization_inactive`; members still use `/admin` fully |

### ST-INVITE — Invitation (`invitations.status`)

| State | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `pending` | `accepted`, `revoked`, `expired` | Created by `manage-users` invite (7-day expiry) | Listed under «دعوات معلّقة»; preview works |
| `accepted` | — | `accept_invitation` by the invited email | Membership created; link shows «الدعوة غير صالحة» |
| `revoked` | — | «إلغاء», or a re-invite of the same email | Link shows «الدعوة غير صالحة» |
| `expired` | — | Written only when acceptance is attempted after `expires_at` | «انتهت صلاحية هذه الدعوة، اطلب دعوة جديدة» |

### ST-SEEKER-STEP — Seeker onboarding step (`talent.profiles.onboarding_step`)

Source: `srp/supabase/migrations/0020_seeker_accounts.sql:42-44`.

| State (indicator) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `cv` «السيرة الذاتية» | `contact` | `talent-upload` stores a version, or answers `unchanged` while the step is `cv` | Contact step renders |
| `contact` «بيانات التواصل» | `review` | `talent_save_my_contact` | Review step renders |
| `review` «المراجعة» | `consents` | `talent_save_my_review` (needs a done analysis) | Consents step renders |
| `consents` «الموافقات» | `done` | `talent_set_my_consents` | Redirect to `/me` |
| `done` | — (never goes back) | — | `/onboarding/seeker` → `/me`; `/me/*` accessible |
| legacy unlinked profile | `contact` (no phone) or `done` | `talent_link_legacy_profile` | Lands on the contact step |

### ST-TALENT-PROFILE — Public page status (`talent.profiles.status`) and consents

| State | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `draft` | `published` | Public consent given (needs a done analysis) | `/t/{token}` renders |
| `published` | `hidden` | Public consent withdrawn | `/t/{token}` → 404 immediately |
| `hidden` | `published` | Consent given again | Same URL renders again (token never rotates) |
| any | deleted | `seeker-account delete` (account profiles) or legacy `talent_delete_profile` (unlinked) | `/t/{token}` → 404 |

`consent_public_at` and `consent_offers_at` are set on first grant, kept while the consent stands, cleared on withdrawal. The profile-level `analysis_status` follows the newest CV version.

### ST-CV-VERSION — Seeker CV version analysis (`talent.cv_versions.analysis_status`)

| State (portal badge) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `pending` («في انتظار التحليل») | `processing` | `talent-upload` inserts it; `talent-analyze` claims it | Onboarding chip «نقرأ سيرتك الآن…» |
| `processing` («جارٍ التحليل») | `done`, `failed` | `talent-analyze` finishes | Writes to the profile only if still the newest version |
| `done` («اكتمل التحليل») | — | — | Usable for applying; never pruned while it is the newest done version |
| `failed` («تعذّر التحليل») | `processing` | A re-claim (only path: re-upload creates a new version; same-file re-upload after failure is analysed again) | Error `[trace/step] message`; file-side or our-side text |
| (derived) stale | — | pending/processing more than 10 minutes | Onboarding offers re-upload; same file accepted again |

No automatic retry and no quota for seeker analyses. Only the 3 newest versions are kept (the newest done one always survives). Linking a legacy profile turns pending/processing into failed.

### ST-BANK — Interview job bank (`interview_job_banks.status`, platform mirror)

Source: `srp/supabase/migrations/0021_interview_banks.sql:58-109`; gateway.

| State (UI badge) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| (none) → `generating` «قيد التوليد» | — | «توليد بنك الأسئلة» / «إنشاء نسخة جديدة» | Spinner, polling every 4 s |
| `generating` | `awaiting_review`, `failed` | Agent planner success (seen via `bank_get` polling; no webhook); agent refusal; planner gives up after 2 attempts; unacknowledged for more than 2 minutes (`agent_unreachable`) | Review list, or failed card |
| `awaiting_review` «بانتظار المراجعة» | `locked` | Lock with 0 pending and ≥ 6 approved | Locked view; older locked versions → `superseded` |
| `failed` «تعذّر التوليد» | `generating` (acknowledged row) | «إعادة المحاولة» | For an unacknowledged row a **new version** is created instead and this row stays `failed` |
| `locked` «مقفل» | `superseded` | A newer version of the same job is locked | Stays in effect until then |
| `superseded` «استُبدلت بنسخة أحدث» | — | — | Shown in «سجل النسخ» only |

At most one version per job may be `generating` or `awaiting_review`.

### ST-BANK-QUESTION — Bank question review status (agent)

| State (badge) | Allowed next states | Trigger | Observable effect |
|---|---|---|---|
| `pending` «بانتظار المراجعة» | `approved`, `removed` | «اعتماد» or «تعديل» (edit sets approved); «حذف»; «ولّد بديلاً» (old → removed, new pending) | Counters update; lock blocked while any pending |
| `approved` «معتمد» | `approved` (edit), `removed` | «تعديل»; «حذف»; «ولّد بديلاً» | — |
| `removed` «محذوف» | `pending` | «استعادة» | — |
| gap probe `pending` | `approved` | Interview lock approves pending probes | — |

A locked bank's questions are frozen.

### ST-INTERVIEW — Interview assignment (`interview_assignments.status`)

Source: `srp/supabase/migrations/0019_interviews.sql:15-55`; `interview-agent/src/orchestrator/state-machine.ts:8-24`.

| State | Allowed next states (agent state machine) | Trigger reachable today | Observable effect (panel) |
|---|---|---|---|
| `draft` | `planning`, `cancelled`, `failed` | Gateway insert; agent reply/webhook; staff cancel; unbound > 2 min → `failed` (`agent_unreachable`) | «نرسل المقابلة إلى خدمة المقابلات» (no agent id) or «نجهّز أسئلة الاستيضاح» |
| `planning` | `awaiting_review`, `cancelled`, `failed` | Planner success (`interview.planned`); planner failure (`interview.failed`, unit returned); cancel | «نجهّز أسئلة الاستيضاح», polling |
| `awaiting_review` | `planning`, `scheduled`, `cancelled` (only `cancelled` reachable today) | Cancel; lock sets `bank_hash` / `bank_locked_at` **without** changing status | «أسئلة الاستيضاح» → «الأسئلة مقفلة», badge «الأسئلة جاهزة» |
| `scheduled`, `open`, `in_progress`, `submitted`, `evaluating`, `evaluated`, `expired` | per agent state machine | **No code path today (I2/I3)** | Would show `حالة المقابلة: {status}` |
| `cancelled` | — (terminal) | Staff cancel | «أُلغيت المقابلة السابقة.»; a new interview may be created |
| `failed` | `planning`, `evaluating` per agent (no route today) | Agent refusal at create; planner failure; stale draft | «تعذّر تجهيز المقابلة» + reason; a new interview may be created |

At most one live assignment per application (all statuses except cancelled, expired, failed). An older event never overwrites a newer one.

---

## 7. Permissions matrix

Legend: ✓ allowed · ✗ refused (with how) · RO read-only · — not applicable. "Other org" = a signed-in member of a different organization. Platform admin = row in `platform_admins` with **no** impersonation session.

### 7.1 Pages and actions

| Action | anon | Seeker (no membership) | viewer | hr | admin | owner | Other org | Platform admin |
|---|---|---|---|---|---|---|---|---|
| Browse public pages, `/t/{token}` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Guest apply `/jobs/[id]/apply` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Track by code | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Apply with profile `/me/apply/[id]` | ✗ → login | ✓ (step done) | ✗ → `/onboarding/seeker` unless they also have a profile | same | same | same | same | — |
| `/me/*` | ✗ → login | ✓ | ✗ → `/onboarding/seeker` | same | same | same | same | — |
| Create an org `/onboarding` | ✗ → login | ✓ (`?as=company`) | ✗ (→ `/admin`) | ✗ | ✗ | ✗ | ✗ | — |
| Accept an invitation | ✗ → login/signup | ✓ if the email matches | ✓ if the email matches | ✓ | ✓ | ✓ | ✓ if the email matches | — |
| Enter `/admin` | ✗ → `/login` | ✗ → `/onboarding` → `/me` | ✓ RO | ✓ | ✓ | ✓ | ✓ own org only | ✗ (no UI) |
| View jobs, applicants, application pages, calendar, stats | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ 404 | ✗ (no UI) |
| Open CV (signed URL) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Export transparency report | ✗ → login | ✗ → onboarding | ✓ | ✓ | ✓ | ✓ | ✗ 500 `report_failed` | ✗ |
| Create / edit / publish / close / delete jobs | ✗ | ✗ | ✗ `?error=forbidden` «صلاحيتك في هذه المؤسسة للاطّلاع فقط» | ✓ | ✓ | ✓ | ✗ 404 / 0 rows | ✗ |
| Change status, save notes, save interview record, re-run analysis | ✗ | ✗ | ✗ silent redirect to `/admin`; RPC `forbidden` | ✓ | ✓ | ✓ | ✗ | ✗ |
| Interview bank and interview actions | ✗ | ✗ | ✗ controls hidden; action «صلاحيتك في هذه المنشأة للاطلاع فقط.»; gateway 404 | ✓ | ✓ | ✓ | ✗ «لم نجد هذا العنصر، أو لم يعد متاحاً لك.» / 404 | ✗ |
| `/admin/settings` (branding, retention, compliance, team, invites) | ✗ | ✗ | ✗ → `/admin` | ✗ → `/admin` | ✓ | ✓ | ✗ | ✗ |
| Invite or grant the owner role | ✗ | ✗ | ✗ | ✗ | ✗ «المالك وحده يستطيع تعيين مالك آخر» | ✓ | ✗ | ✗ |
| Change an owner's role | ✗ | ✗ | ✗ | ✗ | ✗ (silent no-op, KD-09) | ✓ | ✗ | ✗ |
| Change own role | — | — | ✗ | ✗ | ✗ «تعذّر تحديث الدور» | ✗ | — | — |
| Remove the last owner | — | — | — | — | ✗ | ✗ (DB trigger 23514) | — | — |
| Saudization toggle / compliance save | ✗ | ✗ | ✗ | ✗ by DB grant (KD-02) | ✗ by DB grant (KD-01, KD-02) | ✗ by DB grant | ✗ | ✗ |
| Change `monthly_analysis_quota`, `monthly_interview_quota`, `plan_code`, `status` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | service role only (no UI) |

### 7.2 Tables and buckets (as implemented; DB-RLS tests)

| Table / bucket | anon | viewer | hr | admin | owner | Platform admin (no session) |
|---|---|---|---|---|---|---|
| `organizations` | select live orgs (trial/active, not deleted); `listed_publicly` **not** checked at DB level (OQ-03) | select own (any status) and live orgs | same | + update of name, slug, logo_path, cover_path, about, website, industry, city, brand_color, listed_publicly, retention_months | same; **no delete** (OQ-08) | select all |
| `memberships` | none | select own org | select own org | insert/update/delete non-owner rows and roles | full; ≥ 1 owner kept (23514) | select all |
| `profiles` | 0 rows | self and co-members; update own `full_name` | same | same | same | select all |
| `jobs` | published, not deleted, org live | all own incl. drafts and soft-deleted | insert/update; soft delete; DELETE revoked | same | same | select all |
| `applications` | none | select | select; update `interview_at`, `interview_qa` only; status via RPC | same | same | select all |
| `ai_evaluations` | none | select | select; update `interview_notes` only | same | same | select all |
| `status_history` | none (`track_application` RPC only) | select | select + **insert** (SEC-02) | same | same | select all |
| `invitations` | none | select own org | select | insert (owner role only by an owner), update (no owner ceiling, SEC-01), no delete | same | select all |
| `analysis_usage` | none | select | select | select | select | none |
| `submission_attempts`, `interview_webhook_events` | none | none | none | none | none | none |
| `interview_assignments`, `interview_reports`, `interview_job_banks` | none | select | select (writes only via the gateway) | same | same | select all |
| `platform_admins`, `impersonation_sessions` | none | none | none | none | none | full |
| `talent.skills` | select | select | select | select | select | select |
| other `talent.*` | none | none | none | none | none | none |
| Bucket `cvs` | none | read own org folder | same | same | same | none |
| Bucket `org-assets` | public read | public read | public read | write own org folder | same | public read |
| Bucket `talent-cvs` | none | none | none | none | none | none (service role only) |

### 7.3 What a refused attempt looks like

- RLS-filtered reads return 0 rows. A policy-refused INSERT raises SQLSTATE 42501; a missing grant raises 42501 "permission denied for table …". UPDATE/DELETE outside the policy match 0 rows.
- RPC errors: `'forbidden'` (42501), `'not a member of this organization'` (42501), `'invitation not valid'` / `'invitation expired'` (42501), `'already a member of an organization'` / `'slug taken'` (23505), `'invalid slug'` (23514), `'organization name too short'` / `'full name too short'` (22023).
- Guard trigger: `'applicant_user_id and via_account are set by the platform only'`.
- How PostgREST maps these to HTTP status codes is not asserted anywhere in this repository.

---

## 8. Non-functional requirements

### F-NFR-01 — Security, privacy, cost, localisation, accessibility, performance and resilience (P0)

#### REQ-NFR-01 — Rate limits
- **Routes:** Edge `submit-application`, `talent-upload`, `seeker-account`; agent bank generation
- **Priority:** P0
- **Test type:** API
- **Source:** `0008_submission_throttle.sql`; `0017_talent_platform.sql:201-229`; `0020_seeker_accounts.sql:624-673`; `interview-agent/src/orchestrator/budget.ts:25`
- **Rules:**

  | Limit | Value | Code / message |
  |---|---|---|
  | Applications per IP (guest) or account (profile) | 5 per hour, 20 per day | 429 `rate_limited` |
  | Applications per email (global, guest + profile) | 10 per day | 429 `rate_limited` |
  | Seeker CV uploads per account | 3 per rolling 24 h | «بلغت حد الرفع اليومي. حاول مرة أخرى غداً.» |
  | Legacy link requests | 1 per 2 minutes | «أرسلنا رابطاً قبل قليل. انتظر دقيقتين ثم اطلب رابطاً جديداً إن لم يصلك.» |
  | Interview bank generation starts per tenant | 10 per UTC day | «بلغت منشأتك الحد اليومي لتوليد بنوك الأسئلة. أعد المحاولة غداً.» |
  | Regenerations | job bank 15 (and ≤ 20 model calls); gap probes 5 (≤ 30 calls) per interview | «استُنفد عدد مرات توليد البدائل المتاح هنا.» |

  No throttle exists on `track_application`, the applicant kinds of `send-email`, `housekeeping`, or `analyze-application` for pending rows (SEC-03, SEC-04, SEC-05, SEC-07).
- **Acceptance criteria:**
  - **AC-NFR-01.1** — [API] *Given* each limit above, *when* it is exceeded by one, *then* the stated code or message is returned (see AC-APPLY-07.1, AC-SONB-05.1, AC-LINK-02.2, AC-BANK-03.6, AC-BANK-10.2).

#### REQ-NFR-02 — Secrets never reach the browser (D3)
- **Routes:** all pages
- **Priority:** P0
- **Test type:** API; visual
- **Source:** grep of `process.env` (only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NODE_ENV` in the app)
- **Rules:** `GEMINI_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, the service-role key and all `INTERVIEW_*` secrets live only in Edge Function (or agent) environments. Next.js never holds the gateway's signing secret.
- **Acceptance criteria:**
  - **AC-NFR-02.1** — *Given* the built client bundles and page HTML, *when* they are searched, *then* no Gemini key, Resend key, Turnstile secret, service-role key or interview secret appears.

#### REQ-NFR-03 — Signed CV links, hashed identifiers, no CV content in logs (D8, §8)
- **Routes:** application page; Edge Function logs
- **Priority:** P0
- **Test type:** API; DB-RLS
- **Source:** `srp/app/(dashboard)/admin/applications/[id]/page.tsx:130`; `analyze-application/index.ts`; `0008`, `0017`
- **Rules:** CV links are signed for 600 s («رابط السيرة صالح لمدة 10 دقائق»). IPs and emails in throttle tables are salted SHA-256 hashes; invitation and legacy-link tokens are stored hashed (the legacy `verify_token` is stored in clear). `analyze-application` logs only duration, model, CV type and error messages capped at 500 characters; blind mode logs only the count of removed categories; talent functions log `{fn, trace, step}`; gateway and webhook log ids and codes only. Applicant data is never used for model training (CLAUDE.md D8; privacy page text). The interview agent never receives a name (REQ-IGW-06).
- **Acceptance criteria:**
  - **AC-NFR-03.1** — [DB] *Given* the `invitations` table, *when* inspected, *then* no plain token is stored, only `token_hash`.
  - **AC-NFR-03.2** — *Given* an analysis run, *when* the function logs are read, *then* they contain no CV text and no model justification text.

#### REQ-NFR-04 — Retention (D8, D9)
- **Routes:** Edge `housekeeping`; `/admin/settings`
- **Priority:** P1
- **Test type:** API
- **Source:** see F-RET-01
- **Rules:** default 12 months, owner/admin editable 1–60; daily deletion of applications and CVs past the period; the only hard delete. Covered by REQ-RET-02.
- **Acceptance criteria:**
  - **AC-NFR-04.1** — *Given* AC-RET-02.1, *when* it passes, *then* this requirement is met.

#### REQ-NFR-05 — AI cost guard (§8)
- **Routes:** all pages; Edge `analyze-application`, `talent-analyze`
- **Priority:** P0
- **Test type:** API
- **Source:** `analyze-application/index.ts`; CLAUDE.md §8
- **Rules:** exactly one evaluation model call per application analysis (plus one redaction call with blind screening, still one quota unit); manual re-run allowed; **no model call on page render, ever**; one talent analysis per stored CV version (no automatic retry). Interviews run under per-interview budgets enforced by the agent (30 model calls, 300k input / 60k output tokens per interview; 20 calls, 1.2M / 700k per bank).
- **Acceptance criteria:**
  - **AC-NFR-05.1** — *Given* an analysed application, *when* its pages (list, detail tabs, transparency report, stats) are loaded 10 times, *then* `analysis_usage.used` and `analysis_attempts` do not change.
  - **AC-NFR-05.2** — *Given* one guest application, *when* it completes, *then* `analysis_usage.used` increased by exactly 1.

#### REQ-NFR-06 — Arabic only, RTL, no English UI text (D23, §8, §10.7)
- **Routes:** all pages and emails
- **Priority:** P0
- **Test type:** UI e2e; visual
- **Source:** `srp/app/layout.tsx:57-60`; `srp/lib/i18n/ar.ts`; `srp/DESIGN.md` §4
- **Rules:** `<html dir="rtl">` with Arabic `lang`; all strings from `ar.ts` (single dictionary, no i18n framework); Tailwind logical properties only (no `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` classes); no letter-spacing on Arabic; no italics on Arabic; directional icons point the reading way; IBM Plex Sans Arabic for UI text. Latin text is allowed only as explicit LTR islands (emails, URLs, phone numbers, reference codes, hashes) and for product/technology names inside Arabic sentences (e.g. «Google», «PDF», «DOCX», «Markdown», «React»).
- **Acceptance criteria:**
  - **AC-NFR-06.1** — *Given* every route in §4.1, *when* rendered, *then* the root element has `dir="rtl"`.
  - **AC-NFR-06.2** — *Given* every route, *when* visible text nodes are scanned, *then* no English sentence or English UI label appears outside the allowed Latin islands and names.
  - **AC-NFR-06.3** — *Given* the source, *when* `srp/app` and `srp/components` are searched, *then* no physical-direction class (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`) is used. (At HEAD the only match is `left-1/2` used to centre the card stage in `srp/components/react-bits/CardSwap.tsx:929`, a direction-neutral centring; treat it as a known exception or flag it for review.)
  - **AC-NFR-06.4** — *Given* emails, phone numbers, URLs and reference codes on any page, *when* inspected, *then* each is wrapped with `dir="ltr"`.

#### REQ-NFR-07 — Accessibility
- **Routes:** all pages
- **Priority:** P1
- **Test type:** UI e2e; visual
- **Source:** `srp/app/layout.tsx:63-68`; `srp/DESIGN.md` §2, §4 (A10), component table; components cited in §5
- **Rules:** skip link «تخطَّ إلى المحتوى»; every interactive element has a visible focus ring; text contrast ≥ 4.5:1; `aria-current="page"` on the active seeker nav link; spinners use `role=status`; inline errors use `role=alert`; skill toggles use `aria-pressed`; step indicator announces `الخطوة {current} من {total}`; menus labelled «القائمة»; decorative scenes are `aria-hidden`; `prefers-reduced-motion` honoured everywhere.
- **Acceptance criteria:**
  - **AC-NFR-07.1** — *Given* an automated accessibility scan (e.g. axe) of `/`, `/jobs`, `/jobs/{id}/apply`, `/track/{ref}`, `/login`, `/signup`, `/onboarding/seeker`, `/me`, `/admin`, `/admin/jobs/{id}/applicants` and `/admin/applications/{id}`, *when* it runs, *then* there are no critical violations.
  - **AC-NFR-07.2** — *Given* keyboard-only use, *when* the guest apply form is completed and submitted, *then* every control is reachable and shows a visible focus ring.

#### REQ-NFR-08 — Responsive layout at 390 px
- **Routes:** all pages
- **Priority:** P1
- **Test type:** visual; UI e2e
- **Source:** CLAUDE.md FR-03; `srp/DESIGN.md` §5 and checklist ("test RTL and 375px width on every page")
- **Rules:** primary mobile viewport 390 px wide (DESIGN.md also asks for 375 px; test both). 16 px page gutter on mobile. No horizontal page scroll; public header collapses into «القائمة»; seeker nav collapses into «القائمة» below md; the apply-with-profile panel appears before the form on mobile.
- **Acceptance criteria:**
  - **AC-NFR-08.1** — *Given* 390 px and 375 px viewports, *when* each route in §4.1 is rendered, *then* `document.documentElement.scrollWidth` does not exceed the viewport width.
  - **AC-NFR-08.2** — *Given* 390 px, *when* the guest apply flow is completed end to end, *then* it succeeds without zooming or horizontal scrolling.

#### REQ-NFR-09 — Performance and freshness
- **Routes:** public pages; dashboard lists
- **Priority:** P1
- **Test type:** API; UI e2e
- **Source:** `revalidate` exports in `srp/app/(public)/*`; `srp/app/sitemap.ts`
- **Rules:** ISR `revalidate = 60` on `/jobs`, `/jobs/[id]`, `/jobs/[id]/apply`, `/companies`, `/c/[slug]`; sitemap 3600 s; `/track/[ref]` and `/t/[token]` are `force-dynamic`. Job actions revalidate the public paths at once (REQ-AJOBS-08). Lists are paginated: company jobs 10, applicants 20, seeker applications 10, seeker jobs 24 per "show more". Ranking reads the indexed `applications.fit_score`; stats aggregate in the database.
- **Acceptance criteria:**
  - **AC-NFR-09.1** — *Given* `/jobs`, *when* fetched twice within 60 s with a job changed directly in the database between the fetches, *then* the second response may still be the cached page; after 60 s and a further request, the change appears.
  - **AC-NFR-09.2** — *Given* a consent withdrawal, *when* `/t/{token}` is fetched right after, *then* it returns the 404 page (no caching).

#### REQ-NFR-10 — Resilience (D4)
- **Routes:** apply flows; status changes; invitations
- **Priority:** P0
- **Test type:** UI e2e; API
- **Source:** `submit-application/index.ts:643-652`; `srp/app/(dashboard)/admin/applications/actions.ts:110-125`
- **Rules:** applying never fails because of the AI or the mailer; every AI failure leaves the application usable (HR can read the CV); email failures never fail a status change; an invitation is created even if its email fails.
- **Acceptance criteria:**
  - **AC-NFR-10.1** — *Given* Gemini and Resend both unavailable, *when* a guest applies and HR changes the status to «دعوة لمقابلة», *then* both actions succeed in the UI, and HR can open the CV.

---

## 9. Emails

All applicant and invitation emails are sent through the Edge Function `send-email` (Resend), as RTL HTML. Sender `EMAIL_FROM` (default `onboarding@resend.dev`). The company name appears in the footer of applicant emails. Strings below come from `srp/supabase/functions/send-email/templates.ts` unless noted. Missing `RESEND_API_KEY` → 500 `email not configured`; a Resend failure → 502 `send failed`.

| ID | Kind | Trigger | Recipient | Must contain | Must NOT contain |
|---|---|---|---|---|---|
| EM-01 | `application_received` | `submit-application` after insert (guest and profile) | The applicant's email on the application | Subject `تم استلام طلبك — {jobTitle}`; heading «تم استلام طلبك بنجاح»; the reference code (LTR, monospace); link «تتبّع حالة طلبك من هنا» to `/track/{ref}` **only when `SITE_URL` is set**; company name | Score, AI text |
| EM-02 | `interview_invited` | Next status action after the RPC sets `interview` | Applicant | Subject `دعوة لمقابلة — {jobTitle}`; heading «دعوة لمقابلة»; the reference code; tracking link when `SITE_URL` is set | Score, AI text, an interview link (none exists; I2 not built) |
| EM-03 | `accepted` | Next status action, status `accepted` | Applicant | Subject `تهانينا — {jobTitle}`; heading «تهانينا!» | Score, AI text |
| EM-04 | `rejected` | Next status action, status `rejected` | Applicant | Subject `تحديث بخصوص طلبك — {jobTitle}`; heading «شكراً لاهتمامك»; «بعد دراسة الطلبات المقدمة، قررنا المضي مع مرشحين آخرين لهذه الوظيفة.» | **Any** AI reasoning: score, strengths, gaps, red flags, questions (REQ-ETH-05) |
| — | (none) | Status `new` or `under_review`; a direct RPC call | — | Nothing is sent | — |
| EM-05 | Supabase Auth sign-up confirmation (not Resend) | `/signup` with confirmations on | The new account | Local template: subject «تأكيد بريدك الإلكتروني», button «تأكيد البريد»; link through `/auth/callback?…&via=email` (hosted projects send English defaults unless configured) | — |
| EM-06 | `invitation` | `manage-users` invite (service role only; other callers 403 `service role only`) | The invited email | Subject `دعوة للانضمام إلى فريق {companyName}`; heading «دعوة للانضمام»; button «قبول الدعوة» to `{SITE_URL}/invite/{token}` and the copyable link — **omitted when `SITE_URL` is unset**; «تنتهي صلاحية هذه الدعوة خلال سبعة أيام. إن لم تكن تتوقع هذه الرسالة فتجاهلها.» | — |
| EM-07 | `talent_verify` (legacy) | **No current caller** | — | Subject «أكّد بريدك لإنشاء صفحتك المهنية» | Do not test (dormant) |
| EM-08 | `talent_link` | `seeker-account` `request_link` (service role) | The **legacy profile's** email | Subject «اربط صفحتك المهنية بحسابك»; heading «طلب ربط صفحتك بحساب»; button «ربط صفحتي بحسابي» to `{SITE_URL}/onboarding/seeker/link/{token}`; «الرابط صالح ساعة واحدة.» | — |

**Email-related acceptance notes**
- Applicant kinds accept any JWT (including the anon key) plus an application UUID; a bad kind or id → 400 `invalid kind or application_id`; an unknown application → 404 (SEC-03).
- Re-selecting the current status in a stale tab re-sends EM-02/03/04 (KD-15).
- The UI hint mentions only interview and rejection, although EM-03 is also sent (OQ-19).

---

## 10. External integrations and failure behaviour

| Integration | Configuration | Used by | When missing or failing, the user sees |
|---|---|---|---|
| **Google Gemini** (`gemini-3.5-flash`) | `GEMINI_API_KEY` in Edge Functions (and separately in the agent) | `analyze-application`, `talent-analyze`, the interview agent | **Company side:** the analysis ends `failed` (quota refunded if the model was not reached); HR sees «فشل التحليل — يمكن قراءة السيرة يدوياً وإعادة المحاولة (المحاولات: {n})» and can read the CV; applying still succeeds. **Seeker side:** version `failed` at `configuration`/`model_call` → «تعثّرت القراءة لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل.» (onboarding) or «تعثّر التحليل لسبب من جهتنا لا من ملفك. ارفع الملف نفسه مرة أخرى بعد قليل، وإن تكرّر فأرسل إلينا الرسالة التالية كما هي:» (`/me/profile`) with a reference. **Agent:** «نموذج توليد الأسئلة غير مهيّأ في خدمة المقابلات حالياً. تواصل مع الدعم.» |
| **Resend** | `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` | `send-email` | No email; submissions and status changes still report success. Invitation → «أُنشئت الدعوة لكن تعذّر إرسال البريد — راجع إعدادات البريد ثم أعد الإرسال». Legacy link → «تعذّر إرسال رسالة الربط. حاول مرة أخرى بعد قليل. رمز المرجع: {id}». Without `SITE_URL`: no tracking link, **no invitation button**, legacy link request `not_configured` |
| **Supabase Auth email** | Dashboard templates | Sign-up confirmation | English default emails unless the Arabic templates are configured |
| **Cloudflare Turnstile** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Guest apply only | Both unset or Cloudflare down → submissions allowed. Token missing/invalid with the secret set → «تعذّر التحقق من أنك لست روبوتاً، يرجى المحاولة مرة أخرى». Secret without site key → every guest submission refused (KD-03) |
| **Google OAuth** | Supabase provider settings (disabled locally) | `/login`, `/signup` | Start failure or cancel → `/login?error=oauth` «تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى، أو استخدم البريد وكلمة المرور.» Behaviour when the provider is disabled on a hosted project is decided by Supabase |
| **Interview agent** | `INTERVIEW_AGENT_URL`, `INTERVIEW_AGENT_KEYS`, `INTERVIEW_REF_SECRET` (gateway); `INTERVIEW_WEBHOOK_SECRETS` (webhook) | Bank page, interview panel, retention erasure | Unset → «خدمة المقابلات الافتراضية غير مهيّأة على المنصة بعد. تواصل مع الدعم.»; unreachable or slow → «تعذّر الوصول إلى خدمة المقابلات أو تأخر ردها. حدّث الصفحة لترى آخر حالة، ثم أعد المحاولة إن لزم.»; key mismatch / agent 400-401-500 → «رفضت خدمة المقابلات الطلب. أعد المحاولة، وإن تكرر فتواصل مع الدعم.»; off-contract reply → «وصل من خدمة المقابلات رد غير متوقع فلم نعرضه. أعد المحاولة.»; webhook unset → 503 (statuses still sync when the panel renders; failure reasons are lost); retention keeps applications whose interview could not be erased |
| **pg_cron + pg_net** | DB settings `app.housekeeping_url`, `app.housekeeping_key` | Daily housekeeping | No automatic retries and no retention deletion; migration `0012` warns |
| **Supabase Auth service outage** | — | Profile-mode apply, `talent-upload`, `seeker-account` | 500 `server_error` (generic or upload message with a reference), not a login prompt |
| **`talent` schema not exposed** | Data API exposed schemas | Talent functions | 500 `not_configured` → «تعذّر رفع السيرة. حاول مرة أخرى. رمز المرجع: {id}» |
| **Supabase env missing in Next.js** | `NEXT_PUBLIC_SUPABASE_*` | All data pages | `/jobs` → «تعذّر تحميل البيانات» / «المشكلة مؤقتة وليست عندك — لا يعني هذا أنه لا توجد وظائف. حدّث الصفحة بعد قليل.»; `/companies` → empty state; job, apply and careers pages → 404; `/track/x` → not found; sitemap → static entries only; `/admin` → `/login` |
| **`org-assets` bucket** | — | Logos and covers | URL failure → building-icon fallback |

---

## 11. Out of scope / not built — do NOT generate tests for these

| Item | Status in code | Notes |
|---|---|---|
| **P2 recommendations** — `recommended_jobs_for_me()`, «مناسبة لك» badges, ranking for seekers | Not built | Landing steps «وظائف مناسبة لك، وسببها» and «قدّم بضغطة» carry «قريباً» (the second although applying with a profile exists — OQ-27) |
| **P2 «مرشحون مقترحون»** (suggested candidates) and company invitations to seekers with limits | Not built | `consent_offers` is stored and editable but nothing reads it |
| **P2 skill taxonomy expansion**, `jobs.skill_ids` | Not built | 36 seeded skills only |
| **P4 internal redesign** | Not built | — |
| **I2 candidate interview room** — «مهامي», consent screen, timer, dispatch, session tokens from the platform | Not built | «إرسال للمتقدم» permanently disabled; no gateway session-token/dispatch/extend action; `opens_at`/`closes_at` unused |
| **Interview statuses after `awaiting_review`** (`scheduled` … `evaluated`, `expired`) | No code path | — |
| **I3 interview evaluation, report, authenticity signals** | Not built | `interview_reports` never written; no score or report in the UI |
| **I4 code sandbox (Judge0)** | Not built | «أسئلة برمجة» disabled «قريباً»; agent `coding_unavailable` |
| **I5 voice** | Not built | «صوتي» disabled «قريباً»; agent `voice_unavailable` |
| **I6 hardening** | Not built | — |
| **Retry of a failed interview** | Not built | Staff create a new interview |
| **`/admin/interviews` list page**, interview emails or notifications | Not built | Only server actions exist |
| **UI to view or change interview quota or usage** | Not built | — |
| **Erasing a job bank on the agent**; editing core questions from the panel | Not built | — |
| **S4 platform console** `/platform`, impersonation UI and banner, changing org status or quotas | Not built | SQL / service role only |
| **S5 billing**: payments, plan upgrades, seat limits, active-job limits, 14-day trial expiry, `plan_code` mapping | Not built | Only the analysis quota (25 default) and the interview allowance are enforced |
| **Near-limit quota warning** (`ar.quota.nearLimit`) | Defined, never rendered | — |
| **Password reset / forgot password** | Not built | A recovery template exists but no `resetPasswordForEmail` call |
| **Email or password change** in the seeker portal | Not built | — |
| **Custom domains** (paid feature in D17) | Not built | Only the subdomain rewrite |
| **Contact page or form**; `#contact` anchor | Not built | KD-05 |
| **Accountless talent upload** | Removed | Only legacy token pages remain |
| **Marketplace extras**: department filter dropdown, filters in the URL, pagination on `/jobs`, `/companies`, careers pages, "clear filters" | Not built | Search matches department text instead |
| **Live slug availability check** | Not built | `slug_available` RPC unused |
| **Removing a team member**, restoring a deleted job, Saudization summary (`org_saudization`), past-interviews list, calendar invites, showing `analysis_error`, auto-refresh of the ranked list, "resend invitation" button | Not built | Re-invite through the form instead |
| **Seeker CV version management** beyond upload (download, delete one version, choose current) | Not built | — |
| **Editing or hiding** experiences, education, languages, strengths or focus areas | Not built | Only skills can be hidden |
| **Manual re-analyse button and automatic retries for seeker CVs**; low-confidence check for talent analysis | Not built | Re-upload is the only path |
| **English UI / i18n** | Not supported (D23) | — |
| **Defined but never rendered strings** — do not assert: `ar.legal.lastUpdated`, `ar.talent.seekerBanner`, `ar.landing.ctaSecondary`, `ar.landing.browseJobs`, `ar.jobs.featuredTitle`, `ar.jobs.listTitle`, `ar.jobs.emptyTitle`, `ar.jobs.filterDepartment`, `ar.marketplace.allCompanies`, `ar.marketplace.viewAllAtCompany`, `ar.auth.errors.noProfile`, `ar.common.comingSoonTitle`, `application.notFound`, `application.currentStatus`, `interview.sectionTitle`, `interview.scheduleSave`, `interview.scheduleSaved`, `interview.manageTitle`, `settingsPage.roleSaved` («تم تحديث الدور»), `blindScreening.enabled`, `blindScreening.disabled`, `transparency.exporting`, `transparency.failed`, `adminJobs.table.createdAt`, `calendar.past` («مقابلات سابقة»), «تعذّر إلغاء الدعوة», «تعذّر إزالة العضو — لا يمكن ترك المؤسسة بلا مالك» | Dormant | — |

---

## 12. Traceability matrix

One row per requirement, generated from the requirement blocks of §1 and §5–§8 (heading, **Routes**, **Priority**, **Test type**, and the number of acceptance criteria). "Feature" is the parent `F-` ID.

Totals at version 1.0: **51 features** (26 P0, 19 P1, 6 P2), **206 requirements** (93 P0, 88 P1, 25 P2), **667 acceptance criteria**.

Suggested test type, as used in the table:
- **UI e2e** — browser test of the Arabic RTL UI (Playwright is the approved devDependency, D10).
- **API** — direct HTTP calls to Edge Functions, route handlers or PostgREST RPCs.
- **DB-RLS** — SQL as `anon` / `authenticated` per role / `service_role`; extend the suites in `srp/supabase/tests/`.
- **visual** — screenshot or layout assertion (RTL, 390 px and 375 px, colour bands).

| REQ | Feature | Title | Route(s) / endpoint(s) | Priority | Suggested test type | ACs |
|---|---|---|---|---|---|---|
| REQ-ETH-01 | F-ETH-01 | Advisory wording on every displayed score | `/admin/jobs/[id]/applicants`, `/admin/applications/[id]?tab=evaluation`, `/admin/stats`, `/admin/calendar`, `/admin/applications/[id]/transparency` | P0 | UI e2e; visual | 6 |
| REQ-ETH-02 | F-ETH-01 | The decision is always human | `/admin/applications/[id]`, `/track/[ref]`; Edge `analyze-application`, `housekeeping`, `interview-webhook`; RPC `change_application_status` | P0 | UI e2e; API; DB-RLS | 5 |
| REQ-ETH-03 | F-ETH-01 | No score without its justification | `/admin/applications/[id]?tab=evaluation`, `/admin/applications/[id]/transparency` | P0 | UI e2e; API | 3 |
| REQ-ETH-04 | F-ETH-01 | Applicants and seekers never see a numeric score or AI text | `/track/[ref]`, `/me`, `/me/applications`, `/me/apply/[jobId]`, `/t/[token]`; all applicant emails | P0 | UI e2e; DB-RLS | 4 |
| REQ-ETH-05 | F-ETH-01 | Rejection emails never contain AI reasoning | `/admin/applications/[id]` (status change); Edge `send-email` kind `rejected` | P0 | UI e2e; API | 1 |
| REQ-ETH-06 | F-ETH-01 | No authenticity verdicts, no biometric inference | all `/admin/*` pages; the virtual-interview panel | P1 | UI e2e | 2 |
| REQ-MKT-01 | F-MKT-01 | Header navigation | all `(public)` pages | P2 | UI e2e; visual | 3 |
| REQ-MKT-02 | F-MKT-01 | Footer | all `(public)` pages | P2 | UI e2e | 2 |
| REQ-MKT-03 | F-MKT-01 | 404 page, error page, skip link and page titles | any unknown route; any server error | P1 | UI e2e | 4 |
| REQ-MKT-04 | F-MKT-02 | Landing page content | `/` | P2 | UI e2e; visual | 3 |
| REQ-MKT-05 | F-MKT-02 | Landing motion rules (D29) | `/` | P2 | UI e2e; visual | 3 |
| REQ-MKT-06 | F-MKT-02 | Pricing page | `/pricing` | P2 | UI e2e | 3 |
| REQ-MKT-07 | F-MKT-02 | Fairness page | `/fairness` | P2 | UI e2e | 1 |
| REQ-MKT-08 | F-MKT-02 | Legal drafts | `/privacy`, `/terms` | P2 | UI e2e | 1 |
| REQ-MKT-09 | F-MKT-02 | Seeker marketing page `/talent` | `/talent` | P2 | UI e2e | 2 |
| REQ-SEO-01 | F-SEO-01 | Sitemap | `/sitemap.xml` | P2 | API | 3 |
| REQ-SEO-02 | F-SEO-01 | robots.txt | `/robots.txt` | P2 | API | 1 |
| REQ-SEO-03 | F-SEO-01 | JobPosting JSON-LD on job detail | `/jobs/[id]` | P2 | API; UI e2e | 2 |
| REQ-JOBS-01 | F-JOBS-01 | Which jobs are listed | `/jobs` | P0 | UI e2e; DB-RLS | 5 |
| REQ-JOBS-02 | F-JOBS-01 | Marketplace page states | `/jobs` | P0 | UI e2e | 2 |
| REQ-JOBS-03 | F-JOBS-01 | Marketplace search, filters and layout toggle | `/jobs` | P1 | UI e2e | 5 |
| REQ-JOBS-04 | F-JOBS-01 | Company group header and job card | `/jobs` | P1 | UI e2e | 2 |
| REQ-JOBS-05 | F-JOBS-02 | Job detail visibility | `/jobs/[id]` | P0 | UI e2e; DB-RLS | 5 |
| REQ-JOBS-06 | F-JOBS-02 | Job detail content | `/jobs/[id]` | P0 | UI e2e | 2 |
| REQ-JOBS-07 | F-JOBS-02 | Closed-for-applications state | `/jobs/[id]`, `/jobs/[id]/apply` | P0 | UI e2e | 3 |
| REQ-JOBS-08 | F-JOBS-02 | Apply buttons on job detail | `/jobs/[id]` | P0 | UI e2e | 3 |
| REQ-CAREERS-01 | F-CAREERS-01 | Careers page visibility | `/c/[slug]` | P1 | UI e2e; DB-RLS | 4 |
| REQ-CAREERS-02 | F-CAREERS-01 | Careers page content | `/c/[slug]` | P1 | UI e2e; visual | 4 |
| REQ-CAREERS-03 | F-CAREERS-01 | Subdomain rewrite | `{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}/…` | P2 | UI e2e | 3 |
| REQ-COMP-01 | F-COMP-01 | Directory listing | `/companies` | P1 | UI e2e | 4 |
| REQ-APPLY-01 | F-APPLY-01 | Apply page availability and layout | `/jobs/[id]/apply` | P0 | UI e2e | 4 |
| REQ-APPLY-02 | F-APPLY-01 | Applicant field validation | `/jobs/[id]/apply`; Edge `submit-application` | P0 | UI e2e; API | 7 |
| REQ-APPLY-03 | F-APPLY-01 | CV file rules | `/jobs/[id]/apply`; Edge `submit-application` | P0 | UI e2e; API | 9 |
| REQ-APPLY-04 | F-APPLY-01 | Screening questions on the guest form | `/jobs/[id]/apply`; Edge `submit-application` | P0 | UI e2e; API | 5 |
| REQ-APPLY-05 | F-APPLY-01 | One application per job and email | `/jobs/[id]/apply`; Edge `submit-application` | P0 | UI e2e; API | 4 |
| REQ-APPLY-06 | F-APPLY-01 | Job must be open when the form is submitted | Edge `submit-application` | P0 | API; UI e2e | 5 |
| REQ-APPLY-07 | F-APPLY-01 | Submission rate limits | Edge `submit-application`; RPC `record_submission_attempt` (service role only) | P0 | API; DB-RLS | 7 |
| REQ-APPLY-08 | F-APPLY-01 | Bot check (Cloudflare Turnstile) | `/jobs/[id]/apply`; Edge `submit-application` | P1 | UI e2e; API | 4 |
| REQ-APPLY-09 | F-APPLY-01 | Success screen and reference code | `/jobs/[id]/apply` | P0 | UI e2e; API | 3 |
| REQ-APPLY-10 | F-APPLY-01 | Server-side write path and CV storage (D15, D8) | Edge `submit-application`; table `applications`; bucket `cvs` | P0 | API; DB-RLS | 4 |
| REQ-APPLY-11 | F-APPLY-01 | Applying never fails because of the AI or the mailer (D4) | Edge `submit-application` | P0 | API; UI e2e | 4 |
| REQ-APPLY-12 | F-APPLY-01 | Application-received email | Edge `send-email` kind `application_received` | P1 | API; UI e2e (mail capture) | 2 |
| REQ-TRACK-01 | F-TRACK-01 | Tracking lookup form | `/track` | P0 | UI e2e | 3 |
| REQ-TRACK-02 | F-TRACK-01 | Tracking result | `/track/[ref]`; RPC `track_application` (anon) | P0 | UI e2e; API | 4 |
| REQ-TRACK-03 | F-TRACK-01 | Tracking not found | `/track/[ref]` | P0 | UI e2e | 2 |
| REQ-AUTH-01 | F-AUTH-01 | Sign-up page and audience tabs | `/signup`, `/signup?as=seeker`, `/signup?as=company` | P0 | UI e2e | 4 |
| REQ-AUTH-02 | F-AUTH-01 | Sign-up validation and errors | `/signup` | P0 | UI e2e | 4 |
| REQ-AUTH-03 | F-AUTH-01 | Sign-up result and confirmation email | `/signup`; Supabase Auth email; `/auth/callback` | P0 | UI e2e | 3 |
| REQ-AUTH-04 | F-AUTH-01 | Signed-in visitors on `/signup` and `/login` | `/signup`, `/login` | P1 | UI e2e | 3 |
| REQ-AUTH-05 | F-AUTH-02 | Login form and errors | `/login` | P0 | UI e2e | 4 |
| REQ-AUTH-06 | F-AUTH-02 | Login banners driven by the query string | `/login?error=…`, `/login?notice=…` | P1 | UI e2e | 2 |
| REQ-AUTH-07 | F-AUTH-02 | Post-login destination and `homePath()` | `/login`, `/onboarding` | P0 | UI e2e | 4 |
| REQ-AUTH-08 | F-AUTH-02 | "No account?" link on login | `/login` | P2 | UI e2e | 2 |
| REQ-AUTH-09 | F-AUTH-02 | Sign-out | sidebar «تسجيل الخروج» in `/admin`; `/me` and `/onboarding/seeker` headers | P1 | UI e2e | 1 |
| REQ-AUTH-10 | F-AUTH-03 | Starting Google sign-in | `/login`, `/signup` | P1 | UI e2e | 2 |
| REQ-AUTH-11 | F-AUTH-03 | Auth callback outcomes | `/auth/callback` | P1 | UI e2e | 3 |
| REQ-AUTH-12 | F-AUTH-04 | `safeNext` rules | `/login`, `/signup`, `/auth/callback`, Google start | P0 | UI e2e | 2 |
| REQ-ONB-01 | F-ONB-01 | Onboarding router | `/onboarding` | P0 | UI e2e | 3 |
| REQ-ONB-02 | F-ONB-01 | Chooser | `/onboarding`, `/onboarding?as=seeker`, `/onboarding?as=company` | P0 | UI e2e | 2 |
| REQ-ONB-03 | F-ONB-01 | Company workspace form | `/onboarding` | P0 | UI e2e | 3 |
| REQ-ONB-04 | F-ONB-01 | Workspace creation validation and errors | `/onboarding`; RPC `create_organization` | P0 | UI e2e; DB-RLS | 5 |
| REQ-ONB-05 | F-ONB-01 | Workspace creation success | `/onboarding` → `/admin` | P0 | UI e2e; DB-RLS | 3 |
| REQ-ONB-06 | F-ONB-01 | A seeker adds a company workspace | `/onboarding?as=company` | P1 | UI e2e | 2 |
| REQ-INV-01 | F-INV-01 | Issuing an invitation | `/admin/settings` (form «دعوة عضو بالبريد»); Edge `manage-users` action `invite` | P1 | UI e2e; API | 6 |
| REQ-INV-02 | F-INV-01 | Pending invitations list and revoke | `/admin/settings` | P2 | UI e2e | 2 |
| REQ-INV-03 | F-INV-01 | Invitation page, signed out | `/invite/[token]`; RPC `invitation_preview` (anon) | P1 | UI e2e | 2 |
| REQ-INV-04 | F-INV-01 | Accepting an invitation | `/invite/[token]`; RPC `accept_invitation` | P1 | UI e2e; DB-RLS | 3 |
| REQ-INV-05 | F-INV-01 | Invitation acceptance errors | `/invite/[token]` | P1 | UI e2e | 2 |
| REQ-ROLE-01 | F-ROLE-01 | Workspace gate | `/admin/*` | P0 | UI e2e | 3 |
| REQ-ROLE-02 | F-ROLE-01 | Role labels | `/admin` sidebar; settings team table; invitation page | P1 | UI e2e | 2 |
| REQ-ROLE-03 | F-ROLE-01 | Organization switcher and active org | `/admin` sidebar | P1 | UI e2e | 4 |
| REQ-ROLE-04 | F-ROLE-01 | Viewer is read-only everywhere | `/admin/*` | P0 | UI e2e; DB-RLS | 4 |
| REQ-ROLE-05 | F-ROLE-01 | Settings restricted to owner and admin | `/admin/settings` | P0 | UI e2e | 2 |
| REQ-ROLE-06 | F-ROLE-01 | Owner rules | `/admin/settings` (team table, invitations, manual creation); table `memberships` | P0 | UI e2e; DB-RLS | 4 |
| REQ-SONB-01 | F-SONB-01 | Onboarding shell and step indicator | `/onboarding/seeker` | P0 | UI e2e | 4 |
| REQ-SONB-02 | F-SONB-01 | Email must be confirmed before any CV is read | `/onboarding/seeker`; Edge `talent-upload` | P0 | UI e2e; API | 2 |
| REQ-SONB-03 | F-SONB-02 | Upload screen and client checks | `/onboarding/seeker` (step `cv`) | P0 | UI e2e | 5 |
| REQ-SONB-04 | F-SONB-02 | Upload server results | Edge `talent-upload` | P0 | API; UI e2e | 4 |
| REQ-SONB-05 | F-SONB-02 | Upload limit: 3 per account per rolling 24 hours | Edge `talent-upload`; RPC `talent_record_upload_attempt` (service role) | P0 | API; UI e2e | 2 |
| REQ-SONB-06 | F-SONB-02 | Same-file re-upload and version creation | Edge `talent-upload` | P0 | API; UI e2e | 5 |
| REQ-SONB-07 | F-SONB-03 | Contact form and its validation | `/onboarding/seeker` (step `contact`); RPC `talent_save_my_contact` | P0 | UI e2e; DB-RLS | 5 |
| REQ-SONB-08 | F-SONB-03 | Live analysis chip on the contact step | `/onboarding/seeker` (step `contact`) | P1 | UI e2e | 3 |
| REQ-SONB-09 | F-SONB-04 | Review step analysis states | `/onboarding/seeker` (step `review`) | P0 | UI e2e | 4 |
| REQ-SONB-10 | F-SONB-04 | Review form: facts are editable, skills can only be hidden | `/onboarding/seeker` (step `review`); RPC `talent_save_my_review` | P0 | UI e2e; DB-RLS | 6 |
| REQ-SONB-11 | F-SONB-05 | Two separate, optional consents | `/onboarding/seeker` (step `consents`); RPC `talent_set_my_consents` | P0 | UI e2e; DB-RLS | 4 |
| REQ-LINK-01 | F-LINK-01 | When linking is offered | `/onboarding/seeker` | P2 | UI e2e; DB-RLS | 3 |
| REQ-LINK-02 | F-LINK-01 | Requesting the link email | Edge `seeker-account` action `request_link`; email `talent_link` | P2 | UI e2e; API | 3 |
| REQ-LINK-03 | F-LINK-01 | Confirming the link | `/onboarding/seeker/link/[token]`; RPC `talent_link_legacy_profile` | P2 | UI e2e; DB-RLS | 4 |
| REQ-LINK-04 | F-LINK-01 | Effects of linking | `/t/[token]`, `/talent/review/[token]`, `/talent/manage/[token]` | P2 | UI e2e; DB-RLS | 2 |
| REQ-SEEK-01 | F-SEEK-01 | Portal navigation | `/me/*` | P1 | UI e2e; visual | 4 |
| REQ-SEEK-02 | F-SEEK-01 | Home page content and states | `/me` | P1 | UI e2e | 4 |
| REQ-SEEK-03 | F-SEEK-02 | Job list, filters and paging | `/me/jobs` | P1 | UI e2e | 5 |
| REQ-SAPPLY-01 | F-SAPPLY-01 | Access to the apply-with-profile page | `/me/apply/[jobId]` | P0 | UI e2e | 3 |
| REQ-SAPPLY-02 | F-SAPPLY-01 | Page states (first matching wins) | `/me/apply/[jobId]` | P0 | UI e2e | 4 |
| REQ-SAPPLY-03 | F-SAPPLY-01 | Apply form, per-application consent and shared-data panel | `/me/apply/[jobId]` | P0 | UI e2e | 4 |
| REQ-SAPPLY-04 | F-SAPPLY-01 | Profile-mode submission rules and messages | Edge `submit-application` (`mode=profile`) | P0 | API; UI e2e | 7 |
| REQ-SAPPLY-05 | F-SAPPLY-01 | Success and the company's own CV copy | `/me/apply/[jobId]`; bucket `cvs`; `/admin/applications/[id]` | P0 | UI e2e; DB-RLS | 5 |
| REQ-SAPPS-01 | F-SAPPS-01 | Source, content and privacy | `/me/applications?page=N`; RPC `my_applications` | P1 | UI e2e; DB-RLS | 3 |
| REQ-SAPPS-02 | F-SAPPS-01 | Paging, empty and error states | `/me/applications?page=N` | P1 | UI e2e | 3 |
| REQ-SPROF-01 | F-SPROF-01 | Analysis banners | `/me/profile` | P1 | UI e2e | 2 |
| REQ-SPROF-02 | F-SPROF-01 | Contact form on the profile page | `/me/profile` | P1 | UI e2e | 2 |
| REQ-SPROF-03 | F-SPROF-01 | Facts form and hide-only skills | `/me/profile` | P1 | UI e2e | 2 |
| REQ-SPROF-04 | F-SPROF-01 | Extracted profile (read-only) and CV versions | `/me/profile` | P1 | UI e2e | 2 |
| REQ-SPROF-05 | F-SPROF-01 | Uploading a new CV version from the profile | `/me/profile`; Edge `talent-upload` | P1 | UI e2e | 3 |
| REQ-SPROF-06 | F-SPROF-01 | Public page panel on the profile | `/me/profile` | P2 | UI e2e | 1 |
| REQ-SSET-01 | F-SSET-01 | Account card and consents | `/me/settings` | P1 | UI e2e | 4 |
| REQ-SSET-02 | F-SSET-01 | Public link panel | `/me/settings` | P2 | UI e2e | 1 |
| REQ-SSET-03 | F-SSET-01 | Delete seeker data | `/me/settings`; Edge `seeker-account` action `delete`; RPC `talent_delete_seeker_data` (service role) | P1 | UI e2e; API; DB-RLS | 5 |
| REQ-TALENT-01 | F-TALENT-01 | Visibility and privacy boundary | `/t/[token]`; RPC `talent_public_profile` (anon) | P1 | UI e2e; DB-RLS | 3 |
| REQ-TALENT-02 | F-TALENT-02 | Legacy verify, review and manage pages | `/talent/verify/[token]`, `/talent/review/[token]`, `/talent/manage/[token]`; Edge `talent-analyze` (`verify_token` mode) | P2 | UI e2e; API | 3 |
| REQ-DASH-01 | F-DASH-01 | Sidebar | `/admin/*` | P1 | UI e2e | 2 |
| REQ-DASH-02 | F-DASH-01 | Dashboard tiles | `/admin` | P1 | UI e2e | 2 |
| REQ-AJOBS-01 | F-AJOBS-01 | Jobs list, filter and paging | `/admin/jobs?status=&page=` | P0 | UI e2e | 5 |
| REQ-AJOBS-02 | F-AJOBS-01 | Row actions and error banners | `/admin/jobs` | P0 | UI e2e | 2 |
| REQ-AJOBS-03 | F-AJOBS-02 | Job form fields and rules | `/admin/jobs/new`, `/admin/jobs/[id]/edit` | P0 | UI e2e | 5 |
| REQ-AJOBS-04 | F-AJOBS-02 | Screening questions builder | `/admin/jobs/new`, `/admin/jobs/[id]/edit` | P1 | UI e2e | 4 |
| REQ-AJOBS-05 | F-AJOBS-03 | Publish and republish require requirements text | `/admin/jobs` | P0 | UI e2e | 4 |
| REQ-AJOBS-06 | F-AJOBS-03 | Close and republish | `/admin/jobs` | P0 | UI e2e | 2 |
| REQ-AJOBS-07 | F-AJOBS-03 | Soft delete | `/admin/jobs` | P0 | UI e2e; DB-RLS | 3 |
| REQ-AJOBS-08 | F-AJOBS-03 | Public pages are revalidated after job changes | `/jobs/{id}`, `/c/{slug}`, `/`, `/jobs`, `/companies`, `/admin/jobs` | P1 | UI e2e | 1 |
| REQ-AJOBS-09 | F-AJOBS-03 | Job writes are limited to write roles of the same org | `/admin/jobs*`; table `jobs` | P0 | UI e2e; DB-RLS | 2 |
| REQ-RANK-01 | F-RANK-01 | Ranking order and paging | `/admin/jobs/[id]/applicants?status=&page=` | P0 | UI e2e | 4 |
| REQ-RANK-02 | F-RANK-01 | Columns, score bands and the advisory label | `/admin/jobs/[id]/applicants` | P0 | UI e2e; visual | 3 |
| REQ-RANK-03 | F-RANK-01 | Analysis column and retry | `/admin/jobs/[id]/applicants` | P0 | UI e2e | 3 |
| REQ-RANK-04 | F-RANK-01 | Status filter and empty states | `/admin/jobs/[id]/applicants?status=` | P1 | UI e2e | 2 |
| REQ-ANL-01 | F-ANL-01 | Who may trigger an analysis | Edge `analyze-application` | P0 | API | 4 |
| REQ-ANL-02 | F-ANL-01 | Atomic claim and attempt counting | Edge `analyze-application`; RPC `claim_application_for_analysis` (service role) | P0 | API; DB-RLS | 2 |
| REQ-ANL-03 | F-ANL-01 | CV handling before the model call | Edge `analyze-application` | P0 | API | 3 |
| REQ-ANL-04 | F-ANL-01 | Model call parameters and structured-output validation (D2, D5, D6) | Edge `analyze-application` | P0 | API | 3 |
| REQ-ANL-05 | F-ANL-01 | The stored score is the sum of the breakdown | Edge `analyze-application`; trigger `ai_evaluations_sync_fit_score` | P0 | API; DB-RLS | 2 |
| REQ-ANL-06 | F-ANL-01 | Upsert keeps HR notes and the first creation time | Edge `analyze-application` | P1 | API; DB-RLS | 2 |
| REQ-ANL-07 | F-ANL-01 | Failure handling and quota refund | Edge `analyze-application` | P0 | API; UI e2e | 3 |
| REQ-ANL-08 | F-ANL-01 | Re-run from the dashboard | `/admin/jobs/[id]/applicants`, `/admin/applications/[id]?tab=evaluation` | P0 | UI e2e | 4 |
| REQ-ANL-09 | F-ANL-01 | Blind screening (when enabled) | Edge `analyze-application`; `/admin/applications/[id]?tab=evaluation` | P1 | API; UI e2e | 2 |
| REQ-EVAL-01 | F-EVAL-01 | Header, tabs and access | `/admin/applications/[id]?tab=…` | P0 | UI e2e | 3 |
| REQ-EVAL-02 | F-EVAL-01 | Profile tab and the signed CV link | `/admin/applications/[id]?tab=profile`; bucket `cvs` | P0 | UI e2e; DB-RLS | 4 |
| REQ-EVAL-03 | F-EVAL-01 | Evaluation tab states | `/admin/applications/[id]?tab=evaluation` | P0 | UI e2e | 2 |
| REQ-EVAL-04 | F-EVAL-01 | Evaluation content | `/admin/applications/[id]?tab=evaluation` | P0 | UI e2e; visual | 4 |
| REQ-EVAL-05 | F-EVAL-01 | Extracted CV profile | `/admin/applications/[id]?tab=evaluation` | P1 | UI e2e | 2 |
| REQ-NOTES-01 | F-NOTES-01 | Suggested interview questions | `/admin/applications/[id]?tab=questions` | P1 | UI e2e | 2 |
| REQ-NOTES-02 | F-NOTES-01 | HR interview notes (separate from the AI original, FR-07) | `/admin/applications/[id]?tab=questions`; column `ai_evaluations.interview_notes` | P1 | UI e2e; DB-RLS | 3 |
| REQ-NOTES-03 | F-NOTES-01 | Manual interview record (schedule and answers) | `/admin/applications/[id]?tab=interview` | P1 | UI e2e | 4 |
| REQ-STATUS-01 | F-STATUS-01 | Status changer UI | `/admin/applications/[id]?tab=profile` | P0 | UI e2e | 3 |
| REQ-STATUS-02 | F-STATUS-01 | Status RPC rules and history | RPC `change_application_status`; table `status_history`; trigger `applications_status_history` | P0 | DB-RLS; API | 5 |
| REQ-STATUS-03 | F-STATUS-01 | Status emails | Edge `send-email` kinds `interview_invited`, `accepted`, `rejected` | P0 | UI e2e (mail capture); API | 5 |
| REQ-CAL-01 | F-CAL-01 | Month grid and lists | `/admin/calendar?m=YYYY-MM` | P2 | UI e2e | 5 |
| REQ-STATS-01 | F-STATS-01 | KPIs, charts and empty state | `/admin/stats`; RPCs `org_stats`, `org_quota` | P1 | UI e2e; DB-RLS | 3 |
| REQ-QUOTA-01 | F-QUOTA-01 | Quota enforcement inside the analysis | Edge `analyze-application`; RPCs `consume_analysis_quota`, `release_analysis_quota` (service role) | P0 | API; DB-RLS | 4 |
| REQ-QUOTA-02 | F-QUOTA-01 | Quota display on the stats page | `/admin/stats` | P0 | UI e2e | 4 |
| REQ-QUOTA-03 | F-QUOTA-01 | Behaviour when the quota is exhausted | `/jobs/[id]/apply`; `/admin/applications/[id]`; Edge `housekeeping` | P0 | UI e2e; API | 2 |
| REQ-SET-01 | F-SET-01 | Branding and careers page settings | `/admin/settings`; bucket `org-assets` | P1 | UI e2e; DB-RLS | 9 |
| REQ-SET-02 | F-SET-01 | Company name and retention period | `/admin/settings` | P1 | UI e2e; DB-RLS | 3 |
| REQ-SET-03 | F-SET-01 | Compliance: blind screening and Nitaqat | `/admin/settings` | P1 | UI e2e; DB-RLS | 2 |
| REQ-SET-04 | F-SET-01 | Saudization indicator on an application | `/admin/applications/[id]?tab=profile` | P2 | UI e2e | 3 |
| REQ-SET-05 | F-SET-01 | Team members and roles | `/admin/settings` | P1 | UI e2e; DB-RLS | 3 |
| REQ-SET-06 | F-SET-01 | Manual account creation | `/admin/settings`; Edge `manage-users` action `create` | P2 | UI e2e; API | 4 |
| REQ-TRANS-01 | F-TRANS-01 | Export and content | `GET /admin/applications/[id]/transparency`; RPC `application_transparency_report` | P1 | UI e2e; API | 3 |
| REQ-TRANS-02 | F-TRANS-01 | Report access errors | `GET /admin/applications/[id]/transparency` | P1 | API | 2 |
| REQ-RET-01 | F-RET-01 | Automatic analysis retries | Edge `housekeeping` (pg_cron 03:00 UTC) | P1 | API; DB-RLS | 3 |
| REQ-RET-02 | F-RET-01 | Retention deletion per organization | Edge `housekeeping` | P1 | API; DB-RLS | 3 |
| REQ-RET-03 | F-RET-01 | Orphan files and throttle log cleanup | Edge `housekeeping` | P2 | API | 2 |
| REQ-BANK-01 | F-BANK-01 | Bank page access, header and alerts | `/admin/jobs/[id]/interview-bank`; entry button «بنك أسئلة المقابلة» on `/admin/jobs/[id]/applicants` | P1 | UI e2e | 4 |
| REQ-BANK-02 | F-BANK-01 | No bank yet, and the "not in plan" state | `/admin/jobs/[id]/interview-bank` | P1 | UI e2e | 2 |
| REQ-BANK-03 | F-BANK-01 | Generating a bank or a new version | `/admin/jobs/[id]/interview-bank`; gateway `bank_create` | P1 | UI e2e; API | 6 |
| REQ-BANK-04 | F-BANK-01 | Generating state and polling | `/admin/jobs/[id]/interview-bank` | P1 | UI e2e | 3 |
| REQ-BANK-05 | F-BANK-01 | Failed bank and retry | `/admin/jobs/[id]/interview-bank`; gateway `bank_retry` | P1 | UI e2e; API | 3 |
| REQ-BANK-06 | F-BANK-01 | Review summary and question list | `/admin/jobs/[id]/interview-bank` (status `awaiting_review`) | P1 | UI e2e | 2 |
| REQ-BANK-07 | F-BANK-01 | Question cards and review actions | `/admin/jobs/[id]/interview-bank`; gateway `bank_edit` | P1 | UI e2e | 5 |
| REQ-BANK-08 | F-BANK-01 | Editing a question | `/admin/jobs/[id]/interview-bank` | P1 | UI e2e | 4 |
| REQ-BANK-09 | F-BANK-01 | Content filters on edits (fairness) | `/admin/jobs/[id]/interview-bank`, `/admin/applications/[id]?tab=interview` (gap-probe edits) | P1 | UI e2e | 3 |
| REQ-BANK-10 | F-BANK-01 | Regenerating a question | `/admin/jobs/[id]/interview-bank`; gateway `bank_edit` (op `regenerate`) | P1 | UI e2e | 3 |
| REQ-BANK-11 | F-BANK-01 | Locking the bank | `/admin/jobs/[id]/interview-bank`; gateway `bank_lock` | P1 | UI e2e; API | 5 |
| REQ-BANK-12 | F-BANK-01 | Locked view, versions and history | `/admin/jobs/[id]/interview-bank` | P1 | UI e2e | 4 |
| REQ-VINT-01 | F-VINT-01 | Panel header, reads and status badge | `/admin/applications/[id]?tab=interview` | P1 | UI e2e | 3 |
| REQ-VINT-02 | F-VINT-01 | Preconditions for starting an interview (checked in order) | `/admin/applications/[id]?tab=interview` | P1 | UI e2e | 5 |
| REQ-VINT-03 | F-VINT-01 | Interview configuration form | `/admin/applications/[id]?tab=interview` | P1 | UI e2e | 4 |
| REQ-VINT-04 | F-VINT-01 | Server-side validation of the configuration | server action `createVirtualInterview` | P1 | UI e2e | 4 |
| REQ-VINT-05 | F-VINT-01 | Creating the interview | gateway `create` | P1 | UI e2e; API | 6 |
| REQ-VINT-06 | F-VINT-01 | Sending and planning states | `/admin/applications/[id]?tab=interview` | P1 | UI e2e | 3 |
| REQ-VINT-07 | F-VINT-01 | Reviewing gap probes and locking the interview | `/admin/applications/[id]?tab=interview`; gateway `interview_bank_get`, `interview_bank_edit`, `interview_bank_lock` | P1 | UI e2e | 3 |
| REQ-VINT-08 | F-VINT-01 | Locked interview; dispatch not available | `/admin/applications/[id]?tab=interview` | P1 | UI e2e | 2 |
| REQ-VINT-09 | F-VINT-01 | Cancelling an interview and earlier outcomes | `/admin/applications/[id]?tab=interview`; gateway `cancel` | P1 | UI e2e | 3 |
| REQ-VINT-10 | F-VINT-01 | Interview panel permissions and isolation | `/admin/applications/[id]?tab=interview`; interview server actions; gateway | P1 | UI e2e; API; DB-RLS | 3 |
| REQ-VINT-11 | F-VINT-01 | Interviews never change status and show no score | `/admin/applications/[id]` | P0 | UI e2e; API | 1 |
| REQ-IGW-01 | F-IGW-01 | Gateway request handling | `POST {SUPABASE_URL}/functions/v1/interview-gateway` | P1 | API | 3 |
| REQ-IGW-02 | F-IGW-01 | Interview quota (D33) | gateway; agent | P1 | API; DB-RLS | 3 |
| REQ-IGW-03 | F-IGW-01 | Agent error passthrough, timeouts and stale rows | gateway | P1 | API | 2 |
| REQ-IGW-04 | F-IGW-01 | Webhook authentication | `POST {SUPABASE_URL}/functions/v1/interview-webhook` (`verify_jwt = false`) | P1 | API | 4 |
| REQ-IGW-05 | F-IGW-01 | Webhook event semantics | `interview-webhook`; RPC `apply_interview_event` (service role) | P1 | API; DB-RLS | 5 |
| REQ-IGW-06 | F-IGW-01 | Personal data sent to the agent is minimised | gateway `create` | P1 | API | 1 |
| REQ-ISO-01 | F-ISO-01 | A member of org A never reaches org B | all `/admin/*` pages and actions; all tenant tables | P0 | DB-RLS; UI e2e | 4 |
| REQ-ISO-02 | F-ISO-01 | `anon` never writes; consistency guards | all tables and buckets | P0 | DB-RLS | 3 |
| REQ-ISO-03 | F-ISO-01 | Storage isolation | buckets `cvs`, `org-assets`, `talent-cvs` | P0 | DB-RLS | 2 |
| REQ-ISO-04 | F-ISO-01 | Seeker and company data never cross | `talent.*` tables; `public.talent_*` and `my_*` functions | P0 | DB-RLS | 4 |
| REQ-ISO-05 | F-ISO-01 | Platform admins and impersonation (database level only) | tables `platform_admins`, `impersonation_sessions` | P1 | DB-RLS | 4 |
| REQ-ISO-06 | F-ISO-01 | The database test suites pass | `cd srp && npm run test:db`; `cd interview-agent && npm test` | P0 | DB-RLS | 2 |
| REQ-NFR-01 | F-NFR-01 | Rate limits | Edge `submit-application`, `talent-upload`, `seeker-account`; agent bank generation | P0 | API | 1 |
| REQ-NFR-02 | F-NFR-01 | Secrets never reach the browser (D3) | all pages | P0 | API; visual | 1 |
| REQ-NFR-03 | F-NFR-01 | Signed CV links, hashed identifiers, no CV content in logs (D8, §8) | application page; Edge Function logs | P0 | API; DB-RLS | 2 |
| REQ-NFR-04 | F-NFR-01 | Retention (D8, D9) | Edge `housekeeping`; `/admin/settings` | P1 | API | 1 |
| REQ-NFR-05 | F-NFR-01 | AI cost guard (§8) | all pages; Edge `analyze-application`, `talent-analyze` | P0 | API | 2 |
| REQ-NFR-06 | F-NFR-01 | Arabic only, RTL, no English UI text (D23, §8, §10.7) | all pages and emails | P0 | UI e2e; visual | 4 |
| REQ-NFR-07 | F-NFR-01 | Accessibility | all pages | P1 | UI e2e; visual | 2 |
| REQ-NFR-08 | F-NFR-01 | Responsive layout at 390 px | all pages | P1 | visual; UI e2e | 2 |
| REQ-NFR-09 | F-NFR-01 | Performance and freshness | public pages; dashboard lists | P1 | API; UI e2e | 2 |
| REQ-NFR-10 | F-NFR-01 | Resilience (D4) | apply flows; status changes; invitations | P0 | UI e2e; API | 1 |

---

## 13. Open questions, suspected defects and security observations

### 13.1 Open questions (OQ)

No test should assert either answer to an open question until the supervising engineer resolves it. Where an AC records current behaviour, it says so.

| ID | Question | Where it matters |
|---|---|---|
| OQ-01 | The ranked list shows a bare score badge (with the advisory tooltip and a link to the detail page) but no justification. Does that satisfy "every score is displayed with its justification" (CLAUDE.md §1, D24)? | REQ-ETH-03, REQ-RANK-02 |
| OQ-02 | Platform admins can read every tenant's rows directly (`*_platform_select` policies; `tenant_isolation.sql` asserts it), while CLAUDE.md §4.1 says membership in `platform_admins` alone grants only platform tables. Which is intended? | REQ-ISO-05 |
| OQ-03 | At database level `anon` sees live orgs and their published jobs whatever `listed_publicly` says; the marketplace filter lives in application code. CLAUDE.md §4.1 says jobs are visible "and the org is listed". Confirm that unlisted orgs being reachable by direct link is intended. | REQ-JOBS-05, REQ-CAREERS-01 |
| OQ-04 | Applicant status emails are sent by the Next.js action after the RPC, not enqueued by the RPC (CLAUDE.md §4.1). A direct RPC call sends nothing. Intended? | REQ-STATUS-03 |
| OQ-05 | The closing date is compared with the Next server's local date on pages and with the UTC date in `submit-application`. Which time zone is the reference (e.g. Saudi time)? Around midnight on the closing day they disagree. | REQ-JOBS-07, REQ-APPLY-06 |
| OQ-06 | After a server-side refusal of the guest form, do typed values and the chosen file persist? Not asserted in code. | AC-APPLY-02.7 |
| OQ-07 | Guest submissions are relayed by the Next.js server action, which forwards no client IP header, so the function may see the web tier's IP and apply the 5-per-hour limit to all guests together. Verify in staging. | REQ-APPLY-07 |
| OQ-08 | Owners have no DELETE on `organizations` (and no UI), while CLAUDE.md §4.1 lists "+ delete own". Intended? | §7.2 |
| OQ-09 | A malformed percent-encoding in `/track/{ref}` goes through `decodeURIComponent`; is the expected outcome the not-found state or the error page? | AC-TRACK-03.2 |
| OQ-10 | A signed-out visit to an `/admin` deep link redirects to `/login` without `next`, so the target is lost after sign-in. Should it be kept? | AC-AUTH-07.4 |
| OQ-11 | The onboarding slug field strips a trailing hyphen on every keystroke, so typing `my-company` letter by letter yields `mycompany`. Intended? | AC-ONB-03.2 |
| OQ-12 | A user whose only membership is in a soft-deleted org is sent to `/onboarding`; `create_organization` then says "already a member" and redirects to `/admin`, which sends them back — a possible loop. Verify and decide. | AC-ROLE-01.3 |
| OQ-13 | Profile-mode `submit-application` does not check `listed_publicly`, while `/me/apply/{id}` returns 404 for unlisted companies. Should the function refuse too? | AC-SAPPLY-04.6 |
| OQ-14 | `/admin/jobs?page=999` queries beyond the last row; the result is either an empty list or a PostgREST range error, and the counter may be lost. Expected display? | REQ-AJOBS-01 |
| OQ-15 | A published job can be edited to empty requirements and stays published (FR-01 is enforced only at publish time). Intended? | AC-AJOBS-05.3 |
| OQ-16 | A re-run keeps the evaluation's first `created_at`, so the evaluation footer and the report's «تاريخ التقييم» show the first analysis date, not the latest. Intended? | REQ-ANL-06 |
| OQ-17 | After a forced re-run fails, the detail page hides the old evaluation while the ranked list keeps the old `fit_score` and the transparency report still prints the old evaluation. Which view is correct? | AC-EVAL-03.2 |
| OQ-18 | The interview time is converted to UTC in the browser but formatted and bucketed on the server in the server's time zone; on a UTC server a Riyadh user may see a 3-hour shift. Expected display time zone? | REQ-NOTES-03, REQ-CAL-01 |
| OQ-19 | The status-change hint names only «دعوة لمقابلة» and «تم الاعتذار», but «تم القبول» also sends an email. Change the hint, or the behaviour? | REQ-STATUS-01, REQ-STATUS-03 |
| OQ-20 | The website message says «أدخل رابطاً صحيحاً يبدأ بـ https», but `http://` and other schemes are accepted. Which is intended? | AC-SET-01.9 |
| OQ-21 | The blind-screening warning says «يستهلك تحليلين بدل واحد لكل سيرة — أي ضعف الحصة الشهرية.», but the code consumes one quota unit (two model calls). Which is intended? | REQ-SET-03, REQ-ANL-09 |
| OQ-22 | Transparency report dates use `toLocaleString("ar-SA")`, which may print Hijri dates, while the UI uses Gregorian. Intended? | REQ-TRANS-01 |
| OQ-23 | The pricing page advertises seats, active-job limits, a 14-day trial and 150/750 analyses that nothing enforces (only the default 25 exists). This PRD treats pricing as marketing text only. Confirm. | REQ-MKT-06 |
| OQ-24 | The apply-with-profile panel shows the email copied into the profile at creation, while the function sends the current auth email. They could differ if the auth email ever changes (no change UI exists). | REQ-SAPPLY-03 |
| OQ-25 | Can the panel create an interview for an application whose job was soft-deleted? `can_manage_application` and the gateway's bank lookup do not check job deletion. Not verified. | REQ-VINT-05 |
| OQ-26 | An anonymous visitor who clicks «تقدّم بملفك», signs up and finishes onboarding lands on `/me`, not back on the job. Intended? | REQ-JOBS-08, REQ-SONB-11 |
| OQ-27 | The landing step «قدّم بضغطة» carries «قريباً», but applying with a stored CV exists (P1). Update the copy? | REQ-MKT-04 |
| OQ-28 | Signing up with an existing email shows an error only if Supabase's message contains "already"; with confirmations on, Supabase may return success and the form shows «تحقّق من بريدك». Desired behaviour? | AC-AUTH-02.4 |
| OQ-29 | The production Supabase Auth settings (confirmations, OTP expiry, Google provider, Arabic templates) are not in the repository. Confirm them for the test environment. | §3.1, F-AUTH-01 |
| OQ-30 | `manage-users` creates accounts already confirmed ("documented, not fixed" in `docs/V3-PROGRESS.md`). Accepted? | REQ-SET-06 |
| OQ-31 | Deleting seeker data does not delete an unlinked legacy profile with the same email ("documented, not fixed"). Accepted? | REQ-SSET-03 |
| OQ-32 | The expired legacy verify link says «انتهت صلاحية الرابط. ارفع سيرتك من جديد.», but accountless upload no longer exists. Update the copy? | REQ-TALENT-02 |
| OQ-33 | A signed-in user following the `/talent` CTA to `/signup?as=seeker` is sent to `/onboarding` with the query dropped and sees the company tab of the chooser. Intended? | AC-AUTH-04.2 |
| OQ-34 | Invitations past `expires_at` but never opened stay listed under «دعوات معلّقة» (status still `pending`). Should the list hide them? | AC-INV-02.2 |
| OQ-35 | Browser-native validation bubbles (minLength, min/max) are not Arabic dictionary strings. This PRD says do not assert their text. Confirm. | REQ-BANK-08, REQ-VINT-03 |

### 13.2 Suspected defects (KD)

Each was found by reading the code (KD-01 and KD-02 were also confirmed on a scratch Postgres built from the harness, all migrations and the seed). The linked AC states the behaviour the UI or specification promises; expect it to fail until fixed.

| ID | Defect | Expected | Observed in code | Linked |
|---|---|---|---|---|
| KD-01 | Compliance settings cannot be saved | Saving «الفرز المُعمّى · السعودة (نطاقات)» shows «تم حفظ الإعدادات» | `authenticated` has no UPDATE privilege on `blind_screening`, `nitaqat_band`, `saudization_target` (added in `0016` after `0006` switched to column grants) → «تعذّر الحفظ، حاول مرة أخرى»; blind screening can never be switched on from the UI | AC-SET-03.1 |
| KD-02 | Saudization indicator never persists | «نعم» / «لا» stays selected after reload | No UPDATE privilege on `applications.counts_toward_saudization` → the button flips back with no message | AC-SET-04.2 |
| KD-03 | Turnstile secret without site key blocks applying | Applying keeps working | No widget, no token, `turnstileOk(null)` false → every guest submission refused with «تعذّر التحقق من أنك لست روبوتاً، يرجى المحاولة مرة أخرى» | AC-APPLY-08.4 |
| KD-04 | Subdomain careers page breaks deeper links | `{slug}.{root}/jobs/{id}` shows the job | Rewritten to `/c/{slug}/jobs/{id}`, which has no route → 404 | AC-CAREERS-03.3 |
| KD-05 | No contact channel | «تواصل معنا» reaches a contact section | Pricing links to `/#contact` with no such anchor; fairness closing line has no link or method | AC-MKT-06.3, REQ-MKT-07 |
| KD-06 | Calendar crashes on an impossible month | `?m=2026-13` falls back to the current month | Passes the regex; date-fns throws "Invalid time value" → global error page | AC-CAL-01.5 |
| KD-07 | Re-run failure silent on the detail page | A failure message appears | Redirect to `?error=retryFailed`, which only the applicants page reads | AC-ANL-08.3 |
| KD-08 | Quota read failure looks like "unlimited" | An error state | Default `{quota:null}` renders «بلا حدّ» | AC-QUOTA-02.4 |
| KD-09 | Admin demoting an owner looks successful | A refusal message | RLS matches 0 rows, no error; the action returns success and the check icon shows | AC-ROLE-06.2 |
| KD-10 | Manually adding an existing account without a `profiles` row locks it out | The member reaches `/admin` and appears in the team table | Membership added without a profile → `getSession` null → `/onboarding`; not listed in the team table (the invite path does create a profile) | AC-SET-06.4 |
| KD-11 | Transparency report trail mislabelled | Trail columns describe the change date and the transition | Date column labelled «تاريخ التقييم», transition column «الحالة الحالية»; the report also omits the blind flag, confidence and interview questions that the RPC returns | AC-TRANS-01.3 |
| KD-12 | SVG logo gives the wrong message | «صيغة الصورة غير مدعومة» | The server accepts `image/svg+xml`; the bucket refuses it since `0012` → «تعذّر رفع الصورة، حاول مرة أخرى» | AC-SET-01.5 |
| KD-13 | Revoking an invitation can fail silently | «تعذّر إلغاء الدعوة» on failure | «إلغاء» has no confirmation and ignores errors | REQ-INV-02 |
| KD-14 | Legacy page deletion leaves the CV file | The CV file is removed with the profile | `deleteProfile` (`srp/app/(talent)/talent/actions.ts`) ignores the returned `cv_path`; the file stays in `talent-cvs` | REQ-TALENT-02 |
| KD-15 | Stale tab re-sends a status email | No email when the status does not change | The RPC no-ops, but the action still sends the interview/accepted/rejected email | AC-STATUS-03.5 |

### 13.3 Security observations (SEC) — each needs a test

| ID | Observation | Suggested test |
|---|---|---|
| SEC-01 | An admin can UPDATE an invitation's `role`, `email` and `token_hash`: the update policy has no owner ceiling and the table-level UPDATE grant is intact. An admin could set role `owner` with a token they know and accept it with a second account. | [DB] As admin, update a pending invitation to role `owner` and a known token hash, then accept with another account; the escalation must be refused |
| SEC-02 | hr can INSERT arbitrary `status_history` rows for its own org, with a client-chosen `changed_by` and `note`, without changing the status. The transparency report would list them as human decisions. | [DB] As hr, insert a history row naming the owner as `changed_by`; check whether it is refused and whether it appears in the report |
| SEC-03 | `send-email` applicant kinds accept any JWT (the public anon key) plus an application UUID, with no dedupe and no rate limit. | [API] Call `send-email {kind:"rejected", application_id}` with the anon key; it should be refused |
| SEC-04 | `housekeeping` performs no authorization inside the function; any caller passing the gateway (anon key) can trigger retries and retention. | [API] POST `housekeeping` with the anon key; it should be refused |
| SEC-05 | `analyze-application` analyses any `pending` row for any caller (anon key), consuming the org's quota. | [API] POST a pending id with the anon key; decide whether this must be refused |
| SEC-06 | During impersonation `is_org_member()` returns true for any role filter, so the platform admin passes owner-level checks (job insert, memberships, org update, status change, `can_manage_job`, `org-assets` writes). D22 describes support access. | [DB] With a live session, attempt each write; decide which must be refused |
| SEC-07 | `track_application` has no throttle; reference codes are 8 characters from a 31-character alphabet. | [API] Burst 1,000 lookups; observe whether any limit applies |
| SEC-08 | For unlinked legacy profiles the public token in `/t/{token}` is also the management credential: with the anon key, `talent_delete_profile`, `talent_set_visibility` and `talent_publish_profile` work for anyone holding the URL. Account profiles are protected by the `user_id is null` guard. | [API] Call `talent_set_visibility` with a legacy public token and the anon key |
| SEC-09 | The platform webhook keeps no nonce store; a replay within ±300 s is absorbed only by `event_id` dedupe. | [API] Replay a signed event within 300 s; expect `duplicate` and no change |

---

## 14. Glossary — Arabic UI term ↔ English meaning

| Arabic (as in the UI) | English meaning |
|---|---|
| حكيم | The product name (Hakeem, "the wise one"); `PRODUCT_NAME` |
| استشاري | Advisory (label next to every AI score) |
| درجة الملاءمة | Fit score (0–100) |
| تفصيل الدرجة | Score breakdown |
| المهارات المطلوبة / صلة الخبرة / سنوات الخبرة / الملاءمة التعليمية / إشارات إضافية | Required skills (40) / experience relevance (30) / experience years (15) / education fit (10) / bonus signals (5) |
| نقاط القوة | Strengths |
| الفجوات | Gaps |
| نقاط تحتاج استيضاحاً | Red flags (points that need clarification) |
| موثوقية منخفضة | Low confidence |
| التقييم الذكي | AI evaluation (tab) |
| الملف المستخرج من السيرة | Extracted CV profile |
| قُيّم مُعمّى / الفرز المُعمّى | Evaluated blind / blind screening |
| إعادة التحليل | Re-run analysis |
| التحليل قيد الانتظار… / جارٍ التحليل… / فشل التحليل | Analysis pending / processing / failed |
| رمز المتابعة | Tracking (reference) code, `HKM-XXXXXXXX` |
| تتبّع حالة الطلب | Track application status |
| تم استلام الطلب | Status `new` (received) |
| قيد المراجعة | Status `under_review` |
| دعوة لمقابلة | Status `interview` (invited to interview) |
| تم القبول | Status `accepted` |
| تم الاعتذار | Status `rejected` (politely declined) |
| سجل الحالة | Status history |
| مسودة / منشورة / مغلقة | Job status draft / published / closed |
| المتقدمون | Applicants |
| قدّم الآن | Apply now (guest) |
| تقدّم بملفك | Apply with your stored profile (seeker) |
| قدّم عبر حسابه | "Applied via account" badge (company side) |
| انتهى موعد التقديم لهذه الوظيفة | Applications closed for this job |
| المالك / مدير / موارد بشرية / مطّلع | Roles owner / admin / hr / viewer |
| مؤسساتك | Your organizations (switcher) |
| مساحة الشركة / مساحة العمل | Company workspace |
| حسابي كباحث | My seeker account (link from `/admin`) |
| بوابة الباحث عن عمل | Seeker portal (`/me`) |
| طلباتي | My applications |
| ملفي | My profile |
| الموافقات | Consents |
| صفحة مهنية عامة برابط فريد | Public talent page with a unique link (`/t/{token}`) |
| مرشحون مقترحون | Suggested candidates (P2, not built) |
| نسخة السيرة / الحالية | CV version / current version |
| بيانات التواصل | Contact details |
| دليل الشركات | Company directory (`/companies`) |
| صفحة التوظيف | Careers page (`/c/{slug}`) |
| الرابط المختصر | Slug |
| دعوة / دعوات معلّقة | Invitation / pending invitations |
| هوية الشركة وصفحة التوظيف | Branding and careers page settings |
| مدة الاحتفاظ بالطلبات | Retention period (months) |
| السعودة / نطاقات | Saudization / Nitaqat (Saudi localisation bands) |
| تقرير شفافية التقييم | Evaluation transparency report |
| سجل القرارات البشرية / قرار بشري / النظام | Human decision trail / human decision / system |
| حصة التحليل الشهرية / بلا حدّ / انتهت حصتك الشهرية | Monthly analysis quota / unlimited / quota exhausted |
| بنك أسئلة المقابلة / البنك الأساسي للوظيفة | Interview question bank / the job's core bank |
| أسئلة الاستيضاح | Gap-probe questions (per applicant) |
| تمهيدي / تقني / سلوكي / موقفي / استيضاح / برمجي | Warm-up / technical / behavioral / situational / gap probe / coding |
| بانتظار المراجعة / معتمد / محذوف | Pending review / approved / removed |
| قيد التوليد / مقفل / تعذّر التوليد / استُبدلت بنسخة أحدث | Generating / locked / generation failed / superseded |
| البصمة / بصمة الأسئلة | Hash (bank hash) / plan hash |
| معدَّل / بديل مولَّد | Edited by staff / generated replacement |
| المقابلة الافتراضية | Virtual interview |
| الأسئلة مقفلة / الأسئلة جاهزة | Questions locked / questions ready |
| إرسال للمتقدم | Send to the candidate (disabled; I2) |
| قريباً | Coming soon |
| صلاحيتك في هذه المؤسسة للاطّلاع فقط / صلاحيتك في هذه المنشأة للاطلاع فقط. | Your role in this organization is read-only (two wordings: jobs area / interview area) |
| الإعدادات | Settings |
| الإحصائيات | Statistics |
| التقويم | Calendar |
| لوحة التحكم | Dashboard |

*End of document.*
