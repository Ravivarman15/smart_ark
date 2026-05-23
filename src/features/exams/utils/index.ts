// Barrel for the Exam grading, MCQ scoring & access layers.
export {
  round2,
  DEFAULT_GRADE_SCHEME,
  schemeFor,
  percentageOf,
  gradeFor,
  isPass,
  scoreResult,
  assignRanks,
  computeStats,
  gradeDistribution,
  validateScheme,
  type ScoreInput,
  type ScoreOutput,
} from "./grading";

export {
  DIFFICULTY_WEIGHT,
  effectiveMarks,
  paperTotalMarks,
  estimateDifficultyScore,
  complexityLabel,
  estimatedAvgScorePct,
  chapterDistribution,
  difficultyDistribution,
  typeDistribution,
  paperInsights,
  correctOptionIds,
  answerKeyError,
  scoreAnswer,
  scoreAttempt,
  normalizeQuestionText,
  selectQuestionsForGeneration,
} from "./mcqScoring";

export {
  canManagePaper,
  canManageQuestion,
  canShareGlobally,
  type AccessUser,
} from "./mcqAccess";

export {
  newShuffleSeed,
  seededShuffle,
  accuracyPct,
  rankAndPercentile,
  sectionBreakdown,
  weakChapters,
} from "./mcqExamScoring";
