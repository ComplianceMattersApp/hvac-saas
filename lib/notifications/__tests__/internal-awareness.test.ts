import { describe, expect, it } from "vitest";

import {
  CONTRACTOR_UPDATE_NOTIFICATION_TYPES,
  NEW_JOB_NOTIFICATION_TYPES,
  isContractorUpdateNotificationType,
  isNewJobNotificationType,
  matchesInternalNotificationFilter,
} from "@/lib/notifications/internal-awareness";

describe("contractor awareness notification matching", () => {
  it("contractor_intake_proposal_submitted is NOT a contractor update", () => {
    expect(CONTRACTOR_UPDATE_NOTIFICATION_TYPES).not.toContain("contractor_intake_proposal_submitted");
    expect(isContractorUpdateNotificationType("contractor_intake_proposal_submitted")).toBe(false);
    expect(matchesInternalNotificationFilter("contractor_intake_proposal_submitted", "contractor_updates")).toBe(false);
  });

  it("contractor_intake_proposal_submitted IS a new job notification", () => {
    expect(NEW_JOB_NOTIFICATION_TYPES).toContain("contractor_intake_proposal_submitted");
    expect(isNewJobNotificationType("contractor_intake_proposal_submitted")).toBe(true);
    expect(matchesInternalNotificationFilter("contractor_intake_proposal_submitted", "new_job_notifications")).toBe(true);
  });

  it("internal intake email notifications stay in new job notifications, not contractor updates", () => {
    const emailTypes = [
      "internal_contractor_job_intake_email",
      "internal_contractor_intake_proposal_email",
    ];

    for (const type of emailTypes) {
      expect(NEW_JOB_NOTIFICATION_TYPES).toContain(type);
      expect(isNewJobNotificationType(type)).toBe(true);
      expect(matchesInternalNotificationFilter(type, "new_job_notifications")).toBe(true);
      expect(isContractorUpdateNotificationType(type)).toBe(false);
      expect(matchesInternalNotificationFilter(type, "contractor_updates")).toBe(false);
    }
  });

  it("internal assignment and mention alerts are included in new job notifications", () => {
    const teamAlertTypes = [
      "internal_job_assigned",
      "internal_note_tag",
      "internal_estimate_proposal_approved",
    ];

    for (const type of teamAlertTypes) {
      expect(NEW_JOB_NOTIFICATION_TYPES).toContain(type);
      expect(isNewJobNotificationType(type)).toBe(true);
      expect(matchesInternalNotificationFilter(type, "new_job_notifications")).toBe(true);
      expect(isContractorUpdateNotificationType(type)).toBe(false);
      expect(matchesInternalNotificationFilter(type, "contractor_updates")).toBe(false);
    }
  });

  it("contractor follow-up events are contractor updates, not new job notifications", () => {
    const updateTypes = [
      "contractor_note",
      "contractor_correction_submission",
      "retest_ready_requested",
      "contractor_schedule_updated",
    ];
    for (const type of updateTypes) {
      expect(isContractorUpdateNotificationType(type)).toBe(true);
      expect(matchesInternalNotificationFilter(type, "contractor_updates")).toBe(true);
      expect(isNewJobNotificationType(type)).toBe(false);
      expect(matchesInternalNotificationFilter(type, "new_job_notifications")).toBe(false);
    }
  });

  it("matchesInternalNotificationFilter returns true for any type when no filterKey", () => {
    expect(matchesInternalNotificationFilter("contractor_intake_proposal_submitted", null)).toBe(true);
    expect(matchesInternalNotificationFilter("contractor_note", undefined)).toBe(true);
  });
});