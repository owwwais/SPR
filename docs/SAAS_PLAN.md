# خطة تحويل SRP إلى منتج SaaS متعدد المستأجرين
## دراسة معمارية ومنتجية — مقترح لاعتماد المهندس المشرف (v2.0-draft)

> هذه **وثيقة مقترح**، وليست تنفيذًا. لا يُكتب أي كود قبل اعتمادها.
> عند الاعتماد تُدمج القرارات في `CLAUDE.md` كـ **D11–D24** وتحديث للفصول §3 و§4 و§4.1 و§10.
> جميع المعرّفات والكود بالإنجليزية، وواجهة المستخدم عربية RTL (لا تغيير في §8).

**التاريخ:** 2026-08-06 · **الفرع:** `claude/saas-product-conversion-ga5sxv`

---

## 0. ملخص تنفيذي

المشروع الحالي **مكتمل وظيفيًا كنظام لشركة واحدة** (M0→M7 منجزة + إضافات المهندس: أسئلة الفرز، المقابلات، حسابات الفريق). البنية سليمة وقابلة للتوسّع، لكنها تحمل **13 افتراضًا صريحًا بأن هناك شركة واحدة فقط**، أخطرها ثلاثة تسبب **تسريب بيانات بين المستأجرين فور تسجيل العميل الثاني**:

| # | الثغرة | الأثر |
|---|--------|------|
| 🔴 1 | سياسة التخزين `cvs_staff_select` = `bucket_id='cvs' and is_staff()` | أي موظف في أي شركة يستطيع قراءة **كل** السير الذاتية لكل الشركات |
| 🔴 2 | `is_staff()` = "لديه صف في profiles" بلا ربط بشركة | كل سياسات RLS على `jobs`/`applications`/`ai_evaluations` تفتح كل البيانات لكل الموظفين |
| 🔴 3 | `settings` بقيد `check (id = 1)` | صف إعدادات واحد للنظام كله — يستحيل وجود شركتين |

الخبر الجيد: **البنية القائمة تستوعب التعدد بتعديل جراحي وليس بإعادة كتابة.** التقدير: **7 مراحل (S1–S9)، ~9–12 أسبوع عمل**، منها المرحلة الأولى (S1: العزل والأمان) هي الوحيدة التي لا يجوز تأجيل أي جزء منها.

**الميزة التنافسية الحقيقية موجودة أصلًا في الكود ولم تُسوَّق بعد:**
البرومبت في `prompts.ts` يفرض قواعد إنصاف صريحة (تجاهل الاسم/الجنس/العمر/الجنسية/سمعة الجامعة، والفجوات الوظيفية كسؤال محايد لا كمانع)، والنظام لا يعرض درجة بلا تبرير، والقرار بشري إلزاميًا. هذا **بالضبط** ما يطلبه قانون الاتحاد الأوروبي للذكاء الاصطناعي من أنظمة التوظيف (مصنّفة "عالية الخطورة")، وهو **بالضبط** ما يشكو منه سوق ATS اليوم. المنافسون يبيعون درجة غامضة؛ نحن نبيع **درجة مع دليل**.

---

# الجزء الأول — أين وصل المشروع

## 1.1 ما تم بناؤه فعليًا

**الحجم:** ~9,500 سطر كود فعلي (باستثناء `package-lock.json`)، 5 هجرات SQL، 4 دوال Edge.

### الواجهة العامة (Public)
| المسار | الحالة |
|--------|--------|
| `/` | صفحة هبوط + 3 وظائف مميزة، ISR 60s |
| `/jobs` | قائمة الوظائف + بحث وفلاتر (قسم/موقع/نوع) عبر `JobsExplorer` |
| `/jobs/[id]` | تفاصيل الوظيفة (Markdown) |
| `/jobs/[id]/apply` | نموذج التقديم + رفع CV + أسئلة فرز ديناميكية |
| `/track` و `/track/[ref]` | تتبّع الطلب برمز مرجعي عبر RPC آمنة |
| `/login` | دخول الموظفين |

### لوحة الموظفين (`/admin`)
| المسار | الحالة |
|--------|--------|
| `/admin` | لوحة مؤشرات (طلبات، وظائف منشورة، بانتظار التحليل) |
| `/admin/jobs` + `new` + `[id]/edit` | CRUD كامل مع مسودة/منشور/مغلق + بنّاء أسئلة الفرز |
| `/admin/jobs/[id]/applicants` | ترتيب حسب `fit_score desc nulls last` + فلتر حالة + ترقيم 20/صفحة + زر إعادة تحليل |
| `/admin/applications/[id]` | تبويبات: السيرة، التقييم، الأسئلة، المقابلة، الحالة |
| `/admin/calendar` | شبكة تقويم لمواعيد المقابلات |
| `/admin/stats` | Recharts: طلبات/وظيفة، متوسط الدرجة، قمع الحالات، الزمن |
| `/admin/settings` | اسم الشركة + مدة الاحتفاظ + إدارة الفريق (admin فقط) |

### قاعدة البيانات
- **7 جداول:** `profiles`, `settings`, `jobs`, `applications`, `ai_evaluations`, `status_history` + امتدادات jsonb (`screening_questions`, `screening_answers`, `interview_qa`, `interview_at`, `interview_notes`)
- **5 أنواع enum:** `job_status`, `job_type`, `app_status`, `analysis_status`, `user_role`
- **RLS مفعّلة على كل جدول** مع صلاحيات عمودية دقيقة (`grant update (interview_notes)`, `grant update (interview_at, interview_qa)`) — عمل نظيف ومتقدّم
- **RPCs:** `current_user_role()`, `is_staff()`, `change_application_status()`, `track_application()`
- **Trigger:** `applications_status_history` يسجّل كل تغيير حالة (دفاع في العمق)
- **Storage:** حاوية خاصة `cvs` بحد 5MB و mime whitelist

### دوال Edge
| الدالة | الوظيفة |
|--------|---------|
| `analyze-application` | نداء Gemini واحد (PDF inlineData أو DOCX عبر mammoth)، `responseSchema` + تحقق zod، إعادة حساب `fit_score` من مجموع البنود، upsert، `thinkingLevel: LOW` لتقليل الزمن |
| `send-email` | Resend مع قوالب عربية (استلام/دعوة مقابلة/قبول/رفض) — المستلم يُستخرج من DB وليس من المُنادي (تصميم أمني جيد) |
| `manage-users` | إنشاء حسابات فريق بصلاحية service role مع تحقق من دور المُنادي |
| `housekeeping` | cron يومي: إعادة محاولة الفاشل (<3) + حذف بيانات الاحتفاظ |

## 1.2 تقييم الجودة

**نقاط قوة حقيقية يجب الحفاظ عليها:**
- فصل الأسرار محكم: مفتاح Gemini وservice role **لا يوجدان في Next.js إطلاقًا** — فقط داخل Edge Functions (D3 محترم بدقة)
- `lib/auth.ts` بنمط Data Access Layer مع `cache()` — بوابة تفويض واحدة صحيحة
- `lib/validations/evaluation.ts` مشترك بين Next.js و Edge Function — مصدر حقيقة واحد لمخطط الذكاء الاصطناعي
- التعامل مع فشل الذكاء الاصطناعي: التقديم لا يفشل أبدًا بسبب AI (D4 محترم)
- عدم تسجيل محتوى السير الذاتية في اللوقات (D8 محترم) — فقط المدة والموديل
- قاموس `ar.ts` واحد (456 سطرًا) بلا إطار i18n — يسهّل إضافة اللغات لاحقًا
- ملف اختبار `supabase/tests/rls_check.sql` (284 سطرًا)

**ديون تقنية مرصودة:**
| # | الدين | الخطورة |
|---|-------|---------|
| T1 | `0004_housekeeping_cron.sql` يضع **رابط المشروع و anon key حرفيًا داخل الهجرة** | متوسطة — يجب نقلها إلى Supabase Vault |
| T2 | `applications` لا تخزّن **سبب** فشل التحليل (D5 يطلب "store raw error") — يُسجَّل في اللوق فقط | متوسطة |
| T3 | لا توجد اختبارات آلية (وحدة/تكامل/e2e) — فقط سكربت RLS يدوي | عالية عند التحوّل لـ SaaS |
| T4 | `revalidate = 60` ثابت — بلا `revalidateTag` لكل شركة | متوسطة (ستتفاقم مع التعدد) |
| T5 | رفع السيرة الذاتية يتم من المتصفح مباشرة بدور `anon` | عالية في SaaS (انظر §3.4) |
| T6 | لا حماية من الإغراق (rate limit / captcha) على نموذج التقديم | عالية في سوق وظائف عام |

## 1.3 الافتراضات أحادية المستأجر — الجرد الكامل

| # | الموضع | الافتراض | التصحيح المطلوب |
|---|--------|----------|-----------------|
| A1 | `settings` | `check (id = 1)` — صف واحد | جدول `org_settings` بمفتاح `org_id`، أو نقل الحقول إلى `organizations` |
| A2 | `is_staff()` | أي صف في `profiles` = موظف الشركة الوحيدة | استبداله بـ `is_org_member(org_id, roles[])` |
| A3 | RLS على `jobs` | `using (is_staff())` بلا نطاق | `org_id = any(current_org_ids())` |
| A4 | RLS على `applications` | نفس المشكلة | نفس الحل |
| A5 | RLS على `ai_evaluations` | نفس المشكلة | ربط عبر `applications.org_id` أو عمود مباشر |
| A6 | RLS على `status_history` | نفس المشكلة | نفس الحل |
| A7 | Storage `cvs` | `bucket_id='cvs' and is_staff()` | مسار `cvs/{org_id}/{application_id}.{ext}` + فحص المجلد |
| A8 | `user_role` enum | `admin\|hr` فقط | `owner\|admin\|hr\|viewer` + جدول منفصل لمدير المنصّة |
| A9 | `profiles` | يخلط الهوية بالدور بالشركة | `profiles` = هوية فقط، `memberships` = (org, user, role) |
| A10 | الصفحات العامة | `select … where status='published'` بلا شركة | فلترة حسب `orgs.listed_publicly` + تجميع حسب الشركة |
| A11 | `manage-users` | إنشاء حساب بكلمة مرور يحددها المدير | دعوات بالبريد + تسجيل ذاتي |
| A12 | `analyze-application` | لا حصص ولا عدّادات | فحص الحصة **قبل** نداء Gemini + قيد استخدام |
| A13 | `proxy.ts` | لا يعرف مفهوم النطاق الفرعي | تحويل `{slug}.domain` → `/c/{slug}` |

---

# الجزء الثاني — معمارية SaaS المقترحة

## 2.1 القرارات المعمارية الجديدة (مقترح D11–D24)

| # | القرار | المبرر |
|---|--------|--------|
| **D11** | **نموذج التعدد: قاعدة واحدة + مخطط واحد + `org_id` على كل صف + RLS.** لا مخطط لكل مستأجر ولا قاعدة لكل مستأجر. | Supabase/PostgREST مبني حول RLS؛ مخطط-لكل-مستأجر يفجّر الهجرات ولا يتوسع بعد ~50 عميل |
| **D12** | **مصدر الحقيقة للعضوية هو جدول `memberships` وليس ادعاءات JWT.** | ادعاءات `user_metadata` قابلة للتعديل من المستخدم؛ الجدول + `security definer` آمن ومفهرس |
| **D13** | **مدير المنصّة في جدول منفصل `platform_admins`، وليس قيمة في `user_role`.** | حتى لو أخطأنا في سياسة على `profiles`/`memberships`، لا يستطيع مستأجر ترقية نفسه لمدير منصّة |
| **D14** | **المستخدم قد ينتمي لأكثر من شركة** (مكاتب التوظيف + الانتحال المُدقّق). | يفتح شريحة الوكالات ويجعل الانتحال (impersonation) نظيفًا |
| **D15** | **رفع السيرة الذاتية والتقديم ينتقلان إلى Edge Function `submit-application`.** يُلغى إدخال `anon` المباشر في `applications` و`storage.objects`. | يمنع إغراق التخزين ورفع ملفات في مجلد شركة أخرى؛ يمكّن rate limit + Turnstile |
| **D16** | **الحصص تُفحص داخل `analyze-application` قبل نداء Gemini.** | حارس التكلفة الحقيقي؛ الفحص في الواجهة قابل للتجاوز |
| **D17** | **التوجيه العام يبدأ بالمسار `/c/{slug}` والنطاق الفرعي يُعاد كتابته إليه في `proxy.ts`.** النطاق المخصص ميزة خطة مدفوعة. | يعمل فورًا بلا DNS، والترقية لاحقًا بلا تغيير صفحات |
| **D18** | **`/admin` تبقى مساحة عمل المستأجر، و`/platform` هي وحدة تحكم المنصّة.** | يوفّر إعادة تسمية 18 ملفًا، والفصل واضح في المسار |
| **D19** | **التسعير مختلط: مقاعد + حصة تحليلات شهرية.** التحليل هو وحدة القيمة والتكلفة معًا. | يربط الإيراد بالتكلفة المتغيرة (Gemini) ويمنع الاستنزاف |
| **D20** | **بوابة الدفع: Moyasar أساسًا (مرخّصة من ساما، مدى، 2.5% ثابت) خلف واجهة `lib/billing/provider.ts` مجرّدة.** Tap/Stripe كبدائل. | تجنّب الارتباط بمزوّد، والسوق المستهدف سعودي/خليجي أولًا |
| **D21** | **سوق الوظائف العام (`/jobs` + `/companies`) جزء من المنتج وليس إضافة.** | حلقة قيمة ثنائية: المستأجر يحصل على زيارات مجانية ⇒ سبب مباشر لاختيارنا على Workable |
| **D22** | **الانتحال (impersonation) عبر جلسة موقّتة مُدقّقة (60 دقيقة) مع بانر أحمر دائم، ومسجّل في `audit_log`.** | ضرورة دعم فني، لكنها أخطر صلاحية في النظام |
| **D23** | **العربية فقط في v1** (لا إطار i18n — D10 يبقى). قاموس `en.ts` مؤجّل لطلب عميل. | التركيز والتميّز؛ لا منافس عالمي يتقن العربية |
| **D24** | **قاعدة "لا درجة بلا تبرير" و"القرار بشري" تُرقّى من قاعدة داخلية إلى وعد تسويقي معلن + تقرير شفافية قابل للتصدير.** | تحوّل الالتزام الأخلاقي إلى ميزة بيع وامتثال |

## 2.2 مخطط قاعدة البيانات الجديد

### هجرة `0006_multitenancy.sql` — الجداول الجديدة

```sql
-- ============ مستوى المنصّة ============
create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

create type org_status   as enum ('trial','active','past_due','suspended','cancelled');
create type member_role  as enum ('owner','admin','hr','viewer');
create type invite_status as enum ('pending','accepted','revoked','expired');

create table organizations (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                     check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name             text not null,
  legal_name       text,
  logo_path        text,           -- حاوية 'org-assets' العامة
  cover_path       text,
  about            text,           -- markdown، يظهر في صفحة الشركة
  website          text,
  industry         text,
  city             text,
  brand_color      text,           -- hex، يلوّن صفحة التوظيف فقط
  status           org_status not null default 'trial',
  listed_publicly  boolean not null default true,  -- الظهور في السوق العام
  custom_domain    text unique,    -- خطة مدفوعة
  retention_months int not null default 12 check (retention_months between 1 and 60),
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on organizations(status) where deleted_at is null;
create index on organizations(listed_publicly) where deleted_at is null;

create table memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role not null default 'hr',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on memberships(user_id);   -- حرج: كل سياسة RLS تمرّ من هنا

create table invitations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null,
  role       member_role not null default 'hr',
  token_hash text not null,          -- sha256، الرمز الخام لا يُخزَّن أبدًا
  status     invite_status not null default 'pending',
  invited_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create unique index on invitations(org_id, lower(email)) where status = 'pending';
```

### الفوترة والاستخدام

```sql
create table plans (
  code                  text primary key,     -- 'trial','starter','growth','enterprise'
  name_ar               text not null,
  price_monthly_halalas int  not null default 0,
  price_yearly_halalas  int  not null default 0,
  max_active_jobs       int,                  -- null = بلا حد
  max_seats             int,
  monthly_analysis_quota int,
  custom_domain         boolean not null default false,
  remove_branding       boolean not null default false,
  api_access            boolean not null default false,
  is_public             boolean not null default true,
  sort_order            int not null default 0
);

create table subscriptions (
  org_id                  uuid primary key references organizations(id) on delete cascade,
  plan_code               text not null references plans(code),
  billing_cycle           text not null default 'monthly'
                            check (billing_cycle in ('monthly','yearly')),
  status                  text not null default 'trialing',
  trial_ends_at           timestamptz,
  current_period_start    timestamptz not null default now(),
  current_period_end      timestamptz,
  provider                text,   -- 'moyasar' | 'tap' | 'manual'
  provider_customer_id    text,
  provider_subscription_id text,
  extra_analysis_credits  int not null default 0,   -- رصيد إضافي يمنحه مدير المنصّة
  cancel_at_period_end    boolean not null default false,
  updated_at              timestamptz not null default now()
);

-- عدّاد سريع للفحص في المسار الحرج (قبل نداء Gemini)
create table usage_counters (
  org_id        uuid not null references organizations(id) on delete cascade,
  period_start  date not null,
  analyses_used int not null default 0,
  emails_sent   int not null default 0,
  primary key (org_id, period_start)
);

-- سجل تفصيلي للتحليل المالي في لوحة المنصّة (ليس في المسار الحرج)
create table usage_events (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references organizations(id) on delete cascade,
  kind           text not null,          -- 'analysis' | 'email' | 'whatsapp'
  application_id uuid,
  model          text,
  input_tokens   int,
  output_tokens  int,
  cost_micros    bigint,                 -- تكلفتنا نحن بالميكرو-ريال
  created_at     timestamptz not null default now()
);
create index on usage_events(org_id, created_at desc);

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  number              text not null unique,
  amount_halalas      int not null,
  vat_halalas         int not null default 0,
  status              text not null default 'open',  -- open|paid|void|refunded
  provider_payment_id text,
  zatca_uuid text, zatca_hash text, zatca_qr text,   -- فوترة إلكترونية (§8.3)
  issued_at timestamptz not null default now(),
  paid_at   timestamptz
);
```

### التدقيق والانتحال

```sql
create table audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid references organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id),
  actor_kind    text not null default 'user',  -- user|platform_admin|system
  action        text not null,                 -- 'job.publish','app.status_change','org.suspend'…
  target_type   text, target_id text,
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index on audit_log(org_id, created_at desc);

create table impersonation_sessions (
  id               uuid primary key default gen_random_uuid(),
  platform_user_id uuid not null references auth.users(id) on delete cascade,
  org_id           uuid not null references organizations(id) on delete cascade,
  reason           text not null,
  expires_at       timestamptz not null default now() + interval '60 minutes',
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index on impersonation_sessions(platform_user_id) where ended_at is null;
```

### تعديل الجداول القائمة

```sql
-- 1) org_id على كل جدول مستأجَر
alter table jobs           add column org_id uuid references organizations(id) on delete cascade;
alter table applications   add column org_id uuid references organizations(id) on delete cascade;
alter table ai_evaluations add column org_id uuid references organizations(id) on delete cascade;
alter table status_history add column org_id uuid references organizations(id) on delete cascade;

-- 2) نقل بيانات الشركة الحالية إلى مؤسسة #1 (backfill)
with seed_org as (
  insert into organizations (slug, name, status, listed_publicly)
  select 'default', coalesce(nullif(company_name,''), 'الشركة'), 'active', true
  from settings where id = 1
  returning id
)
update jobs set org_id = (select id from seed_org) where org_id is null;
-- (نفس النمط لبقية الجداول، ثم:)

-- 3) تحويل كل profiles القائمة إلى أعضاء في المؤسسة الافتراضية
insert into memberships (org_id, user_id, role)
select (select id from organizations where slug='default'), p.id,
       case when p.role = 'admin' then 'owner'::member_role else 'hr'::member_role end
from profiles p;

-- 4) الآن فقط: not null + فهارس
alter table jobs           alter column org_id set not null;
alter table applications   alter column org_id set not null;
alter table ai_evaluations alter column org_id set not null;
alter table status_history alter column org_id set not null;
create index on jobs(org_id, status) where deleted_at is null;
create index on applications(org_id, created_at desc);
create index on applications(org_id, job_id, status);

-- 5) تفكيك settings أحادي الصف
--    company_name/retention_months انتقلا إلى organizations
drop table settings;   -- بعد النقل

-- 6) تسجيل سبب فشل التحليل (T2 / D5)
alter table applications add column analysis_error text;

-- 7) تحصين قيود الفرادة على مستوى الشركة
--    (job_id,email) يبقى صحيحًا لأن الوظيفة مملوكة لشركة واحدة
```

### حراس التناسق (trigger)

قيد `org_id` وحده لا يمنع خطأ برمجيًا يربط طلبًا بوظيفة شركة أخرى. نضيف حارسًا:

```sql
create or replace function public.enforce_application_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select org_id from jobs where id = new.job_id) is distinct from new.org_id then
    raise exception 'org mismatch between application and job' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger applications_org_guard
before insert or update of job_id, org_id on applications
for each row execute function public.enforce_application_org();
```

## 2.3 دوال المساعدة و RLS الجديدة

```sql
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- كل المؤسسات التي يراها المستخدم الحالي: عضويّاته + أي انتحال نشط
create or replace function public.current_org_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct org_id), '{}')
  from (
    select org_id from memberships where user_id = auth.uid()
    union
    select org_id from impersonation_sessions
     where platform_user_id = auth.uid()
       and ended_at is null and expires_at > now()
  ) s
$$;

create or replace function public.is_org_member(
  p_org uuid, p_roles member_role[] default null
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.org_id = p_org
      and (p_roles is null or m.role = any(p_roles))
  ) or exists (
    select 1 from impersonation_sessions i
    where i.platform_user_id = auth.uid() and i.org_id = p_org
      and i.ended_at is null and i.expires_at > now()
  )
$$;
```

**نمط السياسة الموحّد** — لاحظ لفّ نداء الدالة داخل `(select …)`؛ هذا يجعل PostgreSQL يقيّمها **مرة واحدة لكل جملة** بدل مرة لكل صف (فرق أداء بعشرات الأضعاف على الجداول الكبيرة):

```sql
drop policy jobs_staff_select on jobs;
create policy jobs_member_select on jobs
  for select to authenticated
  using (org_id = any ((select public.current_org_ids())));

create policy jobs_member_write on jobs
  for insert to authenticated
  with check (public.is_org_member(org_id, array['owner','admin','hr']::member_role[]));

-- 'viewer' يقرأ ولا يكتب؛ 'owner' وحده يمسّ الفوترة
create policy applications_member_select on applications
  for select to authenticated
  using (org_id = any ((select public.current_org_ids())));
```

**مصفوفة RLS الجديدة (تحديث §4.1):**

| الجدول | anon | viewer | hr | admin | owner | platform_admin |
|---|---|---|---|---|---|---|
| `organizations` | select إن `listed_publicly` | select org | select org | update org | update + delete | كل شيء |
| `memberships` | — | select org | select org | CRUD (عدا owner) | CRUD | كل شيء |
| `jobs` | select المنشور من شركة مُدرجة | select | CRUD | CRUD | CRUD | select |
| `applications` | **لا إدخال مباشر** (عبر Edge — D15) | select | select + RPC حالة | + | + | select |
| `ai_evaluations` | — | select | select + `interview_notes` | + | + | select |
| `status_history` | عبر RPC `track_application` | select | select+insert | + | + | select |
| `subscriptions` / `invoices` | — | — | — | select | select | كل شيء |
| `usage_counters` | — | select | select | select | select | كل شيء |
| `plans` | select العام | select | select | select | select | كل شيء |
| `platform_admins` | — | — | — | — | — | كل شيء |
| `audit_log` | — | — | — | select org | select org | كل شيء |
| Storage `cvs` | **لا شيء** | حسب `org_id` في المسار | ↑ | ↑ | ↑ | ↑ |
| Storage `org-assets` | select (شعارات عامة) | — | insert org | ↑ | ↑ | ↑ |

## 2.4 عزل التخزين — الإصلاح الحرج

```sql
-- المسار الجديد: cvs/{org_id}/{application_id}.{ext}
drop policy cvs_public_insert on storage.objects;   -- D15: لا رفع من anon إطلاقًا
drop policy cvs_staff_select  on storage.objects;

create policy cvs_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cvs'
    and ((storage.foldername(name))[1])::uuid = any ((select public.current_org_ids()))
  );
```

**ترحيل الملفات القائمة:** سكربت لمرة واحدة (service role) ينسخ `{id}.pdf` → `{org_id}/{id}.pdf` ثم يحدّث `applications.cv_path` ثم يحذف الأصل. يُنفَّذ في نافذة صيانة قصيرة قبل استقبال أول مستأجر ثانٍ.

## 2.5 مسار التقديم الجديد (D15)

```
المتصفح ──multipart──▶ Edge Function: submit-application
                          1. Turnstile / rate limit بالـ IP + البريد
                          2. تحقق: الوظيفة منشورة + غير مغلقة + شركتها active/trial
                          3. تحقق zod (نفس مخطط lib/validations)
                          4. رفع بـ service role إلى cvs/{org_id}/{app_id}.{ext}
                          5. insert application (org_id مستنتج من الوظيفة، لا من العميل)
                          6. تنفيذ fire-and-forget لـ analyze-application
                          7. إرجاع ref_code
```

**ما يُكسب:** لا يستطيع مجهول رفع ملف في مجلد شركة أخرى، ولا إغراق التخزين، ولا تجاوز فحوص الإغلاق، ولا استنزاف حصة تحليلات شركة عبر تقديمات وهمية.

## 2.6 حارس الحصة داخل `analyze-application` (D16)

```ts
// قبل أي نداء Gemini
const { data: quota } = await admin.rpc("check_analysis_quota", { p_org: orgId });
if (!quota.allowed) {
  await admin.from("applications").update({
    analysis_status: "failed",
    analysis_error: "quota_exceeded",       // T2 محلولة
  }).eq("id", applicationId);
  await notifyOrgOwners(orgId, "quota_exceeded");
  return json(402, { error: "quota exceeded" });
}
```

`check_analysis_quota` دالة `security definer` تجمع `plans.monthly_analysis_quota + subscriptions.extra_analysis_credits` وتقارنها بـ `usage_counters` للفترة الحالية، وتزيد العدّاد ذريًا (`insert … on conflict do update set analyses_used = analyses_used + 1`) لمنع سباق النداءات المتوازية.

**ملاحظة تكلفة:** سيرة ذاتية PDF نموذجية ≈ 3–6k رمز إدخال و~2k إخراج على `gemini-3.5-flash`. التكلفة الفعلية للتحليل الواحد **أجزاء من الهللة**. لذلك الحصة أداة **تسعير حسب القيمة** لا حماية من الإفلاس — وهذا يعني هامشًا ممتازًا ومساحة لسخاء تسويقي في الخطة المجانية.

## 2.7 التوجيه والبنية الجديدة للملفات

```
srp/app/
├── (marketing)/                    # الموقع التعريفي — الجذر
│   ├── page.tsx                    # ★ صفحة الهبوط
│   ├── pricing/page.tsx
│   ├── features/page.tsx
│   ├── fairness/page.tsx           # ★ صفحة "كيف نُنصف" — ورقة التميّز
│   └── legal/{privacy,terms,dpa}/
├── (marketplace)/
│   ├── jobs/page.tsx               # ★ كل الوظائف مجمّعة حسب الشركة
│   ├── companies/page.tsx          # ★ دليل الشركات المسجّلة
│   └── c/[slug]/
│       ├── page.tsx                # صفحة توظيف الشركة (شعار، نبذة، وظائفها)
│       ├── jobs/[id]/page.tsx
│       └── jobs/[id]/apply/page.tsx
├── track/[ref]/page.tsx
├── (auth)/
│   ├── login/ · signup/ · forgot/
│   └── invite/[token]/page.tsx     # قبول الدعوة
├── (workspace)/admin/…             # لوحة المستأجر (القائمة + نطاق org)
│   └── settings/{company,team,billing,branding,careers}/
└── (platform)/platform/…           # ★ وحدة تحكم مدير النظام
```

**`proxy.ts` (وسيط Next 16)** يضيف طبقة واحدة قبل منطق الجلسة الحالي:

```ts
const host = request.headers.get("host") ?? "";
const base = process.env.NEXT_PUBLIC_ROOT_DOMAIN!;         // "hirely.sa"
if (host !== base && host !== `www.${base}` && host.endsWith(`.${base}`)) {
  const slug = host.slice(0, -(base.length + 1));
  return NextResponse.rewrite(new URL(`/c/${slug}${pathname}`, request.url));
}
// النطاقات المخصصة: بحث في organizations.custom_domain (مُخزَّن مؤقتًا)
```

## 2.8 اختيار المؤسسة النشطة

- عند الدخول: إن كان للمستخدم عضوية واحدة → تُختار تلقائيًا. أكثر من واحدة → شاشة اختيار.
- تُحفظ في كوكي `srp_org` (httpOnly، signed) وتُتحقق **دائمًا** في `lib/auth.ts` مقابل `memberships` — الكوكي تلميح لا تفويض.
- `requireProfile()` تُستبدل بـ `requireMembership(): { user, org, role }`، وكل استعلام في اللوحة يضيف `.eq("org_id", org.id)` صراحةً (حزام + حمّالة مع RLS).
- مبدّل مؤسسات في أعلى الشريط الجانبي (بنمط مساحات عمل Notion).

---

# الجزء الثالث — الواجهات الثلاث المطلوبة

## 3.1 وحدة تحكم مدير النظام — `/platform`

هدف التصميم: **بسيطة، كثيفة المعلومات، تُدار من الجوال عند الحاجة.** لا زخرفة.

| الصفحة | المحتوى | الإجراءات |
|--------|---------|-----------|
| `/platform` | MRR، عدد المستأجرين حسب الحالة، تحليلات هذا الشهر، تكلفة Gemini التقديرية، الهامش، معدل فشل التحليل، آخر 10 اشتراكات | — |
| `/platform/organizations` | جدول: الشركة، الخطة، الحالة، المقاعد، وظائف نشطة، تحليلات/الحصة، آخر نشاط | بحث، فلتر، تصدير CSV |
| `/platform/organizations/[id]` | تبويبات: نظرة عامة · الأعضاء · الاستخدام (رسم زمني) · الاشتراك والفواتير · سجل التدقيق | تعليق/تفعيل · تغيير خطة · منح رصيد تحليلات · تمديد التجربة · **دخول كـ (انتحال)** · حذف نهائي |
| `/platform/plans` | تحرير الخطط والحدود والأسعار (بلا نشر كود) | إنشاء/تعديل/إخفاء خطة |
| `/platform/invoices` | كل الفواتير، الحالة، إعادة إرسال | تعليم كمدفوعة يدويًا |
| `/platform/ai` | صحة خط التحليل: الفاشلة مع `analysis_error`، متوسط زمن النداء، توزيع الدرجات، إصدار البرومبت المستخدم | إعادة تشغيل جماعية · تصعيد إصدار البرومبت |
| `/platform/audit` | `audit_log` كامل مع فلتر بالفاعل والفعل والشركة | تصدير |
| `/platform/announcements` | بانر معلن لكل المستأجرين (صيانة، ميزة جديدة) | نشر/إخفاء |

**الانتحال (D22) — البروتوكول:**
1. مدير المنصّة يضغط "دخول كـ" ويكتب **سببًا إلزاميًا**.
2. تُنشأ `impersonation_sessions` صالحة 60 دقيقة، ويُسجَّل الحدث في `audit_log`.
3. `current_org_ids()` تشمل المؤسسة تلقائيًا ⇒ RLS تسمح بالقراءة بلا اختراق.
4. بانر أحمر ثابت أعلى كل صفحة: «أنت تتصفح بيانات **{الشركة}** كمدير منصّة — إنهاء».
5. كل كتابة أثناء الجلسة تُوسَم `actor_kind='platform_admin'` في `audit_log`.
6. **مقترح للنقاش:** منع الانتحال من تنزيل السير الذاتية افتراضيًا (الوصول للبيانات الشخصية أخطر من إصلاح إعداد). قرارك.

## 3.2 مساحة عمل المستأجر — `/admin`

تبقى كل الصفحات القائمة، مع إضافات التعدد:

**جديد:**
- مبدّل المؤسسة + شعار الشركة أعلى الشريط الجانبي
- `/admin/settings/branding` — شعار، غلاف، لون، نبذة، الرابط `slug`، الظهور في السوق العام
- `/admin/settings/careers` — معاينة صفحة التوظيف `/c/{slug}` + زر نسخ الرابط + كود التضمين (iframe)
- `/admin/settings/billing` — الخطة الحالية، شريط استهلاك الحصة، الفواتير، الترقية
- `/admin/settings/team` — دعوات بالبريد (بدل كلمات مرور يحددها المدير)، أدوار، إزالة عضو
- شارة "اقتربت من حصتك" عند 80% وقفل ناعم عند 100% (الوظائف والطلبات تعمل، التحليل فقط يتوقف)

**تعديل:** كل استعلام في 18 ملف صفحة/إجراء يضيف نطاق `org_id`؛ كل `revalidatePath` يصير `revalidateTag(\`org:${org.id}\`)`.

**الأدوار الجديدة:**
| الدور | الصلاحية |
|-------|----------|
| `owner` | كل شيء + الفوترة + حذف المؤسسة + نقل الملكية (واحد على الأقل دائمًا) |
| `admin` | كل شيء عدا الفوترة وحذف المؤسسة |
| `hr` | الوظائف والطلبات والمقابلات وتغيير الحالات |
| `viewer` | قراءة فقط — لمدير القسم الذي يراجع مرشحيه بلا تعديل |

## 3.3 صفحة الهبوط — `/`

بنية مقترحة (عربية RTL، بأسلوب Notion: نص أولًا، مساحات واسعة، لقطة منتج حقيقية لا رسوم مجردة):

| القسم | المحتوى |
|-------|---------|
| **1. البطل** | عنوان: «رتّب المتقدمين بالذكاء الاصطناعي — واتّخذ القرار بنفسك.» فرعي: «فرز سير ذاتية عربية وإنجليزية بدرجة مبرَّرة، لا صندوق أسود.» زران: ابدأ مجانًا · شاهد وظائف الشركات |
| **2. شريط ثقة** | شعارات العملاء (أو «انضم لأول 20 شركة» في البداية) |
| **3. المشكلة** | ثلاث بطاقات: مئات السير · فرز بالكلمات المفتاحية يرفض المؤهلين · لا وقت لتبرير القرار |
| **4. كيف يعمل** | 3 خطوات بلقطات: انشر الوظيفة ← الذكاء الاصطناعي يقرأ ويرتّب ← تقرأ التبرير وتقرر |
| **5. ★ قسم الإنصاف** | «لا درجة بلا دليل» — لقطة حقيقية لبطاقة التقييم (نقاط القوة والفجوات وعلامات الانتباه) + قائمة ما **يتجاهله** النظام: الاسم، الجنس، العمر، الجنسية، صورة، اسم الجامعة. **هذا هو القسم الذي يبيع.** |
| **6. الميزات** | شبكة 6–8 بطاقات (فرز، أسئلة مقابلة مخصّصة، تقويم، إحصاءات، صفحة توظيف، سوق الوظائف) |
| **7. سوق الوظائف** | «وظائفك تظهر تلقائيًا أمام آلاف الباحثين» + رابط `/jobs` — قيمة يصعب على المنافس تقليدها |
| **8. الأسعار** | 3 خطط + مقارنة + «كل الخطط تشمل التبرير الكامل للدرجة» |
| **9. الأسئلة الشائعة** | الخصوصية، أين تُخزَّن البيانات، هل يُستخدم CV في تدريب النماذج (لا)، الاحتفاظ، الإلغاء |
| **10. الختام** | دعوة + تذييل (روابط قانونية، DPA، تواصل) |

## 3.4 سوق الوظائف العام — `/jobs` و `/companies`

**`/jobs` — الوظائف مجمّعة حسب الشركة (الطلب الصريح):**

```
┌ شريط بحث + فلاتر: [الشركة] [المدينة] [النوع] [القسم] [عن بُعد] [الأحدث ▾]
│
├ ┌───────────────────────────────────────────────┐
│ │ 🏢 [شعار] شركة الأفق التقنية      12 وظيفة →  │  ← رأس مجموعة (لاصق)
│ ├───────────────────────────────────────────────┤
│ │ • مهندس واجهات أمامية    الرياض · دوام كامل   │
│ │ • محلل بيانات            عن بُعد · عقد        │
│ │ • … عرض كل الـ 12 →                            │
│ └───────────────────────────────────────────────┘
├ ┌ 🏢 مجموعة النخبة الطبية        4 وظائف →     ┐ …
```

- تجميع افتراضي بالشركة، مع مبدّل «عرض كقائمة موحّدة» للباحث الذي يهمّه الدور لا الشركة.
- ترتيب المجموعات: الأحدث نشاطًا، مع دفع الشركات المدفوعة قليلًا للأعلى (بشفافية — وسم «مميّزة»).
- **SEO:** `JobPosting` JSON-LD لكل وظيفة ⇒ فهرسة في **Google for Jobs** — قناة استقطاب مجانية لك ولعملائك. `sitemap.ts` ديناميكي + `robots.ts`.
- **التخزين المؤقت:** ISR مع `revalidateTag('marketplace')` و`org:{id}` — نشر وظيفة يُحدّث صفحات شركتها والسوق فقط.
- شرط الظهور: `organizations.listed_publicly = true` و`status in ('trial','active')` — الشركة المعلّقة تختفي فورًا.

**`/companies` — دليل الشركات:** شبكة بطاقات (شعار، اسم، قطاع، مدينة، عدد الوظائف المفتوحة) + بحث + فلتر قطاع.

**`/c/{slug}` — صفحة توظيف الشركة:** غلاف + شعار + نبذة (Markdown) + وظائفها + رابط الموقع. هذه الصفحة هي ما يضعه العميل في «انضم إلينا» على موقعه، وهي سبب تجاري قوي للاشتراك.

---

# الجزء الرابع — السوق والتميّز

## 4.1 مسح المنافسين

### عالميًا

| المنصّة | السعر التقريبي | قوّتها | الفجوة التي نستغلها |
|---------|----------------|--------|---------------------|
| **Workable** | من ~$299/شهر | الأعلى تقييمًا شمولًا؛ سورسنغ + ATS + فرز آلي + تقارير | لا عربية حقيقية ولا RTL؛ سعر مرتفع للسوق المحلي؛ الدرجة بلا تبرير مفصّل |
| **Greenhouse** | مؤسسي (آلاف$) | هيكلة مقابلات ممتازة وتقارير DEI | تعقيد وتكلفة؛ إنجليزي؛ لا يناسب شركة 50 موظفًا |
| **Manatal** | ~$15/مستخدم | أفضل قيمة AI بسعر منخفض؛ AI Interviewer (فيديو غير متزامن) + ربط بنماذج لغوية | التبرير سطحي؛ لا RTL؛ لا امتثال محلي |
| **Zoho Recruit** | ~$25/مستخدم | سعر + منظومة Zoho | تجربة قديمة؛ التعريب سطحي (ترجمة لا تصميم RTL) |
| **JazzHR** | من $149/شهر | بساطة للشركات الصغيرة | ذكاء اصطناعي ضحل؛ سوق أمريكي |
| **Recruitee (Tellent)** | متوسط | تعاون الفريق + بنّاء صفحة توظيف جيد | لا عربية؛ لا سوق وظائف مشترك |
| **Ashby** | مؤسسي | تحليلات ممتازة | معقّد وغالٍ |

### إقليميًا (الخليج والسعودية)

| المنصّة | الطبيعة | الفجوة |
|---------|---------|--------|
| **Bayzat** | منظومة موارد بشرية كاملة (رواتب + تأمين + ATS) بالذكاء الاصطناعي | الـ ATS مكوّن ثانوي وليس المنتج؛ ليست AI-first في الفرز |
| **Qureos** | منصّة توظيف AI موجّهة للسوق السعودي | أقرب إلى سوق/شبكة توظيف منها إلى ATS تديره الشركة بنفسها |
| **Talentera** | صفحات توظيف عربية + ارتباط بـ Bayt | الفرز تقليدي/كلمات مفتاحية، لا تفسير |
| **جدارات / طاقات** | تجميع حكومي للفرص | ليست ATS ولا ذكاء اصطناعي — لكنها **قناة توزيع** يجب التكامل معها لاحقًا |
| **Bayt · تنقيب · مهنتي** | لوحات وظائف بقواعد مرشحين ضخمة | لا فرز ذكي مفسَّر؛ فرصة شراكة لا منافسة مباشرة |

### شكاوى السوق الموثّقة (فرصنا)

| الشكوى | مصدرها | كيف نردّ عليها |
|--------|--------|----------------|
| الأنظمة القديمة تطابق **كلمات مفتاحية** لا مهارات، فترفض مؤهلين | تقارير 2026 عن ATS | Gemini يقرأ الـ PDF دلاليًا؛ البرومبت يفرّق بين «مهارة مذكورة صراحة» و«مهارة ضمنية» (نصف درجة) |
| **75%** من السير لا يراها بشر | مسوح السوق | القرار بشري إلزاميًا؛ لا رفض آلي (§10.4) |
| أسئلة الاستبعاد المخفية تسبب **22%** من الرفض دون علم المتقدم | تحليلات 2026 | أسئلة الفرز عندنا **مدخل للتقييم لا مقصلة**؛ الرد يُعرض للـ HR |
| الفجوات الوظيفية تُعلَّم تلقائيًا كخطر | نفس المصدر | البرومبت يفرض: الفجوة > 6 أشهر **سؤال محايد للمقابلة**، لا مانع، وبلا تكهّن بالسبب |
| تحليل السير غير الغربية التنسيق ضعيف | نفس المصدر | نموذج متعدد الوسائط يقرأ الـ PDF كما هو، عربي أو إنجليزي أو مختلط |
| «ميزات التقييم نتائجها عشوائية ولا أحد يستخدمها» | آراء موظفي التوظيف | معايرة صريحة في البرومبت (85+ / 70–84 / 50–69 / <50) + مجموع البنود يُعاد حسابه في الكود، لا نثق برقم النموذج |
| الشركات تخشى المسؤولية القانونية من قرارات AI | نفس المصدر | تقرير شفافية قابل للتصدير + سجل تدقيق + إصدار برومبت مخزّن مع كل تقييم |
| **قانون الاتحاد الأوروبي للذكاء الاصطناعي**: أنظمة التوظيف "عالية الخطورة"، التزامات من ديسمبر 2027، غرامات تصل 15 مليون يورو أو 3% من الإيراد العالمي | نصوص القانون | جاهزون معماريًا: شفافية، مراجعة بشرية حالة بحالة، توثيق تقني، إفصاح للمتقدم |

## 4.2 ميزاتنا المميّزة — مصنّفة

### أ) موجودة بالفعل وتحتاج **تسويقًا** لا بناءً 🟢

1. **«لا درجة بلا تبرير»** — كل درجة مصحوبة بنقاط قوة وفجوات وعلامات انتباه، وكلها مربوطة بمحتوى السيرة.
2. **قواعد إنصاف مفروضة في البرومبت** — تجاهل الاسم/الجنس/العمر/الجنسية/الديانة/الحالة الاجتماعية/الصورة/الحي/سمعة الجامعة.
3. **القرار بشري 100%** — لا رفض آلي ولا قائمة قصيرة آلية.
4. **تفصيل الدرجة لخمسة بنود** بسقوف واضحة (40/30/15/10/5) بدل رقم غامض.
5. **مؤشر ثقة** (`high/medium/low`) — يعترف النظام حين لا يكون واثقًا.
6. **إصدار البرومبت والنموذج محفوظان مع كل تقييم** — قابلية تدقيق كاملة.
7. **عربي أصيل**: RTL، خصائص Tailwind منطقية، خط عربي، مخرجات AI بالعربية الفصحى مع إبقاء المصطلحات التقنية إنجليزية.
8. **الاحتفاظ والحذف التلقائي** — cron يحذف السير بعد المدة المحددة.

> **توصية:** بناء صفحة `/fairness` تشرح هذه الثمانية بلغة العميل، وربطها من صفحة الهبوط والتذييل وكل بطاقة تقييم في اللوحة. هذه أرخص ميزة تنافسية على الإطلاق — مبنية ومدفوعة الثمن سلفًا.

### ب) فجوات مقابل المنافسين — **إلزامية للتكافؤ** 🟡

| # | الميزة | لماذا | التقدير |
|---|--------|-------|---------|
| P1 | خط أنابيب Kanban + سحب وإفلات | كل منافس لديه؛ غيابه يظهر كنقص فوري في الديمو | 3 أيام |
| P2 | إجراءات جماعية (تغيير حالة/رفض/تصدير لعدة مرشحين) | فرق التوظيف تعمل بالدفعات | 2 يوم |
| P3 | عروض محفوظة + فلاتر مركّبة | استخدام يومي | 2 يوم |
| P4 | ملاحظات فريق + إشارات @ على المرشح | التوظيف عمل جماعي | 3 أيام |
| P5 | بطاقات تقييم مقابلة مهيكلة (scorecards) + معايرة | Greenhouse يبيع على هذا | 4 أيام |
| P6 | بنّاء صفحة توظيف + كود تضمين iframe | المستأجر يريدها على موقعه | 3 أيام |
| P7 | نشر إلى قنوات خارجية (LinkedIn/Bayt/جدارات) | توقّع أساسي | 5 أيام + شراكات |
| P8 | Webhooks + API عام | متطلب السوق المتوسط | 4 أيام |
| P9 | تصدير CSV/Excel للطلبات والإحصاءات | يُطلب في كل ديمو | 1 يوم |

### ج) تميّز حقيقي — **ابنِ هذه** 🔵

| # | الميزة | لماذا تتميّز | التقدير |
|---|--------|--------------|---------|
| **X1** | **الفرز الأعمى (Blind Screening)** — إخفاء الاسم والصورة والجنسية والجنس عن HR حتى القائمة القصيرة، مع مفتاح تشغيل لكل وظيفة، وتقرير «قبل/بعد» يقيس أثر الإخفاء | لا أحد في السوق المتوسط يقدّمه؛ يدعمه برومبتنا أصلًا؛ ورقة امتثال ذهبية | 5 أيام |
| **X2** | **تقرير شفافية الذكاء الاصطناعي (PDF)** لكل توظيف: النموذج، إصدار البرومبت، البنود، التبرير، من قرّر ومتى، وسجل التغييرات | يحوّل خوف المسؤولية القانونية إلى سبب شراء؛ يستبق قانون الاتحاد الأوروبي | 4 أيام |
| **X3** | **إشعارات واتساب للمرشحين** (Unifonic السعودية أو 360dialog) | البريد شبه ميت لدى المرشح الخليجي؛ أقوى تحسين لتجربة المتقدم في المنطقة | 5 أيام |
| **X4** | **مخزون المواهب وإعادة المطابقة** — عند نشر وظيفة جديدة تُقيَّم السير السابقة (بموافقة وضمن مدة الاحتفاظ) تلقائيًا مقابلها | المنافسون يبيعونه كـ«سورسنغ AI» بسعر مرتفع؛ عندنا شبه مجاني (نداء واحد لكل مرشح) | 4 أيام |
| **X5** | **رسالة تطوير للمرشح المرفوض** (اختيارية، يراجعها HR قبل الإرسال، بلا كشف تفاصيل التقييم) | يعالج شكوى «الصندوق الأسود» مباشرة ويبني سمعة العلامة التوظيفية للعميل. **تنبيه:** لا تتعارض مع §10 ما دامت خارج قالب الرفض الرسمي وبمراجعة بشرية إلزامية — تحتاج اعتمادك | 4 أيام |
| **X6** | **لوحة السعودة (نطاقات)** — نسبة السعوديين في التوظيفات، أثر كل توظيف على النطاق، تنبيه قبل تجاوز الحد | متطلب سعودي حقيقي لا يلبّيه أي ATS عالمي | 4 أيام |
| **X7** | **تقويم هجري/ميلادي** في كل التواريخ والتقارير | تفصيلة صغيرة تصنع إحساس «مبني لنا» | 1 يوم |
| **X8** | **كشف التكرار والتزوير** — نفس السيرة باسمين، سير مولّدة بالذكاء الاصطناعي، تناقض بين إجابات الفرز والسيرة | مشكلة متفاقمة في 2026 مع التقديم الآلي | 4 أيام |
| **X9** | **سوق الوظائف المشترك** (§3.4) — كل مستأجر يحصل على زيارات من الصفحة العامة و Google for Jobs | حلقة قيمة ثنائية لا يستطيع Workable تقديمها لشركة سعودية | مشمول في S6 |
| **X10** | **بنّاء صفحة توظيف بأسلوب Notion** — كتل قابلة للسحب (نص، صورة، فيديو، شهادات موظفين، مزايا) | يحقق طلب «الإلهام من Notion» كميزة منتج لا كشكل فقط | 6 أيام |
| **X11** | **أداة مجانية للمرشحين: فاحص توافق السيرة العربية** — تُشغّل نفس المحرّك، تعطي المرشح تقريرًا، وتجلب لنا زيارات وبريدًا | قناة استقطاب عضوية (تنقيب يفعلها بالإنجليزية) — تسويق يموّل نفسه | 3 أيام |

### د) مؤجَّلة عمدًا (v2+) ⚪
مقابلات فيديو غير متزامنة (Manatal يقدّمها — تكلفة تخزين ومعالجة عالية) · SSO/SAML (مؤسسي) · تكامل Qiwa/GOSI (يحتاج ترخيصًا واتفاقيات) · تطبيق جوال أصلي · تقييمات مهارية.

---

# الجزء الخامس — نظام التصميم المستوحى من Notion

## 5.1 المبادئ المستخلصة

1. **الحياد الدافئ** — لا أبيض/رمادي بارد؛ رماديات مائلة للبيج (ecru). خلفية جانبية `#F7F6F3` وليست `#F5F5F5`.
2. **النص هو الواجهة** — الهرمية بالحجم والوزن والمسافة، لا بالألوان والحدود والظلال.
3. **لون واحد مشبع فقط** — أزرق `#2383E2` للإجراء الأساسي والروابط. كل ما عداه محايد أو باستيل هادئ.
4. **حدود شبه معدومة** — `rgba(55,53,47,0.09)` بدل رمادي صريح؛ الظلال نادرة جدًا (القوائم المنبثقة فقط).
5. **الحالة بالتعبئة لا بالإطار** — التمرير = تعبئة رمادية خفيفة `rgba(55,53,47,0.06)`.
6. **أنصاف أقطار صغيرة** — 4px للأزرار والحقول، 8–12px للبطاقات. (الحالي `0.625rem = 10px` لكل شيء ⇒ يبدو «shadcn افتراضي»).
7. **وحدة 4px** لكل المسافات والحشوات.
8. **عرض محتوى محدود** ~900px مع هوامش سخية.
9. **أيقونة/إيموجي لكل كيان** — مساحة العمل، الشركة، الوظيفة. يعطي شخصية بلا تصميم إضافي.
10. **حالات فارغة ودودة** — رسم خفيف + جملة + زر واحد، لا جدول فارغ.

## 5.2 الرموز المقترحة (تعديل `app/globals.css`)

```css
:root {
  /* حياد دافئ — لبّ مظهر Notion */
  --background:        oklch(1 0 0);            /* #FFFFFF */
  --foreground:        oklch(0.27 0.008 75);    /* #37352F */
  --muted:             oklch(0.973 0.004 85);   /* #F7F6F3 لوح جانبي */
  --muted-foreground:  oklch(0.55 0.008 75);    /* #787774 */
  --card:              oklch(1 0 0);
  --border:            oklch(0.92 0.004 85);    /* #E9E9E7 */
  --input:             oklch(0.92 0.004 85);

  /* اللون المشبع الوحيد */
  --primary:            oklch(0.60 0.17 251);   /* #2383E2 */
  --primary-foreground: oklch(1 0 0);
  --ring:               oklch(0.60 0.17 251 / 40%);

  --destructive:       oklch(0.58 0.19 27);     /* #E03E3E — نبرة Notion الحمراء */

  /* أنصاف أقطار Notion */
  --radius:            0.5rem;                  /* البطاقات 8px */
  --radius-sm:         0.25rem;                 /* الأزرار والحقول 4px */
  --radius-lg:         0.75rem;                 /* الأوعية الكبيرة 12px */

  /* لوح الوسوم الباستيلي — للحالات وأنواع الوظائف */
  --tag-gray:   #E3E2E0;  --tag-brown:  #EEE0DA;  --tag-orange: #FADEC9;
  --tag-yellow: #FDECC8;  --tag-green:  #DBEDDB;  --tag-blue:   #D3E5EF;
  --tag-purple: #E8DEEE;  --tag-pink:   #F5E0E9;  --tag-red:    #FFE2DD;
}

.dark {
  --background:       oklch(0.19 0 0);          /* #191919 */
  --foreground:       oklch(0.87 0 0);          /* #D4D4D4 */
  --muted:            oklch(0.23 0 0);          /* #202020 */
  --muted-foreground: oklch(0.62 0 0);          /* #9B9B9B */
  --card:             oklch(0.23 0 0);
  --border:           oklch(1 0 0 / 9.4%);
  --primary:          oklch(0.65 0.16 251);     /* #2E9FFF أفتح للتباين */
}
```

**تعيين الوسوم على النطاق:**

| القيمة | اللون |
|--------|------|
| `new` جديد | أزرق |
| `under_review` قيد المراجعة | أصفر |
| `interview` مقابلة | بنفسجي |
| `accepted` مقبول | أخضر |
| `rejected` مرفوض | رمادي (لا أحمر — احترامًا للمرشح) |
| `draft` مسودة | رمادي · `published` منشور | أخضر · `closed` مغلق | بني |
| درجة ≥75 | أخضر · 50–74 | برتقالي · <50 | أحمر (تبقى كما هي — FR-04) |

## 5.3 التغييرات على المكوّنات

| المكوّن | التغيير |
|---------|---------|
| الشريط الجانبي | خلفية `--muted`، بلا حد، عناصر بحشوة 4px ونصف قطر 4px، تمرير = تعبئة رمادية، مبدّل مؤسسة أعلاه بأيقونة |
| الأزرار | ارتفاع 32px، نصف قطر 4px، الأساسي أزرق ممتلئ، الثانوي شفاف بحد خفيف جدًا، بلا ظل |
| البطاقات | حد 1px بلون `--border`، بلا ظل، نصف قطر 8px، حشوة 16–24px |
| الجداول | بلا خطوط عمودية، صف الرأس بخط أصغر ولون خافت، تمرير الصف = تعبئة خفيفة |
| الحقول | حد خفيف، تركيز = حلقة زرقاء 2px، خلفية `--muted` عند القراءة فقط |
| التبويبات | بأسلوب Notion: نص + خط سفلي 2px للنشط فقط، بلا حاوية |
| بطاقة التقييم | كتلة «callout» بخلفية باستيل + أيقونة يمينًا — تناسب نقاط القوة/الفجوات/الانتباه تمامًا |
| الحالات الفارغة | أيقونة خافتة + جملة + زر واحد |

> **ملاحظة خط:** `IBM Plex Sans Arabic` الحالي اختيار ممتاز ولا داعي لتغييره — أقرب عربي متاح لروح Inter. تُضاف `Inter` للأرقام والمصطلحات اللاتينية عبر `font-feature-settings` و`unicode-range`.

---

# الجزء السادس — خارطة الطريق

## 6.1 المراحل

| # | المرحلة | المخرجات | التقدير | يتوقف للاعتماد |
|---|---------|----------|---------|-----------------|
| **S1** | **التعدد والعزل** 🔴 | هجرة `0006`: كل الجداول الجديدة + `org_id` + backfill + إعادة كتابة كل RLS + ترحيل مسارات التخزين + `submit-application` + دوال المساعدة + توسيع `rls_check.sql` لاختبار العزل بين مستأجرين | 10–12 يوم | ✅ |
| **S2** | **الهوية والانضمام** | تسجيل ذاتي ⇒ إنشاء مؤسسة + owner، تأكيد البريد، دعوات (`manage-members`)، مبدّل المؤسسات، `requireMembership()`، الأدوار الأربعة | 6–7 أيام | ✅ |
| **S3** | **مساحة عمل المستأجر** | نطاق `org_id` في كل صفحة/إجراء، الهوية البصرية، صفحة `/c/{slug}`، `revalidateTag` لكل شركة، إنفاذ حدود الخطة في الواجهة | 6–7 أيام | ✅ |
| **S4** | **وحدة تحكم المنصّة** | `/platform` بكل صفحاتها، الانتحال المُدقّق، `audit_log`، لوحة صحة الذكاء الاصطناعي | 6–7 أيام | ✅ |
| **S5** | **الفوترة والعدادات** | الخطط والحدود، `check_analysis_quota`، تكامل Moyasar، الفواتير، التجربة والتذكير والتعليق | 8–10 أيام | ✅ |
| **S6** | **صفحة الهبوط والسوق** | `/` التسويقية، `/pricing`، `/fairness`، `/jobs` مجمّعة، `/companies`، JSON-LD، sitemap، SEO | 6–7 أيام | ✅ |
| **S7** | **نظام تصميم Notion** | الرموز، تحديث كل المكوّنات، الوضع الليلي، الحالات الفارغة، مراجعة الجوال | 5–6 أيام | ✅ |
| **S8** | **التكافؤ + التميّز** | P1–P9 ثم X1, X2, X3, X6, X7 (الباقي حسب أولويتك) | 15–20 يوم | ✅ لكل حزمة |
| **S9** | **التحصين والإطلاق** | تحديد المعدّل، Turnstile، النسخ الاحتياطي، اختبار حِمل، سياسة خصوصية + DPA، مراقبة، دليل التشغيل | 5–6 أيام | ✅ |

**الإجمالي: ~70–85 يوم عمل** (≈ 14–17 أسبوعًا بمطوّر واحد؛ S6 و S7 قابلتان للتوازي مع S4/S5).

## 6.2 مسار مختصر للإطلاق التجريبي (إن أردت أسرع)

**S1 → S2 → S3 → S6 → S9-مصغّرة = ~30 يومًا** يعطيك منتجًا قابلًا لاستقبال عملاء تجريبيين بفوترة يدوية (تحويل بنكي + فاتورة يدوية)، وتأجيل S4 و S5 إلى ما بعد التحقق من السوق. **هذا ما أوصي به** — لا تبنِ محرّك فوترة قبل أن تعرف أن أحدًا سيدفع.

## 6.3 ترتيب الهجرات

```
0006_multitenancy.sql        — الجداول، org_id، backfill، الدوال، إعادة كتابة RLS
0007_storage_isolation.sql   — سياسات التخزين الجديدة (بعد سكربت نقل الملفات)
0008_billing.sql             — plans, subscriptions, usage_*, invoices
0009_platform.sql            — platform_admins, audit_log, impersonation_sessions
0010_secrets_cleanup.sql     — نقل رابط cron والمفتاح إلى Vault (الدين T1)
```

---

# الجزء السابع — المخاطر والامتثال

| # | الخطر | الأثر | التخفيف |
|---|-------|------|---------|
| R1 | **تسريب بين المستأجرين** | وجودي — نهاية المنتج | كل استعلام يضيف `org_id` صراحة **بالإضافة** إلى RLS؛ مجموعة اختبار آلية تحاول قراءة بيانات مستأجر آخر بكل دور؛ لا نشر لـ S2 قبل نجاحها |
| R2 | **خطأ في ترحيل الملفات** يفقد سيرًا ذاتية | عالٍ | نسخ ثم تحقق ثم حذف؛ نسخة احتياطية للحاوية قبل البدء؛ نافذة صيانة معلنة |
| R3 | **استنزاف الخطة المجانية** | مالي | تأكيد بريد إلزامي + Turnstile + حد 25 تحليلًا/تجربة + فحص الحصة في Edge (D16) |
| R4 | **إغراق نموذج التقديم** في سوق عام | تشغيلي ومالي | `submit-application` مع تحديد معدّل بالـ IP والبريد، وكشف التكرار (X8) |
| R5 | **نظام حماية البيانات الشخصية السعودي (PDPL)** — تصبح «معالجًا» نيابة عن العملاء | قانوني | DPA نموذجي، إفصاح عن منطقة تخزين Supabase، احتفاظ لكل مؤسسة (موجود)، حق الحذف، سجل معالجة |
| R6 | **قانون الذكاء الاصطناعي الأوروبي** إن استهدفت عملاء بأوروبا | قانوني | جاهزون معماريًا (X2)؛ توثيق تقني + اختبار تحيّز دوري + إفصاح للمتقدم في نموذج التقديم |
| R7 | **الفوترة الإلكترونية (ZATCA)** للعملاء السعوديين | امتثالي | ابدأ بفواتير يدوية متوافقة؛ أتمتة المرحلة الثانية عند تجاوز ~20 عميلًا |
| R8 | **الاعتماد على Gemini** (تغيّر سعر/توفّر) | تشغيلي | البرومبت والمخطط مفصولان أصلًا؛ إضافة واجهة مزوّد مجرّدة في S8 تسمح ببديل |
| R9 | **صلاحية الانتحال** | خصوصية وسمعة | سبب إلزامي + 60 دقيقة + بانر + تدقيق كامل + (مقترح) منع تنزيل السير |
| R10 | **غياب الاختبارات (T3)** مع تضاعف التعقيد | تراكمي | إلزام: S1 تُسلَّم مع مجموعة اختبار عزل؛ كل مرحلة لاحقة تضيف اختباراتها |

---

# الجزء الثامن — التسعير المقترح (للنقاش)

| | **تجربة** | **الأساسية** | **النمو** | **المؤسسات** |
|---|---|---|---|---|
| السعر | مجانًا 14 يومًا | **299 ر.س**/شهر | **799 ر.س**/شهر | تسعير مخصّص |
| وظائف نشطة | 1 | 3 | 15 | بلا حد |
| تحليلات/شهر | 25 | 150 | 750 | تفاوضي |
| مقاعد | 2 | 3 | 10 | بلا حد |
| صفحة توظيف `/c/{slug}` | ✅ | ✅ | ✅ | ✅ |
| الظهور في سوق الوظائف | ✅ | ✅ | ✅ مميّزة | ✅ مميّزة |
| نطاق مخصّص | — | — | ✅ | ✅ |
| إزالة علامتنا | — | — | ✅ | ✅ |
| تقرير الشفافية (X2) | — | ✅ | ✅ | ✅ |
| الفرز الأعمى (X1) | — | — | ✅ | ✅ |
| واتساب (X3) | — | — | ✅ | ✅ |
| API + Webhooks | — | — | — | ✅ |
| الدعم | بريد | بريد | أولوية | مدير حساب + SLA |

**تحليل إضافي فوق الحصة:** 1 ر.س للتحليل، أو باقة 100 تحليل بـ 79 ر.س.
**سنوي:** خصم شهرين (‎-17%‎).
**ملاحظة هامش:** بتكلفة تحليل تقارب أجزاء الهللة، خطة النمو (750 تحليلًا) تكلّفنا رياليات معدودة شهريًا. الهامش الإجمالي المتوقع **>95%** — المجال مفتوح لسخاء تسويقي في الحصص كسلاح تنافسي ضد تسعير Manatal بالمقعد.

---

# الجزء التاسع — ما أحتاج قرارك فيه قبل كتابة أي سطر

| # | القرار | الخيارات | توصيتي |
|---|--------|----------|--------|
| **Q1** | اسم المنتج والنطاق | — | مطلوب قبل S6 (صفحة الهبوط) وقبل شراء النطاق ووايلد-كارد DNS |
| **Q2** | المسار الكامل (S1–S9) أم المختصر (§6.2) | كامل ~15 أسبوعًا · مختصر ~6 أسابيع ثم تحقق سوقي | **المختصر** — لا تبنِ فوترة قبل أول عميل يدفع |
| **Q3** | التسعير | الجدول أعلاه | يحتاج مصادقتك على الأرقام وعلى العملة (ر.س فقط أم +$) |
| **Q4** | بوابة الدفع | Moyasar · Tap · Stripe · تحويل بنكي يدويًا مبدئيًا | **يدوي في المختصر، ثم Moyasar** |
| **Q5** | X5 (رسالة تطوير للمرفوض) | تصادم محتمل مع §10.4 و FR-08 | أوصي بالبناء **بمراجعة بشرية إلزامية** ومنفصلة عن قالب الرفض — لكن القرار قرارك |
| **Q6** | الانتحال: هل يرى مدير المنصّة السير الذاتية؟ | نعم · لا · بموافقة المستأجر | **لا افتراضيًا** |
| **Q7** | العربية فقط أم ثنائية اللغة | D23 يقترح عربية فقط في v1 | **عربية فقط** — التميّز في التركيز |
| **Q8** | أي من X1–X11 في الموجة الأولى | — | **X2 (تقرير الشفافية) + X9 (السوق) + X7 (هجري)** — أعلى قيمة لأقل جهد |
| **Q9** | إعادة تسمية `/admin` إلى `/app` | churn في 18 ملفًا | **لا** — أبقِها `/admin` وأضف `/platform` (D18) |
| **Q10** | تحديث `CLAUDE.md` | دمج D11–D24 وتحديث §3/§4/§4.1/§10 | يتم فور اعتماد هذه الوثيقة، وقبل بدء S1 |

---

## المراجع

**سوق ATS والأسعار:**
[Manatal — ATS Pricing Plans](https://www.manatal.com/blog/applicant-tracking-system-pricing) · [TechnologyAdvice — Best AI Recruiting Software 2026](https://technologyadvice.com/blog/human-resources/ai-recruiting-software/) · [People Managing People — Best ATS 2026](https://peoplemanagingpeople.com/tools/best-applicant-tracking-systems/) · [SelectSoftwareReviews — 25 Best ATS](https://www.selectsoftwarereviews.com/buyer-guide/applicant-tracking-systems) · [HR Tech Institute — ATS comparison 2026](https://www.hr-tech-institute.com/ats-comparison-2026-the-criteria-that-matter-once-the-demo-is-over)

**شكاوى السوق والتحيّز:**
[Dev Journal — Why ATS Systems Reject Qualified Candidates](https://earezki.com/ai-news/2026-05-10-why-ats-systems-reject-qualified-candidates/) · [Untold — ATS: The AI That Broke Hiring](https://untoldmag.org/applicant-tracking-systems-the-ai-that-broke-hiring/) · [Curriculo — AI Hiring Bias in 2026](https://curriculo.me/ai-hiring-bias/) · [Zimyo — Common ATS Pitfalls](https://www.zimyo.us/blog/common-applicant-tracking-system-pitfalls)

**قانون الذكاء الاصطناعي الأوروبي:**
[HeyMilo — How the EU AI Act Changes Recruitment](https://www.heymilo.ai/blog/how-the-eu-ai-act-changes-recruitment-and-what-employers-need-to-know) · [Carv — EU AI Act and Recruitment](https://www.carv.com/blog/the-eu-ai-act-and-its-impact-on-recruitment) · [Jobful — Sourcing vs Screening 2026](https://jobful.io/resources/post/eu-ai-act-recruiters-sourcing-vs-screening) · [floats.ai — The Deadline That Just Moved](https://floats.ai/insights/eu-ai-act-recruitment-compliance-what-to-do)

**السوق السعودي والخليجي:**
[Bayzat — أفضل نظام توظيف في السعودية](https://www.bayzat.com/ar/ksa/blog/%D8%A3%D9%81%D8%B6%D9%84-%D9%86%D8%B8%D8%A7%D9%85-%D8%AA%D9%88%D8%B8%D9%8A%D9%81-%D8%B3%D8%B9%D9%88%D8%AF%D9%8A-ats/) · [Qureos — Top Hiring Platforms in Saudi Arabia](https://www.qureos.com/hiring-guide/top-job-platforms-in-saudi-arabia) · [Talentera — Best Collaborative Recruitment Software in KSA](https://www.talentera.com/en/blog/best-collaborative-recruitment-software/) · [Mercans — Qiwa Platform, Nitaqat & Saudization Guide](https://mercans.com/glossary/qiwa-platform/) · [LogioLegion — Saudi HR Software: Mudad, GOSI, Qiwa, Nitaqat](https://logiolegion.com/blogs/saudi-hr-software-mudad-gosi-qiwa-nitaqat-compliance-guide-2026)

**الدفع والفوترة:**
[Moyasar](https://moyasar.com/en/) · [LogioLegion — Tap vs HyperPay vs Moyasar 2026](https://logiolegion.com/blogs/tap-payments-vs-hyperpay-vs-moyasar-saudi-arabia-2026) · [ijjad — Saudi Payment Gateway Comparison 2026](https://www.ijjad.com/saudi-payment-gateway-comparison)

**البنية التقنية:**
[Makerkit — Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) · [Supabase Discussion #1148 — Custom claims for multi-tenancy](https://github.com/orgs/supabase/discussions/1148) · [DesignRevision — Supabase RLS Guide 2026](https://designrevision.com/blog/supabase-row-level-security)

**تصميم Notion:**
[Notion Colors — All Hex Codes](https://matthiasfrank.de/en/notion-colors/) · [Mobbin — Notion Brand Color Palette](https://mobbin.com/colors/brand/notion) · [VoltAgent — Notion DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md) · [DesignMD — Notion Design Tokens](https://designmd.cc/benchmarks/notion)
