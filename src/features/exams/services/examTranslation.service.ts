// ─────────────────────────────────────────────────────────────────────────────
// EXAM TRANSLATION SERVICE — Multi-language dynamic support for online exams
//
// Supports instant switching between English (default) and Tamil (தமிழ்).
// Provides UI dictionaries and real-time question / option translation caching.
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

/** Translate a single text string using free translation endpoint with local cache */
export async function translateTextToTamil(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (/^[\d\s+\-*/=().,;:!?%$#@&]+$/.test(trimmed)) return text; // Pure formula or numbers

  const cacheKey = `ta:${trimmed}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      trimmed,
    )}&langpair=en|ta`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Translation request failed");
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated && typeof translated === "string" && translated.trim()) {
      const clean = translated.trim();
      memoryCache.set(cacheKey, clean);
      return clean;
    }
  } catch (err) {
    // Fallback to Google GTX if available
    try {
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ta&dt=t&q=${encodeURIComponent(
        trimmed,
      )}`;
      const gRes = await fetch(gUrl);
      if (gRes.ok) {
        const gData = await gRes.json();
        const gText = Array.isArray(gData?.[0])
          ? gData[0].map((item: [string]) => item?.[0]).join("")
          : "";
        if (gText) {
          memoryCache.set(cacheKey, gText);
          return gText;
        }
      }
    } catch {
      // Return original on offline/failure
    }
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

    return {
      ...q,
      questionText: translatedQuestionText,
      options: q.options.map((o, i) => ({
        ...o,
        text: translatedOptions[i] || o.text,
      })),
      originalQuestionText: q.questionText,
      originalOptions: q.options.map((o) => ({ id: o.id, text: o.text })),
      isTranslated: true,
    };
  } catch {
    return { ...q, isTranslated: false };
  }
}
