import { describe, expect, it } from "vitest";

import {
  FIELD_OUTCOME_CODES,
  getFieldOutcomeRoute,
  isFieldOutcomeCode,
  isManualEccFailureOutcomeAvailable,
  listFieldOutcomeRoutes,
} from "@/lib/jobs/field-outcome-routing";
import { WAITING_STATE_TYPES } from "@/lib/utils/ops-status";

describe("field outcome routing contract", () => {
  it("exposes the expected future field outcome codes with stable labels", () => {
    expect(FIELD_OUTCOME_CODES).toEqual([
      "work_completed",
      "parts_needed",
      "approval_needed",
      "access_issue",
      "unable_to_complete",
      "return_needed",
      "different_issue_found",
    ]);

    const labels = Object.fromEntries(
      listFieldOutcomeRoutes().map((route) => [route.code, route.label]),
    );

    expect(labels).toEqual({
      work_completed: "Work Completed",
      parts_needed: "Parts Needed",
      approval_needed: "Approval Needed",
      access_issue: "Access Issue",
      unable_to_complete: "Unable to Complete",
      return_needed: "Return Needed",
      different_issue_found: "Different Issue Found",
    });
  });

  it("maps waiting outcomes to existing waiting reason types only", () => {
    const waitingTypes = new Set<string>(WAITING_STATE_TYPES);

    const waitingOutcomeExpectations = {
      parts_needed: "waiting_on_part",
      approval_needed: "waiting_on_customer_approval",
      access_issue: "waiting_on_access",
      unable_to_complete: "other",
    } as const;

    for (const [code, expectedWaitingType] of Object.entries(waitingOutcomeExpectations)) {
      const route = getFieldOutcomeRoute(code);
      expect(route?.existingIntent).toBe("set_waiting_reason");
      expect(route?.waitingReasonType).toBe(expectedWaitingType);
      expect(waitingTypes.has(String(route?.waitingReasonType))).toBe(true);
    }
  });

  it("keeps return and different-issue outcomes schema-free and status-free", () => {
    const returnNeeded = getFieldOutcomeRoute("return_needed");
    expect(returnNeeded?.returnVisitIntent).toBe(true);
    expect(returnNeeded?.waitingReasonType).toBeNull();
    expect(returnNeeded?.createsDatabaseStatus).toBe(false);
    expect(returnNeeded?.existingIntent).toBe("request_return_visit");

    const differentIssue = getFieldOutcomeRoute("different_issue_found");
    expect(differentIssue?.requiresVisitScopeReview).toBe(true);
    expect(differentIssue?.waitingReasonType).toBeNull();
    expect(differentIssue?.createsDatabaseStatus).toBe(false);
    expect(differentIssue?.existingIntent).toBe("review_visit_scope");
  });

  it("does not expose generic manual ECC failure as a field outcome", () => {
    expect(FIELD_OUTCOME_CODES).not.toContain("ecc_failed");
    expect(isFieldOutcomeCode("ecc_failed")).toBe(false);
    expect(getFieldOutcomeRoute("ecc_failed")).toBeNull();
    expect(isManualEccFailureOutcomeAvailable()).toBe(false);

    for (const route of listFieldOutcomeRoutes()) {
      expect(route.manualEccFailureOutcome).toBe(false);
    }
  });

  it("marks office-owned outcomes as leaving normal field My Work", () => {
    const officeOwnedRoutes = listFieldOutcomeRoutes().filter((route) => route.officeOwnedAfterSubmission);
    expect(officeOwnedRoutes.map((route) => route.code)).toEqual([
      "parts_needed",
      "approval_needed",
      "access_issue",
      "unable_to_complete",
      "return_needed",
      "different_issue_found",
    ]);

    for (const route of officeOwnedRoutes) {
      expect(route.leavesNormalFieldMyWork).toBe(true);
    }
  });

  it("keeps work completed out of office exception routing", () => {
    const route = getFieldOutcomeRoute("work_completed");

    expect(route?.existingIntent).toBe("complete_field_work");
    expect(route?.officeOwnedAfterSubmission).toBe(false);
    expect(route?.waitingReasonType).toBeNull();
    expect(route?.returnVisitIntent).toBe(false);
    expect(route?.requiresVisitScopeReview).toBe(false);
    expect(route?.requiresShortReason).toBe(false);
    expect(route?.createsDatabaseStatus).toBe(false);
  });
});
