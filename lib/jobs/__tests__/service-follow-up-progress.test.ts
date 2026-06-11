import { describe, expect, it } from "vitest";

import {
  buildServiceFollowUpProgressState,
  deriveLatestServiceFollowUpProgress,
  getServiceFollowUpContinuedChildJobId,
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
      bridgeActionLabel: "Add to Scheduling Queue",
      returnPromptLabel: "Create a linked return visit when ready",
    });
  });

  it("enables scheduling queue bridge only for ready structured follow-ups", () => {
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Materials Needed: Need 45/5 capacitor",
      events: [
        {
          created_at: "2026-06-10T10:00:00.000Z",
          meta: { service_follow_up_progress: "part_ordered" },
        },
      ],
    }).bridgeActionLabel).toBeNull();

    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Materials Needed: Need 45/5 capacitor",
      events: [
        {
          created_at: "2026-06-10T11:00:00.000Z",
          meta: { service_follow_up_progress: "part_arrived" },
        },
      ],
    }).bridgeActionLabel).toBe("Add to Scheduling Queue");

    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Approval Needed: Customer approved",
      events: [
        {
          created_at: "2026-06-10T11:00:00.000Z",
          meta: { service_follow_up_progress: "approval_received" },
        },
      ],
    }).bridgeActionLabel).toBe("Add to Scheduling Queue");
  });

  it("keeps Other broad without adding complex Slice 2A progression", () => {
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Other: Office review needed",
      events: [],
    })).toMatchObject({
      reason: { family: "other" },
      progress: null,
      nextActionLabel: null,
      bridgeActionLabel: "Add to Scheduling Queue",
      returnPromptLabel: "Review follow-up and create a linked return visit when ready",
    });
  });

  it("detects follow-up continuation through linked child return job", () => {
    const events = [
      {
        created_at: "2026-06-10T10:00:00.000Z",
        meta: {
          follow_up_bridge_action: "add_to_scheduling_queue",
          continued_through_child_job_id: "child-1",
        },
      },
    ];

    expect(getServiceFollowUpContinuedChildJobId(events)).toBe("child-1");
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Materials Needed: Need 45/5 capacitor",
      events: [
        {
          created_at: "2026-06-10T09:00:00.000Z",
          meta: { service_follow_up_progress: "part_arrived" },
        },
        ...events,
      ],
    })).toMatchObject({
      continuedThroughChildJobId: "child-1",
      continuedBridgeAction: "add_to_scheduling_queue",
      continuedScheduledDate: null,
      bridgeActionLabel: null,
      returnPromptLabel: "Linked return job created",
    });
  });

  it("detects follow-up continuation through linked scheduled return job", () => {
    const events = [
      {
        created_at: "2026-06-10T10:00:00.000Z",
        meta: {
          follow_up_bridge_action: "schedule_return_now",
          continued_through_child_job_id: "child-2",
          scheduled_date: "2026-06-12",
          window_start: "09:00",
          window_end: "11:00",
        },
      },
    ];

    expect(getServiceFollowUpContinuedChildJobId(events)).toBe("child-2");
    expect(buildServiceFollowUpProgressState({
      pendingInfoReason: "Approval Needed: Customer approved",
      events: [
        {
          created_at: "2026-06-10T09:00:00.000Z",
          meta: { service_follow_up_progress: "approval_received" },
        },
        ...events,
      ],
    })).toMatchObject({
      continuedThroughChildJobId: "child-2",
      continuedBridgeAction: "schedule_return_now",
      continuedScheduledDate: "2026-06-12",
      bridgeActionLabel: null,
      returnPromptLabel: "Linked return job created",
    });
  });
});
