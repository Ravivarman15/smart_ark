// ── Parent Portal — public surface ───────────────────────────────────────────
// App-level code imports from here, never from subfolders.

export { ParentShellLayout } from "./layouts/ParentShellLayout";
export { ParentRealtimeProvider } from "./providers/ParentRealtimeProvider";
export { ActiveChildProvider, useActiveChild } from "./providers/ActiveChildProvider";

export { parentChildrenService } from "./services/parentChildren.service";
export { parentPortalService } from "./services/parentPortal.service";
export { parentAuditService } from "./services/parentAudit.service";
export { parentPreferencesService } from "./services/parentPreferences.service";

export { useParentChildren } from "./hooks/useParentChildren";
export * from "./hooks/useChildData";

export {
  ASSISTANT_QUESTIONS,
  answer as assistantAnswer,
  classifyQuestion,
  periodSummary,
} from "./utils/parentAssistant";

export type {
  ParentChild,
  ChildSummary,
  ParentTimelineItem,
  ParentClassItem,
  AssistantAnswer,
  ParentPreferences,
} from "./types/parentPortal.types";
