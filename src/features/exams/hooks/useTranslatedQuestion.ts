import { useEffect, useState } from "react";
import type { PublicQuestion } from "../services/onlineTest.service";
import {
  translateQuestion,
  preloadAllExamQuestions,
  getCachedQuestion,
  type ExamLanguage,
  type TranslatedQuestion,
} from "../services/examTranslation.service";

/**
 * Hook to dynamically translate questions to Tamil or return original English.
 * Returns cached translations synchronously to avoid screen flashing,
 * and bulk pre-loads the full exam paper in the background.
 */
export function useTranslatedQuestion(
  question: PublicQuestion | undefined,
  lang: ExamLanguage,
  allQuestions?: PublicQuestion[],
  currentIndex?: number,
) {
  // Try synchronous cache read to eliminate 1-frame flashes
  const cached = question && lang === "ta" ? getCachedQuestion(question.id) : undefined;

  const [displayQuestion, setDisplayQuestion] = useState<TranslatedQuestion | undefined>(
    cached ?? (question ? { ...question, isTranslated: false } : undefined),
  );
  const [isTranslating, setIsTranslating] = useState(false);

  // Sync state immediately if question or cache changes
  useEffect(() => {
    if (!question) {
      setDisplayQuestion(undefined);
      setIsTranslating(false);
      return;
    }

    if (lang === "en") {
      setDisplayQuestion({ ...question, isTranslated: false });
      setIsTranslating(false);
      return;
    }

    // Check synchronous cache first
    const hit = getCachedQuestion(question.id);
    if (hit) {
      setDisplayQuestion(hit);
      setIsTranslating(false);
      return;
    }

    let active = true;
    setIsTranslating(true);

    translateQuestion(question, "ta")
      .then((translated) => {
        if (active) {
          setDisplayQuestion(translated);
          setIsTranslating(false);
        }
      })
      .catch(() => {
        if (active) {
          setDisplayQuestion({ ...question, isTranslated: false });
          setIsTranslating(false);
        }
      });

    return () => {
      active = false;
    };
  }, [question?.id, lang]);

  // Bulk preload all questions of the exam in background when in Tamil mode
  useEffect(() => {
    if (lang === "ta" && allQuestions && allQuestions.length > 0) {
      preloadAllExamQuestions(allQuestions, "ta").catch(() => undefined);
    }
  }, [lang, allQuestions]);

  return {
    displayQuestion:
      lang === "ta"
        ? getCachedQuestion(question?.id ?? "") ?? displayQuestion ?? question
        : question,
    isTranslating,
  };
}
