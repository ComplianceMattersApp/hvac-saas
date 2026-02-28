"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ()]/g, "_");
}

export async function createJobAttachmentUploadToken(input: {
  jobId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  caption?: string;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const cleanName = safeFileName(input.fileName);

  // Generate an id for path stability
  const attachmentId = crypto.randomUUID();
  const storagePath = `job/${input.jobId}/${attachmentId}-${cleanName}`;

  // 1) Insert DB row FIRST (required by our storage policy)
  const { error: insErr } = await supabase.from("attachments").insert({
    id: attachmentId,
    entity_type: "job",
    entity_id: input.jobId,
    bucket: "attachments",
    storage_path: storagePath,
    file_name: cleanName,
    content_type: input.contentType,
    file_size: input.fileSize,
    caption: input.caption ?? null,
  });

  if (insErr) throw new Error(insErr.message);

  // 2) Create signed upload token/url for client upload
  const { data, error: upErr } = await supabase.storage
    .from("attachments")
    .createSignedUploadUrl(storagePath);

  if (upErr) throw new Error(upErr.message);

  return {
    attachmentId,
    bucket: "attachments",
    path: storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export async function revalidatePortalJob(jobId: string) {
  revalidatePath(`/portal/jobs/${jobId}`);
}