-- seed.sql — local/dev seed data (CLAUDE.md §9 M1: 3 jobs, 1 admin, 1 hr)
-- DEV ONLY: do not run against production.
--
-- Login credentials (local dev):
--   admin@example.com / Admin123!
--   hr@example.com    / Hr123456!

-- ============================================================
-- Auth users + profiles
-- ============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated',
    'admin@example.com',
    crypt('Admin123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'hr@example.com',
    crypt('Hr123456!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'sub', '11111111-1111-1111-1111-111111111111',
      'email', 'admin@example.com',
      'email_verified', true
    ),
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    jsonb_build_object(
      'sub', '22222222-2222-2222-2222-222222222222',
      'email', 'hr@example.com',
      'email_verified', true
    ),
    'email', now(), now(), now()
  );

insert into profiles (id, role, full_name)
values
  ('11111111-1111-1111-1111-111111111111', 'admin', 'أحمد المدير'),
  ('22222222-2222-2222-2222-222222222222', 'hr', 'سارة الموارد');

-- ============================================================
-- Company settings
-- ============================================================

update settings set company_name = 'شركة الأفق للتقنية' where id = 1;

-- ============================================================
-- Jobs: 2 published + 1 draft (exercises anon visibility rules)
-- ============================================================

insert into jobs (
  id, title, department, location, type, description, requirements,
  skills, min_years_experience, status, closes_at, created_by
)
values
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'مطوّر واجهات أمامية',
    'تقنية المعلومات',
    'الرياض',
    'full_time',
    E'## عن الوظيفة\nنبحث عن مطوّر واجهات أمامية للانضمام إلى فريق المنتجات الرقمية، للعمل على تطبيقات ويب حديثة تخدم آلاف المستخدمين.\n\n## المهام\n- تطوير واجهات تفاعلية باستخدام React و TypeScript\n- التعاون مع فريق التصميم لتحويل النماذج إلى صفحات فعلية\n- تحسين الأداء وتجربة المستخدم',
    E'## المتطلبات\n- خبرة عملية لا تقل عن 3 سنوات في تطوير الواجهات الأمامية\n- إتقان React و TypeScript و HTML/CSS\n- خبرة في التعامل مع REST APIs وإدارة الحالة\n- معرفة بأساسيات إمكانية الوصول (Accessibility) وتحسين الأداء\n- يفضَّل: خبرة في Next.js و Tailwind CSS',
    array['React', 'TypeScript', 'CSS', 'Next.js', 'REST APIs'],
    3,
    'published',
    (current_date + interval '45 days')::date,
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    'محاسب عام',
    'المالية',
    'جدة',
    'full_time',
    E'## عن الوظيفة\nمطلوب محاسب عام للانضمام إلى الإدارة المالية، مسؤول عن القيود اليومية والتقارير الشهرية والتسويات البنكية.\n\n## المهام\n- إعداد القيود المحاسبية والتسويات\n- إعداد التقارير المالية الشهرية\n- متابعة الذمم المدينة والدائنة',
    E'## المتطلبات\n- بكالوريوس محاسبة أو مالية\n- خبرة لا تقل عن سنتين في المحاسبة العامة\n- إتقان Excel وخبرة في أنظمة ERP (يفضَّل SAP أو Odoo)\n- معرفة بمعايير المحاسبة الدولية IFRS\n- يفضَّل: شهادة SOCPA أو ما يعادلها',
    array['Excel', 'ERP', 'IFRS', 'القيود المحاسبية', 'التسويات البنكية'],
    2,
    'published',
    (current_date + interval '30 days')::date,
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003',
    'أخصائي تسويق رقمي',
    'التسويق',
    'عن بُعد',
    'remote',
    E'## عن الوظيفة\nنبحث عن أخصائي تسويق رقمي لإدارة الحملات الإعلانية وقنوات التواصل الاجتماعي وتحليل أدائها.\n\n## المهام\n- تخطيط وتنفيذ الحملات الإعلانية المدفوعة\n- إدارة محتوى منصات التواصل الاجتماعي\n- تحليل البيانات وإعداد تقارير الأداء',
    E'## المتطلبات\n- خبرة لا تقل عن سنتين في التسويق الرقمي\n- إتقان إدارة حملات Google Ads و Meta Ads\n- خبرة في أدوات التحليل مثل Google Analytics\n- مهارات كتابة محتوى عربي إبداعي\n- يفضَّل: خبرة في تحسين محركات البحث SEO',
    array['Google Ads', 'Meta Ads', 'Google Analytics', 'SEO', 'كتابة المحتوى'],
    2,
    'draft',
    null,
    '22222222-2222-2222-2222-222222222222'
  );
