import { describe, expect, it, vi } from "vitest";

import {
  readFinalizedAttachmentsWithLegacyFallback,
  shouldRetryFinalizedAttachmentRead,
} from "@/lib/attachments/finalized-attachment-read";

describe("finalized attachment reads", () => {
  it("recognizes the missing-column error and the empty PostgREST 400 shape", () => {
    expect(shouldRetryFinalizedAttachmentRead({
      error: { code: "42703", message: "column attachments.finalized_at does not exist" },
      status: 400,
    })).toBe(true);
    expect(shouldRetryFinalizedAttachmentRead({ error: { message: "" }, status: 400 })).toBe(true);
  });

  it("does not retry unrelated failures", () => {
    expect(shouldRetryFinalizedAttachmentRead({
      error: { message: "permission denied" },
      status: 403,
    })).toBe(false);
  });

  it("retries without the finalized filter only for a legacy-schema failure", async () => {
    const read = vi.fn(async (requireFinalized: boolean) => requireFinalized
      ? { data: null, error: { message: "" }, status: 400 }
      : { data: [{ id: "attachment-1" }], error: null, status: 200 });

    await expect(readFinalizedAttachmentsWithLegacyFallback(read)).resolves.toMatchObject({
      data: [{ id: "attachment-1" }],
      error: null,
    });
    expect(read).toHaveBeenNthCalledWith(1, true);
    expect(read).toHaveBeenNthCalledWith(2, false);
  });
});
