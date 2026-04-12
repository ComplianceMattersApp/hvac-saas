"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { insertInternalNotificationForEvent } from "@/lib/actions/notification-actions";

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ()]/g, "_");
}

type AttachmentStorageRow = {
  id: string;
  bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
};

async function assertJobAttachmentUploadAuthority(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  jobId: string;
}) {
  const { supabase, userId, jobId } = input;

  const { data: contractorUser, error: contractorUserErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (contractorUserErr) throw contractorUserErr;

  if (contractorUser?.contractor_id) {
    const { data: ownedJob, error: ownedJobErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .eq("contractor_id", contractorUser.contractor_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (ownedJobErr) throw ownedJobErr;
    if (!ownedJob?.id) throw new Error("Not authorized to upload attachment for this job");
    return { actorType: "contractor" as const };
  }

  await requireInternalUser({ supabase, userId });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found");

  return { actorType: "internal" as const };
}

async function cleanupJobAttachmentRows(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  adminClient: ReturnType<typeof createAdminClient>;
  jobId: string;
  attachmentIds: string[];
}) {
  const { supabase, adminClient, jobId } = input;
  const attachmentIds = input.attachmentIds.map((value) => String(value ?? "").trim()).filter(Boolean);

  if (!attachmentIds.length) return;

  const { data: attachmentRows, error: attachmentErr } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .in("id", attachmentIds);

  if (attachmentErr) throw attachmentErr;

  const storagePathsByBucket = new Map<string, string[]>();

  for (const row of (attachmentRows ?? []) as AttachmentStorageRow[]) {
    const bucket = String(row.bucket ?? "").trim();
    const storagePath = String(row.storage_path ?? "").trim().replace(/^\/+/, "");

    if (!bucket || !storagePath) continue;
    if (!storagePathsByBucket.has(bucket)) storagePathsByBucket.set(bucket, []);
    storagePathsByBucket.get(bucket)?.push(storagePath);
  }

  for (const [bucket, storagePaths] of storagePathsByBucket.entries()) {
    const uniquePaths = Array.from(new Set(storagePaths));
    if (!uniquePaths.length) continue;
    await adminClient.storage.from(bucket).remove(uniquePaths);
  }

  const { error: deleteErr } = await supabase
    .from("attachments")
    .delete()
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .in("id", attachmentIds);

  if (deleteErr) throw deleteErr;
}

async function loadVerifiedJobAttachments(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  adminClient: ReturnType<typeof createAdminClient>;
  jobId: string;
  attachmentIds: string[];
}) {
  const { supabase, adminClient, jobId } = input;
  const attachmentIds = Array.from(
    new Set(input.attachmentIds.map((value) => String(value ?? "").trim()).filter(Boolean))
  );

  if (!attachmentIds.length) return [] as AttachmentStorageRow[];

  const { data: attachmentRows, error: attachmentErr } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .in("id", attachmentIds);

  if (attachmentErr) throw attachmentErr;

  const invalidIds: string[] = [];
  const verifiedRows: AttachmentStorageRow[] = [];

  for (const row of (attachmentRows ?? []) as AttachmentStorageRow[]) {
    const bucket = String(row.bucket ?? "").trim();
    const storagePath = String(row.storage_path ?? "").trim().replace(/^\/+/, "");

    if (!bucket || !storagePath) {
      invalidIds.push(row.id);
      continue;
    }

    const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) {
      invalidIds.push(row.id);
      continue;
    }

    verifiedRows.push({
      ...row,
      bucket,
      storage_path: storagePath,
    });
  }

  if (invalidIds.length) {
    await cleanupJobAttachmentRows({
      supabase,
      adminClient,
      jobId,
      attachmentIds: invalidIds,
    });
  }

  return verifiedRows;
}

function revalidateInternalAttachmentConsumers(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/attachments`);
  revalidatePath("/ops");
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

  await assertJobAttachmentUploadAuthority({
    supabase,
    userId: userData.user.id,
    jobId: input.jobId,
  });

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

  // 2) Create signed upload token/url for client upload using admin client
  // Ownership already verified above; use service-role to bypass storage RLS
  const adminClient = createAdminClient();
  const { data, error: upErr } = await adminClient.storage
    .from("attachments")
    .createSignedUploadUrl(storagePath);

  if (upErr) {
    await cleanupJobAttachmentRows({
      supabase,
      adminClient,
      jobId: input.jobId,
      attachmentIds: [attachmentId],
    });
    throw new Error(upErr.message);
  }

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

export async function discardInternalJobAttachmentUpload(input: {
  jobId: string;
  attachmentId: string;
}) {
  const jobId = String(input.jobId ?? "").trim();
  const attachmentId = String(input.attachmentId ?? "").trim();

  if (!jobId) throw new Error("Missing jobId");
  if (!attachmentId) throw new Error("Missing attachmentId");

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("Not authenticated");

  await requireInternalUser({ supabase, userId: user.id });

  await cleanupJobAttachmentRows({
    supabase,
    adminClient,
    jobId,
    attachmentIds: [attachmentId],
  });
}

export async function finalizeInternalJobAttachmentUpload(input: {
  jobId: string;
  note?: string;
  caption?: string;
  fileNames?: string[];
  attachmentIds?: string[];
}) {
  const jobId = String(input.jobId ?? "").trim();

  if (!jobId) throw new Error("Missing jobId");

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("Not authenticated");

  await requireInternalUser({ supabase, userId: user.id });

  const note = String(input.note ?? "").trim();
  const caption = String(input.caption ?? "").trim();
  const requestedAttachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const verifiedAttachments = await loadVerifiedJobAttachments({
    supabase,
    adminClient,
    jobId,
    attachmentIds: requestedAttachmentIds,
  });

  if (!verifiedAttachments.length) {
    throw new Error("Uploaded attachments could not be finalized.");
  }

  const verifiedAttachmentIds = verifiedAttachments.map((attachment) => attachment.id);
  const verifiedFileNames = Array.isArray(input.fileNames)
    ? input.fileNames.map((value) => String(value ?? "").trim()).filter(Boolean)
    : verifiedAttachments.map((attachment) => String(attachment.file_name ?? "").trim()).filter(Boolean);

  const { error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "attachment_added",
    user_id: user.id,
    meta: {
      source: "internal",
      count: verifiedAttachmentIds.length,
      note: note || null,
      caption: caption || null,
      attachment_ids: verifiedAttachmentIds,
      file_names: verifiedFileNames,
    },
  });

  if (evErr) throw new Error(evErr.message);

  revalidateInternalAttachmentConsumers(jobId);

  return {
    count: verifiedAttachmentIds.length,
    attachmentIds: verifiedAttachmentIds,
  };
}

export async function finalizePortalAttachmentSubmission(input: {
  jobId: string;
  intent: "upload" | "review";
  note?: string;
  caption?: string;
  fileNames?: string[];
  attachmentIds?: string[];
}) {
  const supabase = await createClient();
  const notificationAdmin = createAdminClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("Not authenticated");

  const { data: contractorUser, error: contractorUserErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (contractorUserErr) throw contractorUserErr;

  const contractorId = String(contractorUser?.contractor_id ?? "").trim();
  if (!contractorId) {
    throw new Error("Only contractor users can submit portal updates.");
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, contractor_id, job_type, ops_status")
    .eq("id", input.jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id) throw new Error("Job not found.");

  if (String(job.contractor_id ?? "") !== contractorId) {
    throw new Error("You do not have access to this job.");
  }

  const note = String(input.note ?? "").trim();
  const caption = String(input.caption ?? "").trim();
  const fileNames = Array.isArray(input.fileNames)
    ? input.fileNames.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
  const attachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];

  if (!note && attachmentIds.length === 0) {
    return;
  }

  if (input.intent === "review") {
    const jobType = String(job.job_type ?? "").trim().toLowerCase();
    const opsStatus = String(job.ops_status ?? "").trim().toLowerCase();

    if (jobType !== "ecc" || opsStatus !== "failed") {
      throw new Error("Correction review submission is only available for failed ECC jobs.");
    }

    const { error: evErr } = await supabase.from("job_events").insert({
      job_id: input.jobId,
      event_type: "contractor_correction_submission",
      user_id: user.id,
      meta: {
        note: note || null,
        attachment_ids: attachmentIds,
        caption: caption || null,
        file_names: fileNames,
      },
    });

    if (evErr) throw evErr;

    const { data: reviewMarked, error: rpcErr } = await supabase.rpc(
      "mark_job_needs_internal_review",
      { p_job_id: input.jobId }
    );

    if (rpcErr) throw rpcErr;
    if (!reviewMarked) {
      throw new Error("Could not submit correction review for this job.");
    }

    await insertInternalNotificationForEvent({
      supabase: notificationAdmin,
      jobId: input.jobId,
      eventType: "contractor_note",
      actorUserId: user.id,
    });

    return;
  }

  const { error: noteErr } = await supabase.from("job_events").insert({
    job_id: input.jobId,
    event_type: "contractor_note",
    user_id: user.id,
    meta: {
      note: note || null,
      attachment_ids: attachmentIds,
      caption: caption || null,
      file_names: fileNames,
    },
  });

  if (noteErr) throw noteErr;

  await insertInternalNotificationForEvent({
    supabase: notificationAdmin,
    jobId: input.jobId,
    eventType: "contractor_note",
    actorUserId: user.id,
  });
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