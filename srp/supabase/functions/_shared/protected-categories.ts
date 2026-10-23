// Protected-category filter for the services hub (D34): drops generated
// requirements, criteria and questions that touch a candidate's age, family,
// origin, religion, health, gender, politics or address (§7.1 rule 4, D24).
//
// COPIED from interview-agent/src/planner/validate.ts (normalisation, tokens
// and protected categories, unchanged). The agent is a separate service with
// its own package, so it is copied rather than imported — keep the two in
// step when either changes. Token-based on purpose: «مدينة», «الديون» and
// "agency" pass; «كم عمرك» and «الحالة الاجتماعية» do not.

// ---------------------------------------------------------------------------
// Normalisation and tokens
// ---------------------------------------------------------------------------

// Zero-width and bidi controls: removed first so they cannot split a word
// into harmless-looking pieces.
const INVISIBLE = /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
// Harakat, Quranic marks, superscript alef and tatweel.
const DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g;
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/g;

// Folds letter variants but keeps «ى» and «ة» distinct for now: a final «ى»
// or «ة» is part of the word, not a pronoun suffix, and that distinction is
// what keeps «المرضى» (patients) and «حملة» (campaign) from being read as
// «مرض» and «حمل». They are folded later, after suffixes are stripped.
function foldLetters(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(INVISIBLE, "")
    .replace(DIACRITICS, "")
    .replace(ARABIC_INDIC_DIGITS, (d) => String((d.charCodeAt(0) & 0x0f) % 10))
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/[یې]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ہ/g, "ه");
}

function foldFinal(word: string): string {
  return word.replace(/ى/g, "ي").replace(/ة/g, "ه");
}

// Full normalisation, as used for comparing words and phrases.
export function normalizeArabic(text: string): string {
  return foldFinal(foldLetters(text));
}

function rawTokens(text: string): string[] {
  return foldLetters(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

export function tokenize(text: string): string[] {
  return rawTokens(text).map(foldFinal);
}

// Proclitics, longest first: conjunctions, prepositions and the article.
const PREFIXES = [
  "وبال", "وكال", "ولل", "وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل", "ك",
];
// Pronoun suffixes (attached object/possessive pronouns).
const SUFFIXES = ["هما", "كما", "هم", "هن", "كم", "كن", "ها", "نا", "ه", "ك", "ي"];

// Every reading of one token worth matching: as written, without up to two
// stacked proclitics (ولأطفالك → لأطفالك → أطفالك), without a pronoun
// suffix, and with a «ة» restored where a suffix had turned it into «ت»
// (جنسيتك → جنسية). Suffix stripping never leaves fewer than three letters,
// so «سنة» (year) and «صحيح» never shrink into «سن» or «صح».
function readings(token: string): Set<string> {
  const bases = new Set<string>([token]);
  let frontier = [token];
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const form of frontier) {
      for (const prefix of PREFIXES) {
        if (form.startsWith(prefix) && form.length - prefix.length >= 2) {
          const stripped = form.slice(prefix.length);
          if (!bases.has(stripped)) {
            bases.add(stripped);
            next.push(stripped);
          }
        }
      }
    }
    frontier = next;
  }
  const out = new Set<string>(bases);
  for (const base of bases) {
    for (const suffix of SUFFIXES) {
      if (base.endsWith(suffix) && base.length - suffix.length >= 3) {
        const stem = base.slice(0, -suffix.length);
        out.add(stem);
        if (stem.endsWith("ت")) out.add(`${stem.slice(0, -1)}ة`);
      }
    }
  }
  return new Set([...out].map(foldFinal));
}

// ---------------------------------------------------------------------------
// Protected categories
// ---------------------------------------------------------------------------

type CategoryTerms = {
  // Whole words, matched against every reading of a token.
  words: readonly string[];
  // Word sequences, each word matched against the readings of consecutive tokens.
  phrases?: readonly string[];
  // Latin-script stems matched as a token prefix ("pregnan" → pregnancy).
  prefixes?: readonly string[];
};

const CATEGORIES: Readonly<Record<string, CategoryTerms>> = {
  age: {
    words: [
      "عمر", "اعمار", "سن", "سنك", "سنكم", "مواليد", "ميلاد", "مولود",
      "ولادة", "age", "aged", "ages", "birthday", "birthdate", "birthyear", "birthplace",
    ],
    // Graduation year is the classic indirect route to age.
    phrases: [
      "كم عمرك", "تاريخ ميلاد", "سنة ميلاد", "عام ميلاد", "متى ولدت", "اين ولدت",
      "سنة ولدت", "عام ولدت", "سنة تخرجت", "عام تخرجت",
      "سنة تخرج", "عام تخرج", "متى تخرجت", "how old", "born in", "were you born",
      "date of birth", "year of birth", "graduation year", "year did you graduate",
    ],
  },
  marital_family: {
    words: [
      "متزوج", "متزوجة", "متزوجون", "متزوجين", "زواج", "زوجة", "زوج", "زوجات",
      "مطلق", "مطلقة", "طلاق", "ارمل", "ارملة", "عازب", "عزباء", "خطوبة",
      "اطفال", "اولاد", "ابناء", "بنات", "حمل", "حامل", "انجاب", "امومة", "ابوة",
      "married", "marital", "spouse", "husband", "wife", "wives", "divorced",
      "widowed", "fiance", "fiancee", "children", "kids", "maternity", "paternity",
    ],
    phrases: [
      "حالة اجتماعية", "الحالة الاجتماعية", "family plans", "family planning",
      "plan to have", "start a family",
    ],
    prefixes: ["pregnan", "marri"],
  },
  origin: {
    words: [
      "جنسية", "جنسيات", "اصل", "اصولك", "قبيلة", "قبيلي", "قبائل", "عرق", "عرقي",
      "عرقية", "اعراق", "عنصري", "عنصرية", "بلدك", "وطنك", "عشيرة", "تجنيس", "وافد",
      "citizenship", "race", "races", "racial", "tribe", "tribal", "ancestry",
    ],
    phrases: [
      "من اي بلد", "من اي دولة", "من اين انت", "انت سعودي", "انت مواطن", "انت مقيم",
      "where are you from", "country of origin", "are you saudi", "are you a citizen",
    ],
    prefixes: ["nationalit", "ethnic"],
  },
  religion: {
    words: [
      "دين", "ديانة", "ديانات", "ديني", "دينية", "مذهب", "مذاهب", "مذهبي", "طائفة",
      "طائفي", "طائفية", "طوائف", "صلاة", "صلوات", "تصلي", "يصلي", "مسلم", "مسلمة",
      "مسيحي", "مسيحية", "يهودي", "شيعي", "سني", "ملحد", "عقيدة", "صيام", "تصوم",
      "حجاب", "sect", "sectarian", "worship", "church", "mosque", "faith", "muslim",
      "christian", "jewish", "hijab",
    ],
    prefixes: ["religio", "pray"],
  },
  health: {
    words: [
      "اعاقة", "اعاقات", "معاق", "معاقين", "مرض", "امراض", "صحة", "صحي", "صحية",
      "illness", "disabled", "sick",
    ],
    phrases: [
      "حالتك الصحية", "تعاني من", "health condition", "medical condition",
      "your health", "medical history",
    ],
    prefixes: ["disabilit"],
  },
  gender: {
    words: ["جنس", "ذكر", "انثى", "انوثة", "ذكورة", "gender", "sex", "female", "male"],
  },
  politics: {
    words: ["سياسي", "سياسية", "حزب", "احزاب", "حزبي", "political", "politics"],
  },
  address: {
    words: ["عنوانك", "سكنك", "تسكن", "حيك"],
    phrases: ["مكان سكن", "مكان اقامة", "where do you live", "your address", "home address"],
  },
};

// Phrases in which a flagged word has an everyday technical meaning. A match
// is ignored only when the flagged token sits inside one of these.
const EXEMPT_PHRASES = [
  "race condition",
  "race conditions",
  "موازنة الحمل",
  "توزيع الحمل",
  "حمل العمل",
  "حمل الخادم",
  "حمل الخوادم",
  "حمل النظام",
  "توزع الحمل",
  "يوزع الحمل",
  "موازن الحمل",
  "الحمل على الخادم",
  "الحمل على الخوادم",
  "الحمل على النظام",
  "الحمل على قاعدة البيانات",
  // «عمر» as a lifetime, not a person's age.
  "عمر الجلسة",
  "عمر الرمز",
  "عمر التوكن",
  "عمر الكاش",
  "عمر التخزين المؤقت",
  "العمر الافتراضي",
  "عمر البطارية",
  // «زوج» as a key pair, «أبناء» as child nodes.
  "زوج المفاتيح",
  "زوج مفاتيح",
  "العقد الأبناء",
  "العناصر الأبناء",
  "props children",
  "children prop",
  "children props",
  // «صحة» as validity, not health: input validation is a staple of
  // technical questions.
  "التحقق من صحة",
  "تتحقق من صحة",
  "صحة البيانات",
  "صحة المدخلات",
  "صحة الكود",
  "صحة النتائج",
  "صحة الحل",
];

function phraseWords(phrase: string): string[] {
  return tokenize(phrase).map((word) => {
    // Phrase words are compared with readings, which have proclitics
    // stripped; strip a leading article from the phrase word the same way.
    return word.startsWith("ال") && word.length > 3 ? word.slice(2) : word;
  });
}

type CompiledCategory = {
  name: string;
  words: Set<string>;
  phrases: string[][];
  prefixes: string[];
};

const COMPILED: CompiledCategory[] = Object.entries(CATEGORIES).map(([name, terms]) => ({
  name,
  words: new Set(terms.words.map(normalizeArabic)),
  phrases: (terms.phrases ?? []).map(phraseWords),
  prefixes: [...(terms.prefixes ?? [])],
}));

const EXEMPT: string[][] = EXEMPT_PHRASES.map(phraseWords);

// Positions [start, end) where `phrase` matches the token readings.
function phraseHits(tokenReadings: Set<string>[], phrase: string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i + phrase.length <= tokenReadings.length; i++) {
    if (phrase.every((word, k) => tokenReadings[i + k]!.has(word))) starts.push(i);
  }
  return starts;
}

// The categories a text touches. Exposed for tests and for counting what
// was filtered (category names only, never the text).
export function protectedCategories(text: string): string[] {
  // Readings are taken before «ى»/«ة» are folded (see foldLetters).
  const raw = rawTokens(text);
  const tokens = raw.map(foldFinal);
  const tokenReadings = raw.map((token) => readings(token));
  const exempt = new Set<number>();
  for (const phrase of EXEMPT) {
    for (const start of phraseHits(tokenReadings, phrase)) {
      for (let k = 0; k < phrase.length; k++) exempt.add(start + k);
    }
  }

  const hit = new Set<string>();
  for (const category of COMPILED) {
    for (let i = 0; i < tokens.length; i++) {
      if (exempt.has(i)) continue;
      const forms = tokenReadings[i]!;
      if ([...forms].some((form) => category.words.has(form))) hit.add(category.name);
      else if (category.prefixes.some((stem) => tokens[i]!.startsWith(stem))) hit.add(category.name);
    }
    for (const phrase of category.phrases) {
      const starts = phraseHits(tokenReadings, phrase);
      if (starts.some((start) => !phrase.every((_, k) => exempt.has(start + k)))) {
        hit.add(category.name);
      }
    }
  }
  return [...hit].sort();
}

export function touchesProtectedCategory(text: string): boolean {
  return protectedCategories(text).length > 0;
}
