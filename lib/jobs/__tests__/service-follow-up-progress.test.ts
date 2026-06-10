import { describe, expect, it } from "vitest";

import {
  buildServiceFollowUpProgressState,
  deriveLatestServiceFollowUpProgress,
  parseServiceFollowUpReason,
} from "@/lib/jobs/service-follow-up-progress";

describe("service follow-up progress", () => {
  it("parses Slice 1A service follow-up reason families", () => {
    expect(parseServiceFollowUpReason("Materials Needed: Need 45/5 capacitor")).toMatchObject({
      family: "materials_needed",
      label: "Materials Needed",
      reason: "Need 45/5 capacitor",
      display: "Materials Needed: Need 45/5 capacitor",
    });

    expect(parseServiceFollowUpReason("Approval Needed: Customer must approve compressor")).toMatchObject({
      family: "approval_needed",
      label: "Approval Needed",
      reason: "Customer must approve compressor",
    });

    expect(parseServiceFollowUpReason("Other: Office review needed")).toMatchObject({
      family: "other",
      label: "Other",
      reason: "Office review needed",
    });

    expect(parseServiceFollowUpReason("Waiting on part: legacy")).toBeNull();
  });

  it("is safe when no progress events exist", () => {
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Materials Needed: Need 45/5 capacitor",
      events: [],
    })).toMatchObject({
      reason: {
        family: "materials_needed",
        display: "Materials Needed: Need 45/5 capacitor",
      },
      progress: null,
      progressLabel: null,
      nextActionLabel: "Mark Part Ordered",
    });
  });

  it("derives latest material progress by timestamp", () => {
    expect(deriveLatestServiceFollowUpProgress([
      {
        created_at: "2026-06-10T10:00:00.000Z",
        meta: { service_follow_up_progress: "part_arrived" },
      },
      {
        created_at: "2026-06-10T09:00:00.000Z",
        meta: { service_follow_up_progress: "part_ordered" },
      },
    ])).toMatchObject({
      progress: "part_arrived",
      progressLabel: "Part Arrived",
    });
  });

  it("derives approval received and next return prompt", () => {
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Approval Needed: Customer reviewing repair",
      events: [
        {
          created_at: "2026-06-10T10:00:00.000Z",
          meta: { service_follow_up_progress: "approval_received" },
        },
      ],
    })).toMatchObject({
      progress: "approval_received",
      progressLabel: "Approval Received",
      nextActionLabel: null,
      returnPromptLabel: "Create a linked return visit when ready",
    });
  });

  it("keeps Other broad without adding complex Slice 2A progression", () => {
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Other: Office review needed",
      events: [],
    })).toMatchObject({
      reason: { family: "other" },
      progress: null,
      nextActionLabel: null,
      returnPromptLabel: "Review follow-up and create a linked return visit when ready",
    });
  });
});
