"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import {
  loadScopedInternalAttachmentJobForMutation,
  loadScopedInternalJobAttachmentForMutation,
  loadScopedInternalJobAttachmentsForMutation,
} from "@/lib/auth/internal-attachment-scope";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { insertInternalNotificationForEvent } from "@/lib/actions/notification-actions";
import { notifyContractorOfSharedJobUpdate } from "@/lib/notifications/contractor-shared-job-update";
import {
  buildAttachmentCaptionWithEvidenceContext,
  isEquipmentLabelPhotoCaption,
  isRefrigerantChargeEvidenceCaption,
  normalizeJobAttachmentEvidenceContext,
  parseEquipmentLabelPhotoCaption,
} from "@/lib/jobs/refrigerant-charge-evidence";
import {
  inferAttachmentContentType,
  JOB_ATTACHMENT_MAX_PER_JOB,
  normalizeAttachmentContentType,
  safeAttachmentFileName,
  validateJobAttachmentMetadata,
} from "@/lib/attachments/attachment-upload-policy";

type AttachmentStorageRow = {
  id: string;
  bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  content_type?: string | null;
  file_size?: number | null;
  caption?: string | null;
};

function sanitizeAttachmentCaption(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, 160);
}

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

  const { internalUser } = await requireInternalUser({ supabase, userId });

  const scopedJob = await loadScopedInternalAttachmentJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedJob?.id) {
    throw new Error("Not authorized to upload attachment for this job");
  }

  return {
    actorType: "internal" as const,
    accountOwnerUserId: internalUser.account_owner_user_id,
  };
}

async function requireOperationalAttachmentEntitlementAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
  });

  if (!access.authorized) {
    const search = new URLSearchParams({
      err: "entitlement_blocked",
      reason: access.reason,
    });
    redirect(`/ops/admin/company-profile?${search.toString()}`);
  }
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

  // Row first, object second. If the object removal fails we are left with an
  // unreferenced blob (cheap, sweepable); the reverse order would leave a row
  // pointing at nothing, which renders as a permanently broken attachment.
  const { error: deleteErr } = await supabase
    .from("attachments")
    .delete()
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .in("id", attachmentIds);

  if (deleteErr) throw deleteErr;

  for (const [bucket, storagePaths] of storagePathsByBucket.entries()) {
    const uniquePaths = Array.from(new Set(storagePaths));
    if (!uniquePaths.length) continue;

    const { error: removeErr } = await adminClient.storage.from(bucket).remove(uniquePaths);
    if (removeErr) {
      console.error("job_attachment_storage_cleanup_failed", {
        jobId,
        bucket,
        pathCount: uniquePaths.length,
        error: removeErr instanceof Error ? removeErr.message : "Unknown storage cleanup error",
      });
    }
  }
}

/**
 * Read the object's real size and content type back out of storage.
 * Returns null when no object exists at that path.
 */
async function describeStoredAttachmentObject(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  bucket: string;
  storagePath: string;
}) {
  const lastSlash = input.storagePath.lastIndexOf("/");
  const prefix = lastSlash > 0 ? input.storagePath.slice(0, lastSlash) : "";
  const objectName = input.storagePath.slice(lastSlash + 1);

  if (!objectName) return null;

  const { data, error } = await input.adminClient.storage
    .from(input.bucket)
    .list(prefix, { limit: 100, search: objectName });

  if (error) return null;

  const match = (data ?? []).find(
    (entry: { name?: unknown }) => String(entry?.name ?? "") === objectName,
  ) as { metadata?: { size?: unknown; mimetype?: unknown } } | undefined;

  if (!match) return null;

  const size = Number(match.metadata?.size);

  return {
    fileSize: Number.isFinite(size) && size > 0 ? size : null,
    contentType: normalizeAttachmentContentType(match.metadata?.mimetype) || null,
  };
}

/**
 * Confirm every requested attachment actually landed in storage, and reconcile
 * the row against the object that is really there.
 *
 * The upload token is issued from client-declared metadata, so `file_size` and
 * `content_type` are claims until this point. Anything that never uploaded,
 * overshot the size limit, or arrived as a disallowed type is removed rather
 * than finalized.
 */
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
    .select("id, bucket, storage_path, file_name, content_type, file_size")
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

    const stored = await describeStoredAttachmentObject({ adminClient, bucket, storagePath });
    if (!stored) {
      invalidIds.push(row.id);
      continue;
    }

    const resolvedContentType = inferAttachmentContentType({
      fileName: String(row.file_name ?? ""),
      declaredContentType: stored.contentType ?? row.content_type,
    });

    const policyError = validateJobAttachmentMetadata({
      fileName: String(row.file_name ?? ""),
      contentType: resolvedContentType,
      fileSize: stored.fileSize ?? row.file_size,
    });

    if (policyError) {
      console.warn("job_attachment_rejected_after_upload", {
        jobId,
        attachmentId: row.id,
        reason: policyError,
        storedFileSize: stored.fileSize,
        storedContentType: stored.contentType,
      });
      invalidIds.push(row.id);
      continue;
    }

    // Replace the client's claim with what storage actually holds.
    const reconciled: Record<string, unknown> = {};
    if (stored.fileSize != null && stored.fileSize !== Number(row.file_size)) {
      reconciled.file_size = stored.fileSize;
    }
    if (resolvedContentType && resolvedContentType !== String(row.content_type ?? "")) {
      reconciled.content_type = resolvedContentType;
    }

    if (Object.keys(reconciled).length) {
      const { error: reconcileErr } = await supabase
        .from("attachments")
        .update(reconciled)
        .eq("id", row.id)
        .eq("entity_type", "job")
        .eq("entity_id", jobId);

      if (reconcileErr) {
        console.warn("job_attachment_metadata_reconcile_failed", {
          jobId,
          attachmentId: row.id,
          error: reconcileErr.message,
        });
      }
    }

    verifiedRows.push({
      ...row,
      bucket,
      storage_path: storagePath,
      file_size: stored.fileSize ?? row.file_size ?? null,
      content_type: resolvedContentType || row.content_type || null,
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
  attachmentEvidenceContext?: string | null;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const authority = await assertJobAttachmentUploadAuthority({
    supabase,
    userId: userData.user.id,
    jobId: input.jobId,
  });

  if (authority.actorType === "internal") {
    await requireOperationalAttachmentEntitlementAccessOrRedirect({
      supabase,
      accountOwnerUserId: authority.accountOwnerUserId,
    });
  }

  const cleanName = safeAttachmentFileName(input.fileName);
  const contentType = inferAttachmentContentType({
    fileName: cleanName,
    declaredContentType: input.contentType,
  });
  const fileSize = Number(input.fileSize);

  const metadataError = validateJobAttachmentMetadata({
    fileName: cleanName,
    contentType,
    fileSize,
  });

  if (metadataError) throw new Error(metadataError);

  const { count: existingAttachmentCount, error: countErr } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "job")
    .eq("entity_id", input.jobId);

  if (countErr) throw countErr;

  if (Number(existingAttachmentCount ?? 0) >= JOB_ATTACHMENT_MAX_PER_JOB) {
    throw new Error(`A job can hold up to ${JOB_ATTACHMENT_MAX_PER_JOB} attachments.`);
  }

  const attachmentEvidenceContext = normalizeJobAttachmentEvidenceContext(
    input.attachmentEvidenceContext,
  );
  const normalizedCaption = buildAttachmentCaptionWithEvidenceContext({
    caption: input.caption,
    context: attachmentEvidenceContext,
  });

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
    content_type: contentType,
    file_size: fileSize,
    caption: normalizedCaption,
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
    contentType,
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

  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });

  const scopedAttachment = await loadScopedInternalJobAttachmentForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    attachmentId,
  });

  if (!scopedAttachment?.attachment) {
    throw new Error("Not authorized to discard attachment for this job");
  }

  await requireOperationalAttachmentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  await cleanupJobAttachmentRows({
    supabase,
    adminClient,
    jobId,
    attachmentIds: [attachmentId],
  });
}

export async function updateInternalJobAttachmentCaption(input: {
  jobId: string;
  attachmentId: string;
  caption?: string | null;
}) {
  const jobId = String(input.jobId ?? "").trim();
  const attachmentId = String(input.attachmentId ?? "").trim();

  if (!jobId) throw new Error("Missing jobId");
  if (!attachmentId) throw new Error("Missing attachmentId");

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("Not authenticated");

  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });
  const scopedAttachment = await loadScopedInternalJobAttachmentForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    attachmentId,
    attachmentSelect: "file_name, caption",
  });

  if (!scopedAttachment?.attachment) {
    throw new Error("Not authorized to update attachment title for this job");
  }

  await requireOperationalAttachmentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const attachment = scopedAttachment.attachment as {
    file_name?: string | null;
    caption?: string | null;
  };
  const previousCaption = sanitizeAttachmentCaption(attachment.caption);
  const requestedCaption = sanitizeAttachmentCaption(input.caption);
  const shouldPreserveRefrigerantEvidenceContext = isRefrigerantChargeEvidenceCaption(previousCaption);
  const shouldPreserveEquipmentLabelContext = isEquipmentLabelPhotoCaption(previousCaption);
  const previousEquipmentLabelContext = shouldPreserveEquipmentLabelContext
    ? parseEquipmentLabelPhotoCaption(previousCaption)
    : null;
  const normalizedCaption = shouldPreserveRefrigerantEvidenceContext
    ? buildAttachmentCaptionWithEvidenceContext({
        caption: requestedCaption,
        context: "refrigerant_charge_photo",
      })
    : shouldPreserveEquipmentLabelContext
      ? buildAttachmentCaptionWithEvidenceContext({
          caption: [
            previousEquipmentLabelContext?.equipmentId
              ? `[equipment-id:${previousEquipmentLabelContext.equipmentId}]`
              : "",
            previousEquipmentLabelContext?.systemId
              ? `[system-id:${previousEquipmentLabelContext.systemId}]`
              : "",
            requestedCaption,
          ].filter(Boolean).join(" "),
          context: "equipment_label_photo",
        })
      : requestedCaption;

  if (previousCaption === normalizedCaption) {
    return {
      attachmentId,
      caption: normalizedCaption,
    };
  }

  const { error: updateErr } = await supabase
    .from("attachments")
    .update({ caption: normalizedCaption })
    .eq("id", attachmentId)
    .eq("entity_type", "job")
    .eq("entity_id", jobId);

  if (updateErr) throw new Error(updateErr.message);

  const nextLabel = normalizedCaption ?? "Untitled";
  const previousLabel = previousCaption ?? "Untitled";
  const fileName = String(attachment.file_name ?? "Attachment").trim() || "Attachment";

  const { error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "attachment_title_updated",
    user_id: user.id,
    message: `Attachment title updated to \"${nextLabel}\"`,
    meta: {
      source: "internal",
      attachment_ids: [attachmentId],
      file_names: [fileName],
      note: nextLabel,
      previous_caption: previousLabel,
      caption: normalizedCaption,
    },
  });

  if (evErr) throw new Error(evErr.message);

  revalidateInternalAttachmentConsumers(jobId);

  return {
    attachmentId,
    caption: normalizedCaption,
  };
}

export async function deleteInternalJobAttachment(input: {
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

  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });

  const scopedAttachment = await loadScopedInternalJobAttachmentForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    attachmentId,
    attachmentSelect: "file_name, caption",
  });

  if (!scopedAttachment?.attachment) {
    throw new Error("Not authorized to delete attachment for this job");
  }

  await requireOperationalAttachmentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const attachment = scopedAttachment.attachment as {
    file_name?: string | null;
    caption?: string | null;
  };
  const caption = sanitizeAttachmentCaption(attachment.caption);
  const fileName = String(attachment.file_name ?? "Attachment").trim() || "Attachment";

  await cleanupJobAttachmentRows({
    supabase,
    adminClient,
    jobId,
    attachmentIds: [attachmentId],
  });

  const removedLabel = caption || fileName;
  const { error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "attachment_deleted",
    user_id: user.id,
    message: `Attachment deleted: ${removedLabel}`,
    meta: {
      source: "internal",
      attachment_ids: [attachmentId],
      file_names: [fileName],
      note: removedLabel,
      caption,
    },
  });

  if (evErr) throw new Error(evErr.message);

  revalidateInternalAttachmentConsumers(jobId);

  return {
    attachmentId,
  };
}

export async function finalizeInternalJobAttachmentUpload(input: {
  jobId: string;
  note?: string;
  caption?: string;
  fileNames?: string[];
  attachmentIds?: string[];
  attachmentEvidenceContext?: string | null;
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

  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });

  const note = String(input.note ?? "").trim();
  const caption = String(input.caption ?? "").trim();
  const attachmentEvidenceContext = normalizeJobAttachmentEvidenceContext(
    input.attachmentEvidenceContext,
  );
  const requestedAttachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const scopedAttachments = await loadScopedInternalJobAttachmentsForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    attachmentIds: requestedAttachmentIds,
  });

  if (!scopedAttachments?.job) {
    throw new Error("Not authorized to finalize attachments for this job");
  }

  await requireOperationalAttachmentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

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
      attachment_evidence_context: attachmentEvidenceContext,
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
  const attachmentIds = Array.from(new Set(
    Array.isArray(input.attachmentIds)
      ? input.attachmentIds.map((v) => String(v ?? "").trim()).filter(Boolean)
      : [],
  ));

  if (!note && attachmentIds.length === 0) {
    return;
  }

  // The ids arrive from the browser; confirm each one really belongs to this
  // job before it is recorded on the timeline as this contractor's upload.
  if (attachmentIds.length) {
    const { data: ownedAttachments, error: ownedAttachmentsErr } = await supabase
      .from("attachments")
      .select("id")
      .eq("entity_type", "job")
      .eq("entity_id", input.jobId)
      .in("id", attachmentIds);

    if (ownedAttachmentsErr) throw ownedAttachmentsErr;

    if ((ownedAttachments ?? []).length !== attachmentIds.length) {
      throw new Error("One or more uploads could not be attached to this job.");
    }
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
      supabase,
      jobId: input.jobId,
      eventType: "contractor_correction_submission",
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
    supabase,
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

  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });

  const scopedAttachment = await loadScopedInternalJobAttachmentForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    attachmentId,
    attachmentSelect: "file_name",
  });

  if (!scopedAttachment?.attachment) {
    throw new Error("Not authorized to share attachment for this job");
  }

  await requireOperationalAttachmentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const attachment = scopedAttachment.attachment as {
    id: string;
    file_name?: string | null;
  };

  const fallbackNote = `Shared file: ${String(attachment.file_name ?? "Attachment")}`;

  const { data: event, error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "public_note",
    user_id: user.id,
    meta: {
      note: note || fallbackNote,
      attachment_ids: [attachmentId],
      file_names: [String(attachment.file_name ?? "")],
      source: "internal_share",
    },
  }).select("id").single();

  if (evErr) throw evErr;

  try {
    await notifyContractorOfSharedJobUpdate({
      admin: createAdminClient(),
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      eventId: String(event?.id ?? ""),
      note: note || fallbackNote,
      fileNames: [String(attachment.file_name ?? "")],
    });
  } catch (error) {
    console.error("contractor_attachment_share_email_failed", {
      jobId,
      attachmentId,
      error: error instanceof Error ? error.message : "Unknown email error",
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");
}

export async function shareJobAttachmentsToContractor(input: {
  jobId: string;
  attachmentIds: string[];
  note?: string;
}) {
  const jobId = String(input.jobId ?? "").trim();
  const attachmentIds = Array.from(new Set(
    (input.attachmentIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean),
  ));
  const note = String(input.note ?? "").trim();
  if (!jobId) throw new Error("Missing jobId");
  if (!attachmentIds.length) throw new Error("Select at least one attachment");

  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("Not authenticated");
  const { internalUser } = await requireInternalUser({ supabase, userId: user.id });
  const scoped = await loadScopedInternalJobAttachmentsForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    attachmentIds,
    attachmentSelect: "file_name",
  });
  if (!scoped?.job || scoped.attachments.length !== attachmentIds.length) {
    throw new Error("Not authorized to share one or more selected attachments");
  }
  await requireOperationalAttachmentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const fileNames = scoped.attachments.map((attachment: { file_name?: unknown }) => String(attachment?.file_name ?? ""));
  const { data: event, error: evErr } = await supabase.from("job_events").insert({
    job_id: jobId,
    event_type: "public_note",
    user_id: user.id,
    meta: {
      note: note || `Shared ${attachmentIds.length} attachments`,
      attachment_ids: attachmentIds,
      file_names: fileNames,
      source: "internal_share",
    },
  }).select("id").single();
  if (evErr) throw evErr;
  try {
    await notifyContractorOfSharedJobUpdate({
      admin: createAdminClient(),
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      eventId: String(event?.id ?? ""),
      note: note || null,
      fileNames,
    });
  } catch (error) {
    console.error("contractor_bulk_attachment_share_email_failed", {
      jobId,
      attachmentCount: attachmentIds.length,
      error: error instanceof Error ? error.message : "Unknown email error",
    });
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");
  return { count: attachmentIds.length };
}
