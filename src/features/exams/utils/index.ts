// Barrel for the Exam grading, MCQ scoring & access layers.
export {
  round2,
  DEFAULT_GRADE_SCHEME,
  schemeFor,
  percentageOf,
  gradeFor,
  isPass,
  passFloorPercent,
  scoreResult,
  assignRanks,
  computeStats,
  gradeDistribution,
  median,
  mean,
  stdDev,
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
  schoolStats,
  groupComparison,
  monthTrend,
  gradeSpread,
  rankDistribution,
  studentAggregates,
  topStudents,
  bottomStudents,
  mostImproved,
  performanceDrops,
  riskStudents,
  scholarshipCandidates,
  heatMap,
  type ScoredRow,
  type SchoolStats,
  type ComparisonRow,
  type RankBucket,
  type StudentAggregate,
  type HeatMap,
} from "./analytics";

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
