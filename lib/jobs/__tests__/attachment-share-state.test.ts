import { describe, expect, it } from "vitest";

import { getContractorSharedAttachmentIds } from "@/lib/jobs/attachment-share-state";

describe("getContractorSharedAttachmentIds", () => {
  it("restores attachments shared through durable internal-share events", () => {
    expect(getContractorSharedAttachmentIds([
      { event_type: "public_note", meta: { source: "internal_share", attachment_ids: ["a-1", "a-2"] } },
      { event_type: "public_note", meta: { source: "internal_share", attachment_ids: ["a-1"] } },
      { event_type: "public_note", meta: { source: "other", attachment_ids: ["not-shared"] } },
      { event_type: "contractor_note", meta: { attachment_ids: ["contractor-upload"] } },
    ])).toEqual(["a-1", "a-2"]);
  });
});
