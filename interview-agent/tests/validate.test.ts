// The question filters (src/planner/validate.ts). Over-blocking a generated
// question is acceptable; failing to block one is not — so the positives are
// many, and the false positives listed are the everyday words that must
// still pass.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  contentProblem,
  dedupe,
  filterQuestions,
  isGenericQuestion,
  normalizeArabic,
  protectedCategories,
  touchesProtectedCategory,
  CORE_BANK_KINDS,
  GAP_PROBE_KINDS,
} from "../src/planner/validate.ts";
import { question } from "./helpers.ts";

describe("protected categories", () => {
  const blocked: [string, string][] = [
    // age
    ["كم عمرك؟", "age"],
    ["ما هو عمرك الحالي؟", "age"],
    ["ما تاريخ ميلادك؟", "age"],
    ["في أي سنة ولدت؟", "age"],
    ["من مواليد أي عام أنت؟", "age"],
    ["في أي عام تخرجت من الجامعة؟", "age"],
    ["ما سنك؟", "age"],
    ["How old are you?", "age"],
    ["What year were you born in?", "age"],
    ["What is your age?", "age"],
    // marital status and family
    ["هل أنت متزوج؟", "marital_family"],
    ["ما حالتك الاجتماعية؟", "marital_family"],
    ["هل لديك أطفال؟", "marital_family"],
    ["كم عدد أولادك؟", "marital_family"],
    ["هل تخططين للحمل قريباً؟", "marital_family"],
    ["هل أنتِ حامل؟", "marital_family"],
    ["هل تنوي الإنجاب؟", "marital_family"],
    ["Are you married?", "marital_family"],
    ["Do you have children?", "marital_family"],
    ["Are you pregnant or planning a family?", "marital_family"],
    // nationality, origin, tribe, ethnicity
    ["ما جنسيتك؟", "origin"],
    ["من أي بلد أنت؟", "origin"],
    ["إلى أي قبيلة تنتمي؟", "origin"],
    ["ما أصلك؟", "origin"],
    ["ما عرقك؟", "origin"],
    ["What is your nationality?", "origin"],
    ["Where are you from originally?", "origin"],
    ["What is your ethnic background?", "origin"],
    // religion and sect
    ["ما دينك؟", "religion"],
    ["ما مذهبك؟", "religion"],
    ["هل تصلي في وقت العمل؟", "religion"],
    ["إلى أي طائفة تنتمي؟", "religion"],
    ["What is your religion?", "religion"],
    ["Do you pray during work hours?", "religion"],
    // health and disability
    ["هل لديك إعاقة؟", "health"],
    ["هل تعاني من مرض مزمن؟", "health"],
    ["كيف حالتك الصحية؟", "health"],
    ["Do you have a disability?", "health"],
    ["Have you had any serious illness?", "health"],
    // gender
    ["ما جنسك؟", "gender"],
    ["هل أنت ذكر أم أنثى؟", "gender"],
    ["What is your gender?", "gender"],
    // politics
    ["هل أنت عضو في حزب؟", "politics"],
    ["ما توجهاتك السياسية؟", "politics"],
    ["What are your political views?", "politics"],
  ];

  for (const [text, category] of blocked) {
    test(`blocks «${text}» as ${category}`, () => {
      assert.ok(protectedCategories(text).includes(category), protectedCategories(text).join(","));
    });
  }

  test("normalisation: diacritics, letter forms, tatweel and invisible characters do not hide a term", () => {
    assert.equal(touchesProtectedCategory("كَمْ عُمْرُكَ؟"), true);
    assert.equal(touchesProtectedCategory("ما جنسـيـتك؟"), true);
    assert.equal(touchesProtectedCategory("هل لديك إعاقة"), true);
    assert.equal(touchesProtectedCategory("هل لديك اعاقه"), true);
    assert.equal(touchesProtectedCategory("ما جن​سيتك؟"), true);
    assert.equal(touchesProtectedCategory("هل أنت مـتـزوج؟"), true);
    assert.equal(touchesProtectedCategory("ARE YOU MARRIED?"), true);
  });

  test("clitics: conjunctions, prepositions, the article and pronoun suffixes are stripped", () => {
    assert.equal(touchesProtectedCategory("وجنسيتك؟"), true);
    assert.equal(touchesProtectedCategory("وبالحالة الاجتماعية"), true);
    assert.equal(touchesProtectedCategory("ولأطفالك"), true);
    assert.equal(touchesProtectedCategory("بدينك"), true);
    assert.equal(touchesProtectedCategory("للإعاقة"), true);
  });

  const allowed = [
    "في أي مدينة نفّذت مشروع React الأخير؟",
    "كيف تتعامل مع الديون التقنية في مشروع قائم؟",
    "عمل معك عمرو على المشروع نفسه، فكيف قسّمتما المهام؟",
    "هل الحل الذي اخترته صحيح من حيث التعقيد الزمني؟",
    "كيف تحقق التجانس بين المكوّنات في نظام التصميم؟",
    "صف بنية متجانسة لواجهات برمجية متعددة.",
    "كم سنة من الخبرة لديك في SQL؟",
    "اشرح دورة حياة المكوّن في React.",
    "كيف توزع الحمل بين الخوادم عند ارتفاع عدد الطلبات؟",
    "كيف تحدد عمر الجلسة في نظام يعتمد على JWT؟",
    "كيف تتحقق من صحة البيانات المدخلة في النموذج؟",
    "اشرح استخدام زوج المفاتيح العام والخاص في التوقيع.",
    "كيف تمر على العقد الأبناء في شجرة DOM؟",
    "اشرح race condition واجهتها في JavaScript وكيف أصلحتها.",
    "كيف تمرر props.children إلى مكوّن React؟",
    "ذكرتَ في خبرتك أنك عملت على React، فما الذي بنيته تحديداً؟",
    "ما المشروع الذي ذكرته عن تحسين أداء النظام؟",
    "اذكر مثالاً على استخدام TypeScript في مشروع كبير.",
    "كيف تتعامل مع المرضى في قسم الطوارئ عند ازدحامه؟",
    "صف حملة تسويقية رقمية قدتها وما نتائجها.",
    "ما الأدوات التي تستخدمها لإدارة الحالة في الواجهة؟",
    "Describe the agent you built and how you measured its usage.",
    "How do you manage page state in a large single-page application?",
    "Explain how you would design the dynamic pricing section.",
  ];

  for (const text of allowed) {
    test(`allows «${text}»`, () => {
      assert.deepEqual(protectedCategories(text), []);
    });
  }

  test("normalizeArabic folds letter variants", () => {
    assert.equal(normalizeArabic("إعاقة"), normalizeArabic("اعاقه"));
    assert.equal(normalizeArabic("مستشفى"), normalizeArabic("مستشفي"));
  });
});

describe("generic questions", () => {
  const generic = [
    "حدثنا عن نفسك.",
    "حدّثني عن نفسك باختصار.",
    "تحدث عن نفسك.",
    "عرّفنا بنفسك.",
    "قدّم نفسك.",
    "ما هي نقاط قوتك وضعفك؟",
    "ما أكبر نقاط ضعفك؟",
    "لماذا يجب أن نوظفك؟",
    "لماذا نختارك أنت دون غيرك؟",
    "ما الذي يميزك عن غيرك من المتقدمين؟",
    "أين ترى نفسك بعد خمس سنوات؟",
    "لماذا تريد العمل لدينا؟",
    "Tell me about yourself.",
    "Tell us a little about yourself.",
    "What are your strengths and weaknesses?",
    "What is your greatest weakness?",
    "Why should we hire you?",
    "Where do you see yourself in five years?",
    "Why do you want to work here?",
  ];
  for (const text of generic) {
    test(`flags «${text}»`, () => assert.equal(isGenericQuestion(text), true));
  }

  const specific = [
    "حدثنا عن مشروع React قمت ببنائه وما أصعب جزء فيه.",
    "اشرح كيف تعمل الـ hooks في React.",
    "ما نقاط القوة في استخدام TypeScript مقارنة بـ JavaScript؟",
    "Tell me about a time you fixed a production incident.",
    "What are the weaknesses of client-side rendering for SEO?",
  ];
  for (const text of specific) {
    test(`does not flag «${text}»`, () => assert.equal(isGenericQuestion(text), false));
  }
});

describe("duplicates", () => {
  test("drops later near-duplicates, keeps the first, keeps distinct questions", () => {
    const kept = dedupe([
      { text_ar: "اشرح الفرق بين let و const في JavaScript" },
      { text_ar: "اشرح الفرق بين let و const في JavaScript." },
      { text_ar: "واشرح الفرق بين let و const في JavaScript؟" },
      { text_ar: "ما الفرق بين REST و GraphQL؟" },
    ]);
    assert.deepEqual(
      kept.map((q) => q.text_ar),
      ["اشرح الفرق بين let و const في JavaScript", "ما الفرق بين REST و GraphQL؟"]
    );
  });

  test("questions that share a topic but differ in substance both stay", () => {
    const kept = dedupe([
      { text_ar: "كيف تختبر مكوّن React يعتمد على طلبات الشبكة؟" },
      { text_ar: "كيف تقيس أداء مكوّن React يعرض قائمة طويلة؟" },
    ]);
    assert.equal(kept.length, 2);
  });
});

describe("whole questions and kind rules", () => {
  test("a protected topic in the rubric or expected points is caught too", () => {
    const viaPoints = question("technical", 0, { expected_points: ["يذكر عمره وسنوات خبرته"] });
    assert.equal(contentProblem(viaPoints), "protected_category");
    const viaRubric = question("technical", 0, {
      rubric: {
        criteria: [
          { name: "الملاءمة", weight: 2, excellent: "غير متزوج ومتفرغ", acceptable: "مقبول", weak: "ضعيف" },
        ],
      },
    });
    assert.equal(contentProblem(viaRubric), "protected_category");
    assert.equal(contentProblem(question("behavioral", 0, { text_ar: "حدثنا عن نفسك وعن مسيرتك المهنية باختصار." })), "generic_question");
    assert.equal(contentProblem(question("technical", 0)), null);
  });

  test("filterQuestions drops invalid, wrong-kind, protected, generic and duplicate questions", () => {
    const raw = [
      question("technical", 0),
      question("technical", 0, { text_ar: `${question("technical", 0).text_ar} ` }),
      question("technical", 1, { text_ar: "هل أنت متزوج؟ وكيف تنظم وقتك بين العمل والمنزل؟" }),
      question("behavioral", 1, { text_ar: "حدثنا عن نفسك." }),
      { kind: "technical", text_ar: "قصير" },
      question("gap_probe", 0),
      { ...question("technical", 2), kind: "coding" },
      question("situational", 0),
    ];
    const { accepted, stats } = filterQuestions(raw, { allowedKinds: CORE_BANK_KINDS });
    assert.deepEqual(accepted.map((q) => q.kind), ["technical", "situational"]);
    assert.deepEqual(stats, {
      received: 8,
      invalid: 1,
      wrong_kind: 2,
      protected_category: 1,
      generic: 1,
      duplicate: 1,
      accepted: 2,
    });
  });

  test("gap-probe generation yields gap probes only, and never coding", () => {
    const { accepted } = filterQuestions(
      [question("gap_probe", 0), question("technical", 0), { ...question("gap_probe", 1), kind: "coding" }],
      { allowedKinds: GAP_PROBE_KINDS }
    );
    assert.deepEqual(accepted.map((q) => q.kind), ["gap_probe"]);
  });

  test("coding is refused even when a caller lists it", () => {
    const { accepted, stats } = filterQuestions([{ ...question("technical", 0), kind: "coding" }], {
      allowedKinds: ["coding"],
    });
    assert.equal(accepted.length, 0);
    assert.equal(stats.wrong_kind, 1);
  });

  test("a replacement must differ from the questions already in the bank", () => {
    const existing = [question("technical", 0).text_ar];
    const { accepted, stats } = filterQuestions([question("technical", 0)], {
      allowedKinds: ["technical"],
      existingTexts: existing,
    });
    assert.equal(accepted.length, 0);
    assert.equal(stats.duplicate, 1);
  });
});
