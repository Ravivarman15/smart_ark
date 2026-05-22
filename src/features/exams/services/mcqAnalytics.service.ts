import { mcqPaperService } from "./mcqPaper.service";
import {
  chapterDistribution,
  complexityLabel,
  difficultyDistribution,
  estimateDifficultyScore,
  estimatedAvgScorePct,
  paperInsights,
  paperTotalMarks,
  typeDistribution,
} from "../utils/mcqScoring";
import type { McqPaperAnalytics } from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ paper analytics — composes the paper + its question set and runs every
// figure through the centralised scoring layer (utils/mcqScoring.ts). No
// aggregation logic lives here; this service only orchestrates. The same
// scoring layer will back the post-exam analytics in the MCQ Exam phase.
// ─────────────────────────────────────────────────────────────────────────────
class McqAnalyticsService {
  async forPaper(paperId: string): Promise<McqPaperAnalytics> {
    const [paper, questions] = await Promise.all([
      mcqPaperService.getById(paperId),
      mcqPaperService.getQuestions(paperId),
    ]);

    // Project to the minimal shape the scoring layer consumes.
    const items = questions.map((q) => ({
      difficulty: q.difficulty,
      chapter: q.chapter,
      effectiveMarks: q.effectiveMarks,
      questionType: q.questionType,
    }));

    const difficultyScore = estimateDifficultyScore(items);

    return {
      paper,
      totalQuestions: questions.length,
      totalMarks: paperTotalMarks(items),
      difficultyScore,
      complexityLabel: complexityLabel(difficultyScore),
      estimatedAvgScorePct: estimatedAvgScorePct(items, paper.negativeMarking),
      chapterDistribution: chapterDistribution(items),
      difficultyDistribution: difficultyDistribution(items),
      typeDistribution: typeDistribution(items),
      insights: paperInsights(items, paper.negativeMarking),
    };
  }
}

export const mcqAnalyticsService = new McqAnalyticsService();
