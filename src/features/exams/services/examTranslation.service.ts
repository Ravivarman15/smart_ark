// ─────────────────────────────────────────────────────────────────────────────
// EXAM TRANSLATION SERVICE — Multi-language dynamic support for online exams
//
// Provides high-speed bilingual switching between English (default) and Tamil.
// Uses Google Chrome Translate API + MyMemory fallbacks with in-memory caching
// and scientific unit localization.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicQuestion } from "./onlineTest.service";

export type ExamLanguage = "en" | "ta";

export interface TranslatedQuestion extends PublicQuestion {
  originalQuestionText?: string;
  originalOptions?: { id: string; text: string }[];
  isTranslated?: boolean;
}

// ── In-memory translation cache (preserves translated questions across toggles) ──
const memoryCache = new Map<string, string>();

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

/** Translate a single text string using Google clients API + MyMemory fallback with local cache */
export async function translateTextToTamil(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // Check unit patterns like "25 J" -> "25 ஜூல் (J)"
  for (const [pattern, replacement] of UNIT_TRANSLATIONS) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }

  // Pure numbers or mathematical expressions
  if (/^[\d\s+\-*/=().,;:!?%$#@&^√]+$/.test(trimmed)) return text;

  const cacheKey = `ta:${trimmed}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  // Provider 1: Google Clients Chrome Extension endpoint (Fast, high quality, accurate)
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
        memoryCache.set(cacheKey, clean);
        return clean;
      }
    }
  } catch {
    // Continue to fallback
  }

  // Provider 2: MyMemory API with email parameter
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      trimmed,
    )}&langpair=en|ta&de=arklearning_portal@gmail.com`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === "string" && translated.trim() && !translated.startsWith("MYMEMORY WARNING")) {
        const clean = translated.trim();
        memoryCache.set(cacheKey, clean);
        return clean;
      }
    }
  } catch {
    // Continue to fallback
  }

  // Provider 3: Lingva translate instance
  try {
    const url = `https://lingva.ml/api/v1/en/ta/${encodeURIComponent(trimmed)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data?.translation && typeof data.translation === "string") {
        const clean = data.translation.trim();
        memoryCache.set(cacheKey, clean);
        return clean;
      }
    }
  } catch {
    // Return original text if offline
  }

  return text;
}

/** Translate a full PublicQuestion object to Tamil */
export async function translateQuestion(
  q: PublicQuestion,
  lang: ExamLanguage,
): Promise<TranslatedQuestion> {
  if (lang === "en") {
    return { ...q, isTranslated: false };
  }

  try {
    const [translatedQuestionText, ...translatedOptions] = await Promise.all([
      translateTextToTamil(q.questionText),
      ...q.options.map((o) => translateTextToTamil(o.text)),
    ]);

    const translatedPrompts = q.matchPrompts
      ? await Promise.all(q.matchPrompts.map((p) => translateTextToTamil(p)))
      : [];

    const translatedChoices = q.matchChoices
      ? await Promise.all(q.matchChoices.map((c) => translateTextToTamil(c)))
      : [];

    return {
      ...q,
      questionText: translatedQuestionText,
      options: q.options.map((o, i) => ({
        ...o,
        text: translatedOptions[i] || o.text,
      })),
      matchPrompts: translatedPrompts.length > 0 ? translatedPrompts : q.matchPrompts,
      matchChoices: translatedChoices.length > 0 ? translatedChoices : q.matchChoices,
      originalQuestionText: q.questionText,
      originalOptions: q.options.map((o) => ({ id: o.id, text: o.text })),
      isTranslated: true,
    };
  } catch {
    return { ...q, isTranslated: false };
  }
}
