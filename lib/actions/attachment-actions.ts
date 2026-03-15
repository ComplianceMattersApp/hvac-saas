"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";

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

export async function shareJobAttachmentToContractor(input: {
  jobId: string;
  attachmentId: string;
  note?: string;
}) {
  const jobId = String(input.jobId ?? "").trim();
  const attachmentId = String(input.attachmentId ?? "").trim();
  const note = String(input.note ?? "").trim();

  if (!jobId) throw new Error("Missing jobId");
  if (!attachmentId) throw new Error("Missing attachmentId");

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("Not authenticated");

  await requireInternalUser({ supabase, userId: user.id });

  const { data: attachment, error: attErr } = await supabase
    .from("attachments")
    .select("id, entity_type, entity_id, file_name")
    .eq("id", attachmentId)
    .maybeSingle();

  if (attErr) throw attErr;
  if (!attachment?.id) throw new Error("Attachment not found");

  if (
    String(attachment.entity_type ?? "") !== "job" ||
    String(attachment.entity_id ?? "") !== jobId
  ) {
    throw new Error("Attachment is not linked to this job");
  }

  const fallbackNote = `Shared file: ${String(attachment.file_name ?? "Attachment")}`;

  const { error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "public_note",
    user_id: user.id,
    meta: {
      note: note || fallbackNote,
      attachment_ids: [attachmentId],
      file_names: [String(attachment.file_name ?? "")],
      source: "internal_share",
    },
  });

  if (evErr) throw evErr;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");
}