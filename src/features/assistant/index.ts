// Public surface of the assistant feature.
//
// The engine is exported for the test suite and for any future surface that
// wants grounded documentation answers (an in-app help palette, for instance)
// WITHOUT re-implementing retrieval. Everything here is pure except the
// service, which is the only module that touches the network.

export { AssistantLauncher } from "./components/AssistantLauncher";
export { ask } from "./engine/ask";
export { retrieve, nearestSuggestions } from "./engine/retrieval";
export { docsUrl, toSource, toSources, PUBLIC_CORPUS, isPublicArticle } from "./engine/corpus";
export { openingSuggestions, suggestionsForRole } from "./engine/suggestions";
export { classifyQuestion, MAX_QUESTION_LENGTH } from "./engine/safety";
export { isGrounded } from "./engine/refine";
export { answerLocally, refineAnswer } from "./services/assistant.service";
export type {
  AssistantAnswer,
  AnswerSource,
  AnswerBlock,
  VisitorRole,
  Confidence,
  RefusalKind,
} from "./engine/types";
