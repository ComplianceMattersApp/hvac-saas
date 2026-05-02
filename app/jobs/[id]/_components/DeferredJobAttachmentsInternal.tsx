import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signScopedInternalJobDetailAttachments } from "@/lib/actions/internal-job-detail-read-boundary";

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

  const signedAttachmentResult = await signScopedInternalJobDetailAttachments({
    accountOwnerUserId,
    jobId,
    attachmentRows: attachmentRows ?? [],
  });

  if (!signedAttachmentResult.authorized) {
    return notFound();
  }

  return (
    <JobAttachmentsInternal
      jobId={jobId}
      initialItems={signedAttachmentResult.items}
    />
  );
}
