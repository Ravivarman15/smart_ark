import { useEffect, useState } from "react";
import type { PublicQuestion } from "../services/onlineTest.service";
import {
  translateQuestion,
  type ExamLanguage,
  type TranslatedQuestion,
} from "../services/examTranslation.service";

/**
 * Hook to dynamically translate questions to Tamil or return original English.
 * Caches in memory for instant switching and pre-fetches surrounding questions.
 */
export function useTranslatedQuestion(
  question: PublicQuestion | undefined,
  lang: ExamLanguage,
  allQuestions?: PublicQuestion[],
  currentIndex?: number,
) {
  const [displayQuestion, setDisplayQuestion] = useState<TranslatedQuestion | undefined>(
    question ? { ...question, isTranslated: false } : undefined,
  );
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    if (!question) {
      setDisplayQuestion(undefined);
      return;
    }

    if (lang === "en") {
      setDisplayQuestion({ ...question, isTranslated: false });
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

    // Staggered background pre-fetch next questions to avoid network congestion
    const timers: number[] = [];
    if (allQuestions && typeof currentIndex === "number") {
      for (let i = 1; i <= 3; i++) {
        const nextQ = allQuestions[currentIndex + i];
        if (nextQ) {
          const tId = window.setTimeout(() => {
            if (active) {
              translateQuestion(nextQ, "ta").catch(() => undefined);
            }
          }, i * 300);
          timers.push(tId);
        }
      }
    }

    return () => {
      active = false;
      timers.forEach((tId) => window.clearTimeout(tId));
    };
  }, [question?.id, lang, allQuestions?.length, currentIndex]);

  return { displayQuestion: displayQuestion ?? question, isTranslating };
}
