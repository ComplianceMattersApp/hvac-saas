import { describe, expect, it } from "vitest";

import { buildAttachmentReviewSummary } from "@/lib/jobs/attachment-review-summary";

describe("buildAttachmentReviewSummary", () => {
  it("counts correction-review attachments as contractor uploads and needs-review uploads", () => {
    const summary = buildAttachmentReviewSummary({
      visibleAttachmentIds: new Set(["a1", "a2", "a3"]),
      events: [
        {
          event_type: "contractor_correction_submission",
          created_at: "2026-05-25T10:00:00.000Z",
          meta: { attachment_ids: ["a1", "a2"] },
        },
      ],
    });

    expect(summary).toEqual({
      contractorUploadCount: 2,
      correctionReviewUploadCount: 2,
      reviewAnchorUploadCount: 2,
    });
  });

  it("tracks review-anchor uploads for contractor notes after retest-ready request", () => {
    const summary = buildAttachmentReviewSummary({
      visibleAttachmentIds: new Set(["a1", "a2", "a3"]),
      events: [
        {
          event_type: "retest_ready_requested",
          created_at: "2026-05-25T10:00:00.000Z",
          meta: {},
        },
        {
          event_type: "contractor_note",
          created_at: "2026-05-25T10:01:00.000Z",
          meta: { attachment_ids: ["a3"] },
        },
      ],
    });

    expect(summary).toEqual({
      contractorUploadCount: 1,
      correctionReviewUploadCount: 0,
      reviewAnchorUploadCount: 1,
    });
  });

  it("ignores non-visible and non-contractor attachment events", () => {
    const summary = buildAttachmentReviewSummary({
      visibleAttachmentIds: new Set(["a1"]),
      events: [
        {
          event_type: "attachment_added",
          created_at: "2026-05-25T10:01:00.000Z",
          meta: { source: "internal", attachment_ids: ["a1"] },
        },
        {
          event_type: "contractor_note",
          created_at: "2026-05-25T10:02:00.000Z",
          meta: { attachment_ids: ["a2"] },
        },
      ],
    });

    expect(summary).toEqual({
      contractorUploadCount: 0,
      correctionReviewUploadCount: 0,
      reviewAnchorUploadCount: 0,
    });
  });
});
