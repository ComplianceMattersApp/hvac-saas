import { describe, expect, it } from "vitest";

import {
  CONTRACTOR_UPDATE_NOTIFICATION_TYPES,
  isContractorUpdateNotificationType,
  matchesInternalNotificationFilter,
} from "@/lib/notifications/internal-awareness";

describe("contractor awareness notification matching", () => {
  it("treats proposal review notifications as contractor updates", () => {
    expect(CONTRACTOR_UPDATE_NOTIFICATION_TYPES).toContain("contractor_intake_proposal_submitted");
    expect(isContractorUpdateNotificationType("contractor_intake_proposal_submitted")).toBe(true);
    expect(matchesInternalNotificationFilter("contractor_intake_proposal_submitted", "contractor_updates")).toBe(true);
  });
});