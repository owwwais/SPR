# S1 — دليل النشر (التعدّد والعزل)

> **اقرأ هذا كاملاً قبل التنفيذ.** ترتيب الخطوات ليس اختيارياً: بين الهجرة
> `0006` والهجرة `0007` تُنقل ملفات السير الذاتية فعلياً، وتشغيلها بترتيب
> مختلف يترك صفوفاً تشير إلى مسارات غير موجودة.

## ما الذي يتغيّر

| قبل | بعد |
|-----|-----|
| جدول `settings` بصف واحد (`check id = 1`) | `organizations` — صف لكل عميل |
| `profiles.role` = دور عام في النظام | `memberships (org_id, user_id, role)` |
| `is_staff()` = «لديه صف في profiles» | `current_org_ids()` = المؤسسات التي يملك المستخدم عضوية فيها |
| `cvs/{application_id}.pdf` | `cvs/{org_id}/{application_id}.pdf` |
| المتصفح يُدخل في `applications` ويرفع للتخزين بدور `anon` | دالة `submit-application` بدور الخدمة |
| دوران: `admin` و `hr` | `owner` · `admin` · `hr` · `viewer` |

## قبل البدء

1. **نسخة احتياطية كاملة** لقاعدة البيانات ولحاوية `cvs`. الهجرة `0006`
   تحذف جدول `settings` وعمود `profiles.role`؛ لا تراجع عنها بلا نسخة.
2. نافذة صيانة قصيرة (دقائق). بين الخطوتين 2 و4 لن يستطيع الموظفون فتح
   السير الذاتية، ولن يستطيع المتقدمون التقديم.
3. تأكّد أن متغيّرات دوال Edge موجودة: `SUPABASE_URL`،
   `SUPABASE_SERVICE_ROLE_KEY`، `SUPABASE_ANON_KEY`، `GEMINI_API_KEY`،
   `RESEND_API_KEY`. الجديد اختياري: `TURNSTILE_SECRET_KEY` و`THROTTLE_SALT`.

## الخطوات

```bash
# 0) تحقّق محلياً أولاً — يبني قاعدة مؤقتة ويشغّل مجموعتي الاختبار
npm run test:db

# 1) أوقف استقبال الطلبات الجديدة (اختياري لكنه أنظف):
#    علّق الوظائف المنشورة أو أوقف الموقع مؤقتاً.

# 2) الهجرة الأولى — الجداول، org_id، إعادة كتابة RLS
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f srp/supabase/migrations/0006_multitenancy.sql

# 3) نقل ملفات السير الذاتية إلى مجلد كل مؤسسة
#    جرّب بلا تنفيذ أولاً:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run --allow-env --allow-net srp/supabase/scripts/migrate-cv-paths.ts --dry-run
#    ثم فعلياً:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run --allow-env --allow-net srp/supabase/scripts/migrate-cv-paths.ts

# 4) سياسات التخزين الجديدة + حدود الإغراق
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f srp/supabase/migrations/0007_storage_isolation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f srp/supabase/migrations/0008_submission_throttle.sql

# 5) انشر الدوال
supabase functions deploy submit-application
supabase functions deploy analyze-application
supabase functions deploy manage-users
supabase functions deploy send-email
supabase functions deploy housekeeping

# 6) انشر تطبيق Next.js

# 7) تحقّق بعد النشر (على قاعدة الإنتاج — كلا الملفين ينتهيان بـ rollback)
SKIP_HARNESS=1 psql "$DATABASE_URL" -f srp/supabase/tests/tenant_isolation.sql
```

الخطوة 3 آمنة لإعادة التشغيل: تنسخ ثم تتحقّق ثم تحذف الأصل، والصفوف
المنقولة مسبقاً تُتجاوز. لو انقطعت في المنتصف تبقى نسخ مكرّرة — لا ملفات
مفقودة — وتكفي إعادة تشغيلها.

## التحقّق اليدوي بعد النشر

- [ ] الدخول بحساب موظف يعرض اسم الشركة في الشريط الجانبي
- [ ] فتح سيرة ذاتية من صفحة المتقدّم يعمل (رابط موقّع 10 دقائق)
- [ ] التقديم على وظيفة منشورة من متصفّح خفي ينجح ويُرجع رمز تتبّع
- [ ] التقديم مرتين بنفس البريد يُرفض برسالة عربية واضحة
- [ ] صفحة `/track/{ref}` تعرض سجل الحالات
- [ ] `/admin/settings` تحفظ اسم الشركة ومدة الاحتفاظ
- [ ] إعادة التحليل من لوحة المتقدّم تعمل
- [ ] `tenant_isolation.sql` يمرّ بـ 53/53 على الإنتاج

## التراجع

لا يوجد `down migration`. التراجع = الاستعادة من النسخة الاحتياطية في
الخطوة 1. هذا مقصود: `0006` تحذف جدولاً وعموداً، وكتابة تراجع صحيح لها
أخطر من الاستعادة.

## ما لم يُنجَز في S1 (مقصود)

| البند | أين يصل |
|-------|---------|
| التسجيل الذاتي وإنشاء مؤسسة، الدعوات بالبريد، مبدّل المؤسسات | S2 |
| صفحة `/c/{slug}`، الهوية البصرية، وسوم التخزين المؤقت لكل مؤسسة | S3 |
| لوحة `/platform` وواجهة الانتحال (الجداول موجودة والـ RLS يحترمها) | S4 |
| فحص الحصة قبل نداء Gemini — الجداول والخطط | S5 |
| Turnstile مفعّلاً (الكود جاهز، ينتظر المفتاح فقط) | S9-mini |
