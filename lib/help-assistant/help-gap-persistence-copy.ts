import type { HelpGapEventType } from "./help-gap-events";
import type { PersistHelpGapResult } from "./help-gap-persistence";

export type HelpGapPersistenceUiStatus = "idle" | "pending" | "saved" | "local_only";

export function resolveHelpGapPersistenceStatus(
  result: PersistHelpGapResult,
): HelpGapPersistenceUiStatus {
  return result.ok ? "saved" : "local_only";
}

export function getHelpGapFeedbackMessage(params: {
  eventType?: HelpGapEventType | null;
  status: HelpGapPersistenceUiStatus;
}) {
  if (params.status === "saved") {
    if (params.eventType === "still_need_help") {
      return "Thanks - this helps us see where users need support. No support case was created. Contact support if this is blocking your work.";
    }

    return "Thanks - this helps us improve training and support. No support case was created.";
  }

  if (params.eventType === "still_need_help") {
    return "Marked locally for this session. No support case was created. Contact support if this is blocking your work.";
  }

  if (params.eventType === "not_helpful") {
    return "Marked locally for this session. This is the kind of question we should improve. No support case was created.";
  }

  if (params.eventType === "unknown_answer") {
    return "Marked locally for this session. This is the kind of question we should improve. No support case was created.";
  }

  return "Marked locally for this session.";
}
