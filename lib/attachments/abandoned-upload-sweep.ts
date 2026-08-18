import type { createAdminClient } from "@/lib/supabase/server";

/**
 * Reclaim storage from job attachment uploads that were staged but never
 * completed.
 *
 * The upload is a three-step flow — stage the row, hand the browser a signed
 * upload URL, finalize once the object is confirmed. A technician who loses
 * signal or closes the tab between steps two and three leaves a staged row and,
 * sometimes, a partially uploaded object. Neither is visible to anyone
 * (read surfaces filter on `finalized_at`), so without a sweep they accumulate
 * silently and forever.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type AbandonedUploadSweepResult = {
  sweptRows: number;
  removedObjects: number;
  failedBuckets: Array<{ bucket: string; error: string }>;
};

/**
 * Grace period before a staged row is considered abandoned. Generous on
 * purpose: a large photo over poor LTE from a mechanical room can take a long
 * time, and sweeping a row out from under an upload still in flight would
 * delete a technician's work.
 */
export const ABANDONED_UPLOAD_GRACE = "24 hours";

export async function sweepAbandonedAttachmentUploads(input: {
  admin: AdminClient;
  olderThan?: string;
  limit?: number;
}): Promise<AbandonedUploadSweepResult> {
  const { admin } = input;

  // The RPC deletes the rows and returns their storage objects in one
  // statement, so two overlapping sweeps cannot both claim the same row.
  const { data, error } = await admin.rpc("sweep_abandoned_attachment_uploads", {
    p_older_than: input.olderThan ?? ABANDONED_UPLOAD_GRACE,
    p_limit: input.limit ?? 500,
  });

  if (error) throw new Error(`Abandoned upload sweep failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    bucket: string | null;
    storage_path: string | null;
  }>;

  if (!rows.length) {
    return { sweptRows: 0, removedObjects: 0, failedBuckets: [] };
  }

  const pathsByBucket = new Map<string, string[]>();
  for (const row of rows) {
    const bucket = String(row.bucket ?? "").trim();
    const storagePath = String(row.storage_path ?? "").trim().replace(/^\/+/, "");
    if (!bucket || !storagePath) continue;
    if (!pathsByBucket.has(bucket)) pathsByBucket.set(bucket, []);
    pathsByBucket.get(bucket)?.push(storagePath);
  }

  let removedObjects = 0;
  const failedBuckets: Array<{ bucket: string; error: string }> = [];

  for (const [bucket, storagePaths] of pathsByBucket.entries()) {
    const uniquePaths = Array.from(new Set(storagePaths));
    if (!uniquePaths.length) continue;

    // The row is already gone by this point, so a failure here leaks the object
    // rather than corrupting anything. Logged and reported so it can be
    // reconciled, and deliberately not fatal: one bad bucket must not stop the
    // others from being reclaimed.
    const { error: removeErr } = await admin.storage.from(bucket).remove(uniquePaths);

    if (removeErr) {
      failedBuckets.push({ bucket, error: removeErr.message });
      console.warn("abandoned_attachment_object_removal_failed", {
        bucket,
        objectCount: uniquePaths.length,
        error: removeErr.message,
      });
      continue;
    }

    removedObjects += uniquePaths.length;
  }

  return { sweptRows: rows.length, removedObjects, failedBuckets };
}
