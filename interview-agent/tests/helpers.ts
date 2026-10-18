import { generateKeyPair } from "jose";
import { signRequest } from "../src/auth/hmac.ts";
import { exportPrivateJwk, loadSessionKeys, type SessionKeys } from "../src/auth/session-token.ts";
import { createApp } from "../src/app.ts";
import { createSql, jsonb, type Sql } from "../src/db/client.ts";
import { migrate } from "../src/db/migrate.ts";
import type {
  CandidateProfile,
  CreateInterviewRequest,
  CreateJobBankRequest,
  JobContext,
  QuestionContent,
  QuestionKind,
  TenantContext,
} from "../src/contract/index.ts";
import type { LlmClient } from "../src/llm/types.ts";
import { DEFAULT_CEILINGS, type Ceilings } from "../src/orchestrator/budget.ts";
import { computeBankHash, insertQuestions, type QuestionRow } from "../src/db/banks.ts";

export const PLATFORM_KEY_ID = "k1";
export const PLATFORM_SECRET = "platform-secret-for-tests-0123456789abcdef";
export const ALLOWED_ORIGIN = "https://hakeem.example";

export const TENANT_REF = "t_0123456789abcdef0123456789abcdef";
export const OTHER_TENANT_REF = "t_fedcba9876543210fedcba9876543210";

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const skipWithoutDb = hasDatabase ? false : "DATABASE_URL not set (run npm test)";

export async function newSessionKeys(): Promise<SessionKeys> {
  const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  return loadSessionKeys(JSON.stringify(await exportPrivateJwk(privateKey, "test-key")));
}

let shared: Sql | null = null;
export async function testDb(): Promise<Sql> {
  if (!shared) {
    shared = createSql(process.env.DATABASE_URL!, 6);
    await migrate(shared);
  }
  // TRUNCATE fires no row triggers, so locked banks are cleared as well.
  await shared`
    truncate interviews, audit_log, webhook_outbox, idempotency_keys, request_nonces,
             job_banks, bank_questions, llm_calls, tenant_usage, tenant_generation_log
    restart identity cascade`;
  return shared;
}
export async function closeDb() {
  await shared?.end();
  shared = null;
}

export type TestAppOptions = {
  now?: () => Date;
  llm?: LlmClient | null;
  ceilings?: Ceilings;
};

export async function testApp(options: TestAppOptions = {}) {
  const sql = await testDb();
  const sessionKeys = await newSessionKeys();
  const ceilings = options.ceilings ?? DEFAULT_CEILINGS;
  const app = createApp({
    sql,
    hmacKeys: new Map([[PLATFORM_KEY_ID, PLATFORM_SECRET]]),
    sessionKeys,
    allowedOrigins: [ALLOWED_ORIGIN],
    llm: options.llm ?? null,
    ceilings,
    now: options.now,
  });

  async function platform(
    method: string,
    path: string,
    body?: unknown,
    extra: { headers?: Record<string, string>; secret?: string; timestamp?: number; nonce?: string } = {}
  ) {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const signed = await signRequest({
      secret: extra.secret ?? PLATFORM_SECRET,
      keyId: PLATFORM_KEY_ID,
      method,
      path,
      body: raw,
      timestamp: extra.timestamp,
      nonce: extra.nonce,
    });
    return app.request(`http://agent.test${path}`, {
      method,
      headers: { "content-type": "application/json", ...signed, ...extra.headers },
      body: body === undefined ? undefined : raw,
    });
  }

  return { app, sql, sessionKeys, platform, ceilings };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export function tenant(
  allowance: number | null = 10,
  ref: string = TENANT_REF
): TenantContext {
  return { ref, monthly_interview_allowance: allowance };
}

export function jobContext(): JobContext {
  return {
    title: "مطوّر واجهات أمامية",
    type: "full_time",
    location: "الرياض",
    min_years_experience: 3,
    skills: ["React", "TypeScript"],
    requirements: "خبرة لا تقل عن ثلاث سنوات في React و TypeScript، واختبار الواجهات.",
    description: "تطوير واجهات المنتج.",
  };
}

export function candidateProfile(): CandidateProfile {
  return {
    total_years_experience: 4,
    experiences: [
      { title: "مطوّر واجهات", company: null, start: "2021-01", end: null, summary: "React" },
    ],
    education: [{ degree: "بكالوريوس", field: "علوم الحاسب", institution: null, year: "2020" }],
    skills: ["React", "TypeScript"],
    languages: ["العربية", "English"],
    cv_language: "ar",
  };
}

export function createBankRequest(
  overrides: Partial<CreateJobBankRequest> = {}
): CreateJobBankRequest {
  return {
    external_ref: "bank_0001_abcdef",
    tenant: tenant(),
    job: jobContext(),
    ...overrides,
  };
}

// A text interview with no gap probes: created straight into
// awaiting_review without any model call.
export function createRequest(
  jobBankId: string,
  overrides: Partial<CreateInterviewRequest> = {}
): CreateInterviewRequest {
  return {
    external_ref: "assignment_0001",
    candidate_ref: "c_6f1c2a9b8d7e",
    tenant: tenant(),
    job_bank_id: jobBankId,
    candidate_profile: candidateProfile(),
    config: {
      question_count: 7,
      mix: { technical: 4, behavioral: 2, gap_probe: 0, coding: 0, warmup: 1 },
      modes: ["text"],
      duration_minutes: 30,
      language: "ar",
      paste_policy: "record",
      candidate_result: "completion",
      accommodations: { extra_time_percent: 0 },
    },
    ...overrides,
  };
}

// Realistic, mutually distinct question texts per kind, each clear of every
// filter (protected categories, generic family, near-duplicates).
export const TEXTS: Record<Exclude<QuestionKind, "coding">, readonly string[]> = {
  warmup: [
    "ما آخر مشروع في تطوير الواجهات عملت عليه ووجدته ممتعاً؟",
    "ما الأداة التي أضفتها مؤخراً إلى طريقة عملك اليومية في البرمجة؟",
    "ما المكتبة مفتوحة المصدر التي تتابع تطورها باهتمام في مجال الواجهات؟",
  ],
  technical: [
    "اشرح الفرق بين useEffect و useLayoutEffect في React ومتى تستخدم كلاً منهما.",
    "كيف تمنع إعادة التصيير غير الضرورية لمكوّن React يعرض قائمة طويلة؟",
    "ما الفرق بين type و interface في TypeScript، ومتى تفضّل أحدهما؟",
    "كيف تصمم إدارة الحالة لتطبيق React كبير دون مكتبة خارجية؟",
    "اشرح كيف تعمل الـ Generics في TypeScript مع مثال من مشروع حقيقي.",
    "كيف تقيس أداء صفحة ويب وتحدد أسباب بطء التحميل الأولي؟",
    "ما استراتيجيتك لكتابة اختبارات وحدات لمكوّنات React تتعامل مع طلبات الشبكة؟",
    "كيف تتعامل مع الأخطاء القادمة من واجهة REST وتعرضها للمستخدم بشكل مفهوم؟",
    "اشرح مفهوم code splitting وكيف طبّقته لتقليل حجم الحزمة.",
    "كيف تضمن إمكانية الوصول (accessibility) في نموذج إدخال معقد؟",
    "ما الفرق بين التصيير من جهة الخادم والتصيير من جهة العميل، ومتى تختار كلاً منهما؟",
    "كيف تنظم أنواع TypeScript المشتركة بين الواجهة الأمامية والخادم؟",
    "اشرح كيف تتعامل مع التخزين المؤقت لبيانات الخادم في الواجهة.",
    "كيف تراجع طلب دمج (pull request) لزميل وتحدد المشكلات المهمة فيه؟",
  ],
  behavioral: [
    "صف موقفاً اختلفت فيه مع مصمم حول تنفيذ واجهة، وكيف وصلتما إلى حل.",
    "صف مرة اكتشفت فيها خللاً خطيراً قبل الإطلاق بوقت قصير، وماذا فعلت.",
    "صف تجربة اضطررت فيها لتعلم تقنية جديدة بسرعة لإنجاز مهمة.",
    "صف موقفاً تلقيت فيه ملاحظات قاسية على شيفرتك وكيف تعاملت معها.",
    "صف مرة قدت فيها تحسيناً تقنياً لم يطلبه أحد وكيف أقنعت الفريق به.",
    "صف موقفاً تأخر فيه مشروع عن موعده وما الدور الذي قمت به.",
    "صف تجربة عملت فيها مع فريق خلفي على واجهة برمجية غير مكتملة التوثيق.",
  ],
  situational: [
    "لو طُلب منك إطلاق ميزة خلال يومين وتبيّن أن الشيفرة الحالية هشة، كيف تتصرف؟",
    "إذا أبلغ العملاء عن بطء شديد في صفحة بعد إصدار جديد، ما خطواتك الأولى؟",
    "لو اقترح زميل مكتبة كبيرة لحل مشكلة بسيطة، كيف تناقش القرار؟",
    "إذا وجدت أن مكوّناً مشتركاً تستخدمه عدة فرق يحتوي على خلل في إمكانية الوصول، ماذا تفعل؟",
    "لو تعارضت متطلبات مدير المنتج مع معايير الأداء، كيف توازن بينهما؟",
  ],
  gap_probe: [
    "ذكرتَ أنك عملت بـ TypeScript؛ صف مشكلة في الأنواع واجهتها وكيف حللتها.",
    "ذكرتَ خبرتك في React دون تفاصيل عن الاختبارات؛ كيف كنت تختبر مكوّناتك؟",
    "ما أكبر تطبيق React شاركت فيه من حيث عدد الصفحات، وما دورك فيه تحديداً؟",
    "كيف تعاملت مع الأداء في آخر واجهة بنيتها، وما المؤشرات التي حسّنتها؟",
    "صف تجربتك في العمل مع واجهات REST، وما المشكلات التي واجهتها في دمجها؟",
    "صف الخطوات التي اتبعتها آخر مرة نشرت فيها تطبيقاً إلى بيئة الإنتاج.",
  ],
};

// A valid question of `kind`, numbered within its kind (texts cycle with a
// distinct suffix past the list's end).
export function question(
  kind: Exclude<QuestionKind, "coding">,
  index: number,
  overrides: Partial<QuestionContent> = {}
): QuestionContent {
  const texts = TEXTS[kind];
  const text = texts[index % texts.length]!;
  const scored = kind !== "warmup";
  return {
    kind,
    text_ar: text,
    competency: kind === "warmup" ? "الاهتمام بالمجال" : "React و TypeScript",
    difficulty: kind === "warmup" ? 1 : (((index % 3) + 1) as 1 | 2 | 3),
    expected_points: ["يذكر مثالاً عملياً محدداً", "يشرح سبب اختياره للحل"],
    rubric: {
      criteria: scored
        ? [
            {
              name: "الدقة التقنية",
              weight: 3,
              excellent: "شرح دقيق ومكتمل مع مثال عملي",
              acceptable: "شرح سليم مع نقص في التفاصيل",
              weak: "شرح غامض أو خاطئ",
            },
          ]
        : [],
    },
    time_limit_sec: kind === "warmup" ? 120 : 300,
    follow_up_policy: kind === "warmup" ? "none" : "on_vague",
    ...overrides,
  };
}

export function questions(
  counts: Partial<Record<Exclude<QuestionKind, "coding">, number>>
): QuestionContent[] {
  const out: QuestionContent[] = [];
  for (const [kind, count] of Object.entries(counts) as [Exclude<QuestionKind, "coding">, number][]) {
    for (let i = 0; i < count; i++) out.push(question(kind, i));
  }
  return out;
}

export const DEFAULT_LOCKED_COUNTS = { warmup: 2, technical: 8, behavioral: 4, situational: 2 };

// A job bank written straight to the database — awaiting review with every
// question approved, or locked with its hash — for tests that are about
// what happens after generation.
export async function seedBank(
  sql: Sql,
  options: {
    tenantRef?: string;
    externalRef?: string;
    counts?: Partial<Record<Exclude<QuestionKind, "coding">, number>>;
    lock?: boolean;
    status?: "pending" | "approved";
  } = {}
): Promise<{ id: string; bank_hash: string | null; questions: QuestionRow[] }> {
  const [bank] = await sql<{ id: string }[]>`
    insert into job_banks (external_ref, tenant_ref, version, status, job)
    values (
      ${options.externalRef ?? "bank_seed_000001"},
      ${options.tenantRef ?? TENANT_REF},
      1,
      'awaiting_review',
      ${sql.json(jsonb(jobContext()))}
    )
    returning id`;
  const id = bank!.id;
  await sql.begin((tx) =>
    insertQuestions(tx, { jobBankId: id }, questions(options.counts ?? DEFAULT_LOCKED_COUNTS))
  );
  if ((options.status ?? "approved") === "approved") {
    await sql`update bank_questions set status = 'approved' where job_bank_id = ${id}`;
  }
  const rows = await sql<QuestionRow[]>`
    select * from bank_questions where job_bank_id = ${id} order by position`;
  if (options.lock === false) return { id, bank_hash: null, questions: rows };
  const hash = computeBankHash(rows);
  await sql`
    update job_banks set status = 'locked', locked_at = now(), bank_hash = ${hash}
    where id = ${id}`;
  return { id, bank_hash: hash, questions: rows };
}

export function idem(key: string) {
  return { headers: { "idempotency-key": key } };
}
