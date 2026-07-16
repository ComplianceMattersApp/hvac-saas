import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signScopedInternalJobDetailAttachments } from "@/lib/actions/internal-job-detail-read-boundary";
import { buildAttachmentReviewSummary } from "@/lib/jobs/attachment-review-summary";
import { getContractorSharedAttachmentIds } from "@/lib/jobs/attachment-share-state";

import JobAttachmentsInternal from "./JobAttachmentsInternal";

type DeferredJobAttachmentsInternalProps = {
  jobId: string;
  accountOwnerUserId: string;
};

export default async function DeferredJobAttachmentsInternal({
  jobId,
  accountOwnerUserId,
}: DeferredJobAttachmentsInternalProps) {
  const supabase = await createClient();

  const { data: attachmentRows, error: attachmentErr } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (attachmentErr) throw new Error(attachmentErr.message);

  const { data: reviewEvents, error: reviewEventsErr } = await supabase
    .from("job_events")
    .select("event_type, created_at, meta")
    .eq("job_id", jobId)
    .in("event_type", [
      "contractor_note",
      "contractor_correction_submission",
      "attachment_added",
      "retest_ready_requested",
      "public_note",
    ])
    .order("created_at", { ascending: false })
    .limit(300);

  if (reviewEventsErr) throw new Error(reviewEventsErr.message);

  const signedAttachmentResult = await signScopedInternalJobDetailAttachments({
    accountOwnerUserId,
    jobId,
    attachmentRows: attachmentRows ?? [],
  });

  if (!signedAttachmentResult.authorized) {
    return notFound();
  }

  const visibleAttachmentIds = new Set(
    signedAttachmentResult.items
      .map((item) => String(item.id ?? "").trim())
      .filter(Boolean),
  );

  const summary = buildAttachmentReviewSummary({
    events: (reviewEvents ?? []) as Array<{ event_type: string | null; created_at: string | null; meta: unknown }>,
    visibleAttachmentIds,
  });
  const initialSharedAttachmentIds = getContractorSharedAttachmentIds(reviewEvents ?? [])
    .filter((id) => visibleAttachmentIds.has(id));

  return (
    <JobAttachmentsInternal
      jobId={jobId}
      initialItems={signedAttachmentResult.items}
      summary={summary}
      initialSharedAttachmentIds={initialSharedAttachmentIds}
    />
  );
}
