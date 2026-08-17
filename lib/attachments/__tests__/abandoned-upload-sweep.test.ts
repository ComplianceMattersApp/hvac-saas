import { describe, expect, it, vi } from "vitest";

import {
  ABANDONED_UPLOAD_GRACE,
  sweepAbandonedAttachmentUploads,
} from "@/lib/attachments/abandoned-upload-sweep";

type SweptRow = { id: string; bucket: string | null; storage_path: string | null };

function makeAdmin(options: {
  rows?: SweptRow[];
  rpcError?: string;
  removeErrorByBucket?: Record<string, string>;
}) {
  const rpc = vi.fn(async () => ({
    data: options.rpcError ? null : (options.rows ?? []),
    error: options.rpcError ? { message: options.rpcError } : null,
  }));

  const removedByBucket: Record<string, string[]> = {};
  const remove = vi.fn(async (paths: string[]) => paths);

  const storage = {
    from: vi.fn((bucket: string) => ({
      remove: async (paths: string[]) => {
        const failure = options.removeErrorByBucket?.[bucket];
        if (failure) return { data: null, error: { message: failure } };
        removedByBucket[bucket] = [...(removedByBucket[bucket] ?? []), ...paths];
        await remove(paths);
        return { data: paths.map((path) => ({ name: path })), error: null };
      },
    })),
  };

  const admin = { rpc, storage } as unknown as Parameters<
    typeof sweepAbandonedAttachmentUploads
  >[0]["admin"];

  return { admin, rpc, storage, removedByBucket };
}

describe("sweepAbandonedAttachmentUploads", () => {
  it("passes the grace period and limit through to the sweep function", async () => {
    const { admin, rpc } = makeAdmin({ rows: [] });

    await sweepAbandonedAttachmentUploads({ admin });

    expect(rpc).toHaveBeenCalledWith("sweep_abandoned_attachment_uploads", {
      p_older_than: ABANDONED_UPLOAD_GRACE,
      p_limit: 500,
    });
  });

  it("honours an explicit grace period so a backfill can sweep harder", async () => {
    const { admin, rpc } = makeAdmin({ rows: [] });

    await sweepAbandonedAttachmentUploads({ admin, olderThan: "7 days", limit: 50 });

    expect(rpc).toHaveBeenCalledWith("sweep_abandoned_attachment_uploads", {
      p_older_than: "7 days",
      p_limit: 50,
    });
  });

  it("does not touch storage when nothing was swept", async () => {
    const { admin, storage } = makeAdmin({ rows: [] });

    const result = await sweepAbandonedAttachmentUploads({ admin });

    expect(result).toEqual({ sweptRows: 0, removedObjects: 0, failedBuckets: [] });
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("removes the swept objects grouped by bucket", async () => {
    const { admin, removedByBucket } = makeAdmin({
      rows: [
        { id: "a1", bucket: "attachments", storage_path: "job/j1/a1-photo.jpg" },
        { id: "a2", bucket: "attachments", storage_path: "job/j1/a2-photo.jpg" },
        { id: "a3", bucket: "permits", storage_path: "permit/p1/a3-form.pdf" },
      ],
    });

    const result = await sweepAbandonedAttachmentUploads({ admin });

    expect(result.sweptRows).toBe(3);
    expect(result.removedObjects).toBe(3);
    expect(removedByBucket.attachments).toEqual([
      "job/j1/a1-photo.jpg",
      "job/j1/a2-photo.jpg",
    ]);
    expect(removedByBucket.permits).toEqual(["permit/p1/a3-form.pdf"]);
  });

  it("strips leading slashes so the object key matches what storage holds", async () => {
    const { admin, removedByBucket } = makeAdmin({
      rows: [{ id: "a1", bucket: "attachments", storage_path: "/job/j1/a1-photo.jpg" }],
    });

    await sweepAbandonedAttachmentUploads({ admin });

    expect(removedByBucket.attachments).toEqual(["job/j1/a1-photo.jpg"]);
  });

  it("skips rows with no usable storage location rather than throwing", async () => {
    const { admin, storage } = makeAdmin({
      rows: [
        { id: "a1", bucket: null, storage_path: "job/j1/a1.jpg" },
        { id: "a2", bucket: "attachments", storage_path: null },
      ],
    });

    const result = await sweepAbandonedAttachmentUploads({ admin });

    // Both rows are gone from the table; neither had an object to remove.
    expect(result.sweptRows).toBe(2);
    expect(result.removedObjects).toBe(0);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("reports a failing bucket without abandoning the others", async () => {
    const { admin, removedByBucket } = makeAdmin({
      rows: [
        { id: "a1", bucket: "broken", storage_path: "job/j1/a1.jpg" },
        { id: "a2", bucket: "attachments", storage_path: "job/j1/a2.jpg" },
      ],
      removeErrorByBucket: { broken: "bucket unavailable" },
    });

    const result = await sweepAbandonedAttachmentUploads({ admin });

    expect(result.sweptRows).toBe(2);
    expect(result.removedObjects).toBe(1);
    expect(result.failedBuckets).toEqual([
      { bucket: "broken", error: "bucket unavailable" },
    ]);
    expect(removedByBucket.attachments).toEqual(["job/j1/a2.jpg"]);
  });

  it("surfaces an RPC failure instead of reporting a clean sweep", async () => {
    const { admin } = makeAdmin({ rpcError: "permission denied" });

    await expect(sweepAbandonedAttachmentUploads({ admin })).rejects.toThrow(
      /Abandoned upload sweep failed: permission denied/,
    );
  });

  it("deduplicates repeated object keys within a bucket", async () => {
    const { admin, removedByBucket } = makeAdmin({
      rows: [
        { id: "a1", bucket: "attachments", storage_path: "job/j1/dupe.jpg" },
        { id: "a2", bucket: "attachments", storage_path: "job/j1/dupe.jpg" },
      ],
    });

    const result = await sweepAbandonedAttachmentUploads({ admin });

    expect(result.sweptRows).toBe(2);
    expect(removedByBucket.attachments).toEqual(["job/j1/dupe.jpg"]);
    expect(result.removedObjects).toBe(1);
  });
});
