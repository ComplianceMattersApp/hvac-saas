import type { WaitingStateType } from "@/lib/utils/ops-status";

export const FIELD_OUTCOME_CODES = [
  "work_completed",
  "parts_needed",
  "approval_needed",
  "access_issue",
  "unable_to_complete",
  "return_needed",
  "different_issue_found",
] as const;

export type FieldOutcomeCode = (typeof FIELD_OUTCOME_CODES)[number];

export type FieldOutcomeExistingIntent =
  | "complete_field_work"
  | "set_waiting_reason"
  | "request_return_visit"
  | "review_visit_scope";

export type FieldOutcomeRoute = {
  code: FieldOutcomeCode;
  label: string;
  description: string;
  existingIntent: FieldOutcomeExistingIntent;
  officeOwnedAfterSubmission: boolean;
  leavesNormalFieldMyWork: boolean;
  waitingReasonType: WaitingStateType | null;
  returnVisitIntent: boolean;
  requiresVisitScopeReview: boolean;
  requiresShortReason: boolean;
  createsDatabaseStatus: false;
  manualEccFailureOutcome: false;
};

const FIELD_OUTCOME_ROUTES: Record<FieldOutcomeCode, FieldOutcomeRoute> = {
  work_completed: {
    code: "work_completed",
    label: "Work Completed",
    description: "Field work is done and can move to closeout or billing as applicable.",
    existingIntent: "complete_field_work",
    officeOwnedAfterSubmission: false,
    leavesNormalFieldMyWork: true,
    waitingReasonType: null,
    returnVisitIntent: false,
    requiresVisitScopeReview: false,
    requiresShortReason: false,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
  parts_needed: {
    code: "parts_needed",
    label: "Parts Needed",
    description: "Work is blocked until parts are ordered, received, or approved.",
    existingIntent: "set_waiting_reason",
    officeOwnedAfterSubmission: true,
    leavesNormalFieldMyWork: true,
    waitingReasonType: "waiting_on_part",
    returnVisitIntent: false,
    requiresVisitScopeReview: false,
    requiresShortReason: false,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
  approval_needed: {
    code: "approval_needed",
    label: "Approval Needed",
    description: "Work is blocked until the customer or responsible party approves the next step.",
    existingIntent: "set_waiting_reason",
    officeOwnedAfterSubmission: true,
    leavesNormalFieldMyWork: true,
    waitingReasonType: "waiting_on_customer_approval",
    returnVisitIntent: false,
    requiresVisitScopeReview: false,
    requiresShortReason: false,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
  access_issue: {
    code: "access_issue",
    label: "Access Issue",
    description: "Work is blocked because the site, equipment, or required area was not accessible.",
    existingIntent: "set_waiting_reason",
    officeOwnedAfterSubmission: true,
    leavesNormalFieldMyWork: true,
    waitingReasonType: "waiting_on_access",
    returnVisitIntent: false,
    requiresVisitScopeReview: false,
    requiresShortReason: false,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
  unable_to_complete: {
    code: "unable_to_complete",
    label: "Unable to Complete",
    description: "Work was interrupted and office review is needed to decide the next step.",
    existingIntent: "set_waiting_reason",
    officeOwnedAfterSubmission: true,
    leavesNormalFieldMyWork: true,
    waitingReasonType: "other",
    returnVisitIntent: false,
    requiresVisitScopeReview: false,
    requiresShortReason: true,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
  return_needed: {
    code: "return_needed",
    label: "Return Needed",
    description: "The original work needs a follow-up or return visit before it can be resolved.",
    existingIntent: "request_return_visit",
    officeOwnedAfterSubmission: true,
    leavesNormalFieldMyWork: true,
    waitingReasonType: null,
    returnVisitIntent: true,
    requiresVisitScopeReview: false,
    requiresShortReason: true,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
  different_issue_found: {
    code: "different_issue_found",
    label: "Different Issue Found",
    description: "A different issue or additional work was found and needs office/work-item review.",
    existingIntent: "review_visit_scope",
    officeOwnedAfterSubmission: true,
    leavesNormalFieldMyWork: true,
    waitingReasonType: null,
    returnVisitIntent: false,
    requiresVisitScopeReview: true,
    requiresShortReason: true,
    createsDatabaseStatus: false,
    manualEccFailureOutcome: false,
  },
};

export function listFieldOutcomeRoutes(): FieldOutcomeRoute[] {
  return FIELD_OUTCOME_CODES.map((code) => FIELD_OUTCOME_ROUTES[code]);
}

export function getFieldOutcomeRoute(code: unknown): FieldOutcomeRoute | null {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (!isFieldOutcomeCode(normalized)) return null;
  return FIELD_OUTCOME_ROUTES[normalized];
}

export function isFieldOutcomeCode(code: unknown): code is FieldOutcomeCode {
  return (FIELD_OUTCOME_CODES as readonly string[]).includes(String(code ?? "").trim().toLowerCase());
}

export function isManualEccFailureOutcomeAvailable(): false {
  return false;
}
