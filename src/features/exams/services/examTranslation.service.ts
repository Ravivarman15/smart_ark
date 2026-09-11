// ─────────────────────────────────────────────────────────────────────────────
// EXAM TRANSLATION SERVICE — Multi-language dynamic support for online exams
//
// Provides high-speed bilingual switching between English (default) and Tamil.
// Uses single-call batch translation + Google/MyMemory engines with local
// caching, offline scientific dictionary fallback, and unit localization.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicQuestion } from "./onlineTest.service";

export type ExamLanguage = "en" | "ta";

export interface TranslatedQuestion extends PublicQuestion {
  originalQuestionText?: string;
  originalOptions?: { id: string; text: string }[];
  isTranslated?: boolean;
}

// ── In-memory translation caches (preserves translated questions across navigations) ──
const textCache = new Map<string, string>();
const questionCache = new Map<string, TranslatedQuestion>();

/** Unit translations for physics / maths / chemistry */
const UNIT_TRANSLATIONS: [RegExp, string][] = [
  [/^(\d+(?:\.\d+)?)\s*J$/i, "$1 ஜூல் (J)"],
  [/^(\d+(?:\.\d+)?)\s*m\/s$/i, "$1 மீ/வி (m/s)"],
  [/^(\d+(?:\.\d+)?)\s*km\/h$/i, "$1 கிமீ/மணி (km/h)"],
  [/^(\d+(?:\.\d+)?)\s*N$/i, "$1 நியூட்டன் (N)"],
  [/^(\d+(?:\.\d+)?)\s*kg$/i, "$1 கிலோ (kg)"],
  [/^(\d+(?:\.\d+)?)\s*g$/i, "$1 கிராம் (g)"],
  [/^(\d+(?:\.\d+)?)\s*W$/i, "$1 வாட் (W)"],
  [/^(\d+(?:\.\d+)?)\s*Pa$/i, "$1 பாஸ்கல் (Pa)"],
  [/^(\d+(?:\.\d+)?)\s*Hz$/i, "$1 ஹெர்ட்ஸ் (Hz)"],
  [/^(\d+(?:\.\d+)?)\s*V$/i, "$1 வோல்ட் (V)"],
  [/^(\d+(?:\.\d+)?)\s*A$/i, "$1 ஆம்பியர் (A)"],
  [/^(\d+(?:\.\d+)?)\s*Ω$/i, "$1 ஓம் (Ω)"],
  [/^(\d+(?:\.\d+)?)\s*ohm(?:s)?$/i, "$1 ஓம் (Ω)"],
];

/** Offline rule dictionary for science and common test terminology */
const OFFLINE_PATTERNS: [RegExp, string][] = [
  [
    /A body of mass ([\d.]+\s*kg) is moving with a velocity of ([\d.]+\s*m\/s)\.\s*What is its kinetic energy\??/i,
    "$1 நிறை கொண்ட ஒரு பொருள் $2 திசைவேகத்தில் இயங்குகிறது. அதன் இயக்க ஆற்றல் என்ன?",
  ],
  [
    /A resistance of ([\d.]+\s*[\u03a9Ω]|[\d.]+\s*ohm)\s*is connected to a potential difference of ([\d.]+\s*V)\.\s*The current flowing through the resistance is:?/i,
    "$1 மின்தடையானது $2 மின்னழுத்த வேறுபாட்டுடன் இணைக்கப்பட்டுள்ளது. மின்தடையின் வழியே பாயும் மின்னோட்டம் எவ்வளவு:",
  ],
  [/What is the value of/i, "எதன் மதிப்பு என்ன:"],
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
async function translateBatchToTamil(items: string[]): Promise<string[]> {
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
