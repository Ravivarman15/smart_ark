// ─────────────────────────────────────────────────────────────────────────────
// EXAM TRANSLATION SERVICE — Multi-language dynamic support for online exams
//
// Provides high-speed bilingual switching between English (default) and Tamil.
// Features full exam bulk batching, multi-provider network fallbacks,
// offline scientific rule dictionary, and comprehensive SI unit formatting.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicQuestion } from "./onlineTest.service";

export type ExamLanguage = "en" | "ta";

export interface TranslatedQuestion extends PublicQuestion {
  originalQuestionText?: string;
  originalOptions?: { id: string; text: string }[];
  isTranslated?: boolean;
}

// ── In-memory translation caches ─────────────────────────────────────────────
const textCache = new Map<string, string>();
const questionCache = new Map<string, TranslatedQuestion>();

/** Unit translations covering physics, chemistry, maths, mechanics, and SI units */
const UNIT_TRANSLATIONS: [RegExp, string][] = [
  // Acceleration
  [/^(\d+(?:\.\d+)?)\s*(?:m\/s\^?2|m\/s²|m\s*s\^-2)$/i, "$1 மீ/வி² (m/s²)"],
  // Velocity / Speed
  [/^(\d+(?:\.\d+)?)\s*(?:m\/s|m\s*s\^-1)$/i, "$1 மீ/வி (m/s)"],
  [/^(\d+(?:\.\d+)?)\s*(?:km\/h|km\/hr|kmph)$/i, "$1 கிமீ/மணி (km/h)"],
  [/^(\d+(?:\.\d+)?)\s*(?:cm\/s)$/i, "$1 செமீ/வி (cm/s)"],
  [/^(\d+(?:\.\d+)?)\s*(?:rad\/s)$/i, "$1 ரேடியன்/வி (rad/s)"],
  // Energy / Work
  [/^(\d+(?:\.\d+)?)\s*kJ$/i, "$1 கிலோஜூல் (kJ)"],
  [/^(\d+(?:\.\d+)?)\s*MJ$/i, "$1 மெகாஜூல் (MJ)"],
  [/^(\d+(?:\.\d+)?)\s*J$/i, "$1 ஜூல் (J)"],
  [/^(\d+(?:\.\d+)?)\s*cal$/i, "$1 கலோரி (cal)"],
  [/^(\d+(?:\.\d+)?)\s*eV$/i, "$1 எலக்ட்ரான் வோல்ட் (eV)"],
  // Force
  [/^(\d+(?:\.\d+)?)\s*kN$/i, "$1 கிலோநியூட்டன் (kN)"],
  [/^(\d+(?:\.\d+)?)\s*N$/i, "$1 நியூட்டன் (N)"],
  [/^(\d+(?:\.\d+)?)\s*dyne$/i, "$1 டைன் (dyne)"],
  // Mass
  [/^(\d+(?:\.\d+)?)\s*kg$/i, "$1 கிலோ (kg)"],
  [/^(\d+(?:\.\d+)?)\s*g$/i, "$1 கிராம் (g)"],
  [/^(\d+(?:\.\d+)?)\s*mg$/i, "$1 மிகி (mg)"],
  // Power
  [/^(\d+(?:\.\d+)?)\s*GW$/i, "$1 கிகாவாட் (GW)"],
  [/^(\d+(?:\.\d+)?)\s*MW$/i, "$1 மெகாவாட் (MW)"],
  [/^(\d+(?:\.\d+)?)\s*kW$/i, "$1 கிலோவாட் (kW)"],
  [/^(\d+(?:\.\d+)?)\s*W$/i, "$1 வாட் (W)"],
  [/^(\d+(?:\.\d+)?)\s*hp$/i, "$1 குதிரைத்திறன் (hp)"],
  // Pressure
  [/^(\d+(?:\.\d+)?)\s*kPa$/i, "$1 கிலோபாஸ்கல் (kPa)"],
  [/^(\d+(?:\.\d+)?)\s*MPa$/i, "$1 மெகாபாஸ்கல் (MPa)"],
  [/^(\d+(?:\.\d+)?)\s*Pa$/i, "$1 பாஸ்கல் (Pa)"],
  [/^(\d+(?:\.\d+)?)\s*bar$/i, "$1 பார் (bar)"],
  [/^(\d+(?:\.\d+)?)\s*atm$/i, "$1 வளிமண்டல அழுத்தம் (atm)"],
  // Frequency
  [/^(\d+(?:\.\d+)?)\s*GHz$/i, "$1 கிகாஹெர்ட்ஸ் (GHz)"],
  [/^(\d+(?:\.\d+)?)\s*MHz$/i, "$1 மெகாஹெர்ட்ஸ் (MHz)"],
  [/^(\d+(?:\.\d+)?)\s*kHz$/i, "$1 கிலோஹெர்ட்ஸ் (kHz)"],
  [/^(\d+(?:\.\d+)?)\s*Hz$/i, "$1 ஹெர்ட்ஸ் (Hz)"],
  // Electricity & Magnetism
  [/^(\d+(?:\.\d+)?)\s*kV$/i, "$1 கிலோவோல்ட் (kV)"],
  [/^(\d+(?:\.\d+)?)\s*mV$/i, "$1 மில்லிவோல்ட் (mV)"],
  [/^(\d+(?:\.\d+)?)\s*V$/i, "$1 வோல்ட் (V)"],
  [/^(\d+(?:\.\d+)?)\s*mA$/i, "$1 மில்லியாம்பியர் (mA)"],
  [/^(\d+(?:\.\d+)?)\s*μA|uA$/i, "$1 மைக்ரோஆம்பியர் (μA)"],
  [/^(\d+(?:\.\d+)?)\s*A$/i, "$1 ஆம்பியர் (A)"],
  [/^(\d+(?:\.\d+)?)\s*M[\u03a9Ω]$/i, "$1 மெகாஓம் (MΩ)"],
  [/^(\d+(?:\.\d+)?)\s*k[\u03a9Ω]$/i, "$1 கிலோஓம் (kΩ)"],
  [/^(\d+(?:\.\d+)?)\s*[\u03a9Ω]$/i, "$1 ஓம் (Ω)"],
  [/^(\d+(?:\.\d+)?)\s*ohm(?:s)?$/i, "$1 ஓம் (Ω)"],
  [/^(\d+(?:\.\d+)?)\s*μC|uC$/i, "$1 மைக்ரோகூலூம் (μC)"],
  [/^(\d+(?:\.\d+)?)\s*C$/i, "$1 கூலூம் (C)"],
  [/^(\d+(?:\.\d+)?)\s*μF|uF$/i, "$1 மைக்ரோஃபாரட் (μF)"],
  [/^(\d+(?:\.\d+)?)\s*pF$/i, "$1 பிகோஃபாரட் (pF)"],
  [/^(\d+(?:\.\d+)?)\s*F$/i, "$1 ஃபாரட் (F)"],
  [/^(\d+(?:\.\d+)?)\s*T$/i, "$1 டெஸ்லா (T)"],
  [/^(\d+(?:\.\d+)?)\s*H$/i, "$1 ஹென்றி (H)"],
  // Distance / Length
  [/^(\d+(?:\.\d+)?)\s*km$/i, "$1 கிலோமீட்டர் (km)"],
  [/^(\d+(?:\.\d+)?)\s*cm$/i, "$1 சென்டிமீட்டர் (cm)"],
  [/^(\d+(?:\.\d+)?)\s*mm$/i, "$1 மில்லிமீட்டர் (mm)"],
  [/^(\d+(?:\.\d+)?)\s*nm$/i, "$1 நானோமீட்டர் (nm)"],
  [/^(\d+(?:\.\d+)?)\s*m$/i, "$1 மீட்டர் (m)"],
  // Angles & Temperature
  [/^(\d+(?:\.\d+)?)\s*(?:°C|deg\s*C)$/i, "$1 °C"],
  [/^(\d+(?:\.\d+)?)\s*K$/i, "$1 K (கெல்வின்)"],
  [/^(\d+(?:\.\d+)?)\s*(?:°|deg|degrees)$/i, "$1 பாகை (°)"],
  [/^(\d+(?:\.\d+)?)\s*(?:rad|radians)$/i, "$1 ரேடியன்"],
];

/** Offline rule dictionary for standard secondary and higher secondary question templates */
const OFFLINE_PATTERNS: [RegExp, string][] = [
  [
    /A particle is moving in a circular path of radius ([\d.]+\s*m) with a constant speed of ([\d.]+\s*m\/s)\.\s*What is its centripetal acceleration\??/i,
    "$1 ஆரம் கொண்ட வட்டப் பாதையில் ஒரு துகள் $2 மாறா வேகத்தில் இயங்குகிறது. அதன் மையநோக்கு முடுக்கம் என்ன?",
  ],
  [
    /A body of mass ([\d.]+\s*kg) is moving with a velocity of ([\d.]+\s*m\/s)\.\s*What is its kinetic energy\??/i,
    "$1 நிறை கொண்ட ஒரு பொருள் $2 திசைவேகத்தில் இயங்குகிறது. அதன் இயக்க ஆற்றல் என்ன?",
  ],
  [
    /A resistance of ([\d.]+\s*[\u03a9Ω]|[\d.]+\s*ohm)\s*is connected to a potential difference of ([\d.]+\s*V)\.\s*The current flowing through the resistance is:?/i,
    "$1 மின்தடையானது $2 மின்னழுத்த வேறுபாட்டுடன் இணைக்கப்பட்டுள்ளது. மின்தடையின் வழியே பாயும் மின்னோட்டம் எவ்வளவு:",
  ],
  [/What is the value of/i, "மதிப்பு என்ன:"],
  [/Which of the following is/i, "பின்வருவனவற்றில் எது"],
  [/Calculate the/i, "கணக்கிடுக:"],
  [/Find the value of/i, "மதிப்பைக் காண்க:"],
  [/True or False/i, "சரியா அல்லது தவறா"],
  [/Match the following/i, "பொருத்துக"],
];

/** UI String Dictionary for Exam Runner interface */
export const EXAM_I18N = {
  en: {
    answered: "answered",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    palette: "Questions",
    submit: "Submit",
    previous: "Previous",
    next: "Next",
    question: "Question",
    review: "Review",
    markedForReview: "Marked for review",
    containsFormulae: "Contains formulae",
    yourNumericAnswer: "Your numeric answer",
    enterValue: "Enter a value",
    fillInTheBlank: "Fill in the blank",
    yourAnswer: "Your answer",
    typeYourAnswer: "Type your answer",
    spellingNote: "Spelling and capitalisation are not marked strictly.",
    selectPrompt: "— select —",
    teacherGradedNote:
      "This answer is marked by your teacher — it is not scored automatically.",
    multipleChoiceHint:
      "Multiple answers may be correct — select all that apply.",
    noOptionsWarning:
      "This question has no answer options configured. Tell your invigilator — you will not be penalised for it.",
    keysHelp: "Keys: 1-9 answer · ←/→ navigate · R review",
    submitTitle: "Submit your exam?",
    submitDesc:
      "You cannot change your answers after submitting. Check your unanswered and review-flagged questions before confirming.",
    unansweredWarning: "questions are still unanswered.",
    allAnswered: "All questions have been answered!",
    reviewWarning: "questions are marked for review.",
    confirmSubmit: "Confirm submit",
    cancel: "Cancel",
    translating: "Translating to Tamil…",
    tamilBadge: "தமிழ்",
    englishBadge: "English",
    showOriginal: "Show English",
    showTamil: "Show Tamil",
  },
  ta: {
    answered: "பதிலளிக்கப்பட்டது",
    fullscreen: "முழுத்திரை",
    exitFullscreen: "முழுத்திரையிலிருந்து வெளியேறு",
    palette: "கேள்விகள்",
    submit: "சமர்ப்பி",
    previous: "முந்தையது",
    next: "அடுத்தது",
    question: "கேள்வி",
    review: "மறுபரிசீலனை",
    markedForReview: "மறுபரிசீலனைக்கு குறிக்கப்பட்டது",
    containsFormulae: "சூத்திரங்கள் உள்ளன",
    yourNumericAnswer: "உங்கள் எண் விடை",
    enterValue: "மதிப்பை உள்ளிடவும்",
    fillInTheBlank: "கோடிட்ட இடத்தை நிரப்பவும்",
    yourAnswer: "உங்கள் பதில்",
    typeYourAnswer: "உங்கள் பதிலை தட்டச்சு செய்யவும்",
    spellingNote: "எழுத்துப் பிழைகள் கண்டிப்பாகக் கணக்கிடப்படாது.",
    selectPrompt: "— தேர்வு செய்க —",
    teacherGradedNote:
      "இந்த விடை ஆசிரியரால் மதிப்பிடப்படும் — தானாக மதிப்பிடப்படாது.",
    multipleChoiceHint:
      "ஒன்றுக்கு மேற்பட்ட விடைகள் சரியாக இருக்கலாம் — பொருந்தும் அனைத்தையும் தேர்வு செய்யவும்.",
    noOptionsWarning:
      "இந்த கேள்விக்கு விடைகள் அமைக்கப்படவில்லை. தேர்வு கண்காணிப்பாளரிடம் தெரிவிக்கவும்.",
    keysHelp: "விசைப்பலகை: 1-9 விடை · ←/→ நகர்த்து · R மறுபரிசீலனை",
    submitTitle: "உங்கள் தேர்வை சமர்ப்பிக்கவா?",
    submitDesc:
      "சமர்ப்பித்த பிறகு உங்கள் விடைகளை மாற்ற முடியாது. பதிலளிக்காத மற்றும் மறுபரிசீலனை கேள்விகளை சரிபார்க்கவும்.",
    unansweredWarning: "கேள்விகளுக்கு இன்னும் பதிலளிக்கப்படவில்லை.",
    allAnswered: "அனைத்து கேள்விகளுக்கும் பதிலளிக்கப்பட்டது!",
    reviewWarning: "கேள்விகள் மறுபரிசீலனைக்கு குறிக்கப்பட்டுள்ளன.",
    confirmSubmit: "சமர்ப்பிப்பதை உறுதிசெய்",
    cancel: "ரத்து செய்",
    translating: "தமிழில் மொழிபெயர்க்கிறது…",
    tamilBadge: "தமிழ்",
    englishBadge: "ஆங்கிலம்",
    showOriginal: "ஆங்கிலத்தில் பார்க்க",
    showTamil: "தமிழில் பார்க்க",
  },
} as const;

export type I18nKey = keyof typeof EXAM_I18N.en;

/** Get a localized UI string */
export const t = (key: I18nKey, lang: ExamLanguage = "en"): string => {
  return EXAM_I18N[lang]?.[key] ?? EXAM_I18N.en[key] ?? key;
};

/** Formats an option text (localizes scientific units if matched) */
export function formatUnitOption(text: string): string {
  const trimmed = text.trim();
  for (const [pattern, replacement] of UNIT_TRANSLATIONS) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }
  return text;
}

/** Translate a single text string */
export async function translateTextToTamil(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // Check unit patterns
  const formatted = formatUnitOption(trimmed);
  if (formatted !== trimmed) return formatted;

  // Pure numbers or mathematical symbols
  if (/^[\d\s+\-*/=().,;:!?%$#@&^√]+$/.test(trimmed)) return text;

  const cacheKey = `ta:${trimmed}`;
  if (textCache.has(cacheKey)) {
    return textCache.get(cacheKey)!;
  }

  // Offline rule check
  for (const [pattern, replacement] of OFFLINE_PATTERNS) {
    if (pattern.test(trimmed)) {
      const out = trimmed.replace(pattern, replacement);
      textCache.set(cacheKey, out);
      return out;
    }
  }

  // Provider 1: Google Clients Chrome endpoint
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ta&q=${encodeURIComponent(
      trimmed,
    )}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const translated = Array.isArray(data) ? data[0] : typeof data === "string" ? data : null;
      if (translated && typeof translated === "string" && translated.trim()) {
        const clean = translated.trim();
        textCache.set(cacheKey, clean);
        return clean;
      }
    }
  } catch {
    // Continue
  }

  // Provider 2: MyMemory API
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      trimmed,
    )}&langpair=en|ta`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === "string" && translated.trim() && !translated.startsWith("MYMEMORY WARNING")) {
        const clean = translated.trim();
        textCache.set(cacheKey, clean);
        return clean;
      }
    }
  } catch {
    // Continue
  }

  return text;
}

/** Batch translate an array of texts in 1 single HTTP request with high accuracy */
export async function translateBatchToTamil(items: string[]): Promise<string[]> {
  if (items.length === 0) return [];
  const DELIM = " ___ ";
  const joined = items.join(DELIM);

  // 1. Try Google Chrome Clients API
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ta&q=${encodeURIComponent(
      joined,
    )}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const raw = Array.isArray(data) ? data[0] : typeof data === "string" ? data : null;
      if (raw && typeof raw === "string") {
        const parts = raw.split(/\s*___\s*/);
        if (parts.length === items.length) {
          return parts.map((p) => p.trim());
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // 2. Try MyMemory API
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      joined,
    )}&langpair=en|ta`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const raw = data?.responseData?.translatedText;
      if (raw && typeof raw === "string" && !raw.startsWith("MYMEMORY WARNING")) {
        const parts = raw.split(/\s*___\s*/);
        if (parts.length === items.length) {
          return parts.map((p) => p.trim());
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // 3. Fallback: individual translation per item
  return Promise.all(items.map((it) => translateTextToTamil(it)));
}

/** Translate a full PublicQuestion object to Tamil */
export async function translateQuestion(
  q: PublicQuestion,
  lang: ExamLanguage,
): Promise<TranslatedQuestion> {
  if (lang === "en") {
    return { ...q, isTranslated: false };
  }

  const cacheKey = `q:${q.id}`;
  if (questionCache.has(cacheKey)) {
    return questionCache.get(cacheKey)!;
  }

  try {
    const itemsToTranslate: string[] = [q.questionText];
    const optionIndices: number[] = [];
    const promptIndices: number[] = [];
    const choiceIndices: number[] = [];

    q.options.forEach((o) => {
      optionIndices.push(itemsToTranslate.length);
      itemsToTranslate.push(o.text);
    });

    (q.matchPrompts ?? []).forEach((p) => {
      promptIndices.push(itemsToTranslate.length);
      itemsToTranslate.push(p);
    });

    (q.matchChoices ?? []).forEach((c) => {
      choiceIndices.push(itemsToTranslate.length);
      itemsToTranslate.push(c);
    });

    // Translate all components of the question in 1 batch request
    const translatedItems = await translateBatchToTamil(itemsToTranslate);

    const translatedQuestionText = translatedItems[0] || q.questionText;

    const translatedOptions = q.options.map((o, idx) => {
      const translatedText = translatedItems[optionIndices[idx]];
      return {
        ...o,
        text: formatUnitOption(translatedText || o.text),
      };
    });

    const translatedPrompts = (q.matchPrompts ?? []).map((p, idx) => {
      return translatedItems[promptIndices[idx]] || p;
    });

    const translatedChoices = (q.matchChoices ?? []).map((c, idx) => {
      return translatedItems[choiceIndices[idx]] || c;
    });

    const result: TranslatedQuestion = {
      ...q,
      questionText: translatedQuestionText,
      options: translatedOptions,
      matchPrompts: translatedPrompts.length > 0 ? translatedPrompts : q.matchPrompts,
      matchChoices: translatedChoices.length > 0 ? translatedChoices : q.matchChoices,
      originalQuestionText: q.questionText,
      originalOptions: q.options.map((o) => ({ id: o.id, text: o.text })),
      isTranslated: true,
    };

    questionCache.set(cacheKey, result);
    return result;
  } catch {
    return { ...q, isTranslated: false };
  }
}

/** Preload and translate all questions for an entire exam in bulk */
export async function preloadAllExamQuestions(
  questions: PublicQuestion[],
  lang: ExamLanguage = "ta",
): Promise<void> {
  if (lang === "en" || questions.length === 0) return;

  const unCached = questions.filter((q) => !questionCache.has(`q:${q.id}`));
  if (unCached.length === 0) return;

  // Process in batches of 5 questions to ensure payload size is optimal
  const BATCH_SIZE = 5;
  for (let i = 0; i < unCached.length; i += BATCH_SIZE) {
    const chunk = unCached.slice(i, i + BATCH_SIZE);
    const allStrings: string[] = [];
    const questionMappings: {
      question: PublicQuestion;
      stemIdx: number;
      optionIndices: number[];
      promptIndices: number[];
      choiceIndices: number[];
    }[] = [];

    for (const q of chunk) {
      const stemIdx = allStrings.length;
      allStrings.push(q.questionText);

      const optionIndices: number[] = [];
      q.options.forEach((o) => {
        optionIndices.push(allStrings.length);
        allStrings.push(o.text);
      });

      const promptIndices: number[] = [];
      (q.matchPrompts ?? []).forEach((p) => {
        promptIndices.push(allStrings.length);
        allStrings.push(p);
      });

      const choiceIndices: number[] = [];
      (q.matchChoices ?? []).forEach((c) => {
        choiceIndices.push(allStrings.length);
        allStrings.push(c);
      });

      questionMappings.push({
        question: q,
        stemIdx,
        optionIndices,
        promptIndices,
        choiceIndices,
      });
    }

    try {
      const translatedChunk = await translateBatchToTamil(allStrings);
      for (const map of questionMappings) {
        const q = map.question;
        const stemText = translatedChunk[map.stemIdx] || q.questionText;
        const options = q.options.map((o, idx) => ({
          ...o,
          text: formatUnitOption(translatedChunk[map.optionIndices[idx]] || o.text),
        }));
        const matchPrompts = (q.matchPrompts ?? []).map(
          (p, idx) => translatedChunk[map.promptIndices[idx]] || p,
        );
        const matchChoices = (q.matchChoices ?? []).map(
          (c, idx) => translatedChunk[map.choiceIndices[idx]] || c,
        );

        const translated: TranslatedQuestion = {
          ...q,
          questionText: stemText,
          options,
          matchPrompts: matchPrompts.length > 0 ? matchPrompts : q.matchPrompts,
          matchChoices: matchChoices.length > 0 ? matchChoices : q.matchChoices,
          originalQuestionText: q.questionText,
          originalOptions: q.options.map((o) => ({ id: o.id, text: o.text })),
          isTranslated: true,
        };
        questionCache.set(`q:${q.id}`, translated);
      }
    } catch {
      // Individual questions will translate on-demand if bulk chunk failed
    }
  }
}

/** Check if a question is already translated in cache */
export function getCachedQuestion(questionId: string): TranslatedQuestion | undefined {
  return questionCache.get(`q:${questionId}`);
}
