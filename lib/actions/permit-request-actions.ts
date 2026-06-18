"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireCurrentContractorPortalContext } from "@/lib/portal/intake-proposal-read-model";
import { isPermitRequestSchemaUnavailableError } from "@/lib/permits/permit-requests-read-model";
import {
  CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT,
  CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_FILE_SIZE_BYTES,
} from "@/lib/permits/contractor-permit-request-upload-limits";
import {
  assertPermitWorkflowEnabledForAccountOwner,
  isPermitWorkflowEnabledForAccountOwner,
} from "@/lib/permits/permit-workflow-gate";

export type ContractorPermitRequestUploadDraft = {
  attachmentId: string;
  path: string;
  fileName: string;
  contentType: string;
  fileSize: number;
};

const CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
]);

function safePermitRequestAttachmentFileName(raw: string) {
  const cleaned = String(raw ?? "").trim().replace(/[^\w.\- ()]/g, "_");
  return cleaned || "permit-upload";
}

function parseFileExtension(fileName: string) {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  if (!normalized.includes(".")) return "";
  const parts = normalized.split(".");
  return String(parts.at(-1) ?? "").trim();
}

function normalizeContentType(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function sanitizeContractorPermitRequestNote(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 4000) : null;
}

function validateContractorPermitRequestAttachmentMetadata(input: {
  fileName: string;
  contentType: string;
  fileSize: number;
}) {
  const fileName = String(input.fileName ?? "").trim();
  const contentType = normalizeContentType(input.contentType);
  const fileSize = Number(input.fileSize ?? 0);
  const extension = parseFileExtension(fileName);

  if (!fileName) return "File name is required.";
  if (!Number.isFinite(fileSize) || fileSize <= 0) return "File is empty or invalid.";
  if (fileSize > CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return `File exceeds the ${Math.floor(CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB size limit.`;
  }

  const mimeAllowed = CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES.has(contentType);
  const extensionAllowed = CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension);

  if (!mimeAllowed || !extensionAllowed) {
    return "Only JPG, PNG, WEBP, and PDF files are allowed.";
  }

  return null;
}

async function assertPermitRequestSchemaAvailable(admin: any) {
  const { error } = await admin
    .from("permit_requests")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (!error) return true;
  if (isPermitRequestSchemaUnavailableError(error)) return false;
  throw error;
}

export async function getContractorPermitRequestSurfaceAvailability(input?: {
  supabase?: any;
  admin?: any;
}) {
  const supabase = input?.supabase ?? (await createClient());
  const admin = input?.admin ?? createAdminClient();

  const context = await requireCurrentContractorPortalContext({ supabase });
  if (!isPermitWorkflowEnabledForAccountOwner(context.accountOwnerUserId)) {
    return {
      schemaAvailable: false,
    };
  }

  return {
    schemaAvailable: await assertPermitRequestSchemaAvailable(admin),
  };
}

export async function createContractorPermitRequestUploadToken(input: {
  fileName: string;
  contentType: string;
  fileSize: number;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const context = await requireCurrentContractorPortalContext({ supabase });
  assertPermitWorkflowEnabledForAccountOwner(context.accountOwnerUserId);

  const schemaAvailable = await assertPermitRequestSchemaAvailable(admin);
  if (!schemaAvailable) {
    throw new Error("Permit requests are temporarily unavailable.");
  }

  const fileName = safePermitRequestAttachmentFileName(input.fileName);
  const contentType = normalizeContentType(input.contentType);
  const fileSize = Number(input.fileSize ?? 0);

  const metadataError = validateContractorPermitRequestAttachmentMetadata({
    fileName,
    contentType,
    fileSize,
  });
  if (metadataError) throw new Error(metadataError);

  const attachmentId = crypto.randomUUID();
  const storagePath = `permit-requests/staged/${context.contractorId}/${attachmentId}-${fileName}`;

  const { data: signedUploadData, error: signedUploadErr } = await admin.storage
    .from("attachments")
    .createSignedUploadUrl(storagePath);

  if (signedUploadErr) {
    throw new Error("Could not prepare file upload. Please try again.");
  }

  const token = String((signedUploadData as { token?: unknown } | null)?.token ?? "").trim();
  const path = String((signedUploadData as { path?: unknown } | null)?.path ?? storagePath).trim();
  if (!token || !path) {
    throw new Error("Could not prepare file upload. Please try again.");
  }

  return {
    attachmentId,
    token,
    path,
    bucket: "attachments",
    fileName,
    contentType,
    fileSize,
  };
}

export async function finalizeContractorPermitRequest(input: {
  uploads: ContractorPermitRequestUploadDraft[];
  note?: string | null;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const context = await requireCurrentContractorPortalContext({ supabase });
  assertPermitWorkflowEnabledForAccountOwner(context.accountOwnerUserId);

  const schemaAvailable = await assertPermitRequestSchemaAvailable(admin);
  if (!schemaAvailable) {
    throw new Error("Permit requests are temporarily unavailable.");
  }

  const accountOwnerUserId = context.accountOwnerUserId;
  const uploads = Array.isArray(input.uploads)
    ? input.uploads.map((item) => ({
        attachmentId: String(item?.attachmentId ?? "").trim(),
        path: String(item?.path ?? "").trim(),
        fileName: safePermitRequestAttachmentFileName(String(item?.fileName ?? "")),
        contentType: normalizeContentType(item?.contentType),
        fileSize: Number(item?.fileSize ?? 0),
      }))
    : [];

  if (!uploads.length) {
    throw new Error("Select at least one file to upload.");
  }

  if (uploads.length > CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT) {
    throw new Error(`You can upload up to ${CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT} files per permit request.`);
  }

  const uniqueById = new Map<string, ContractorPermitRequestUploadDraft>();
  const expectedPrefix = `permit-requests/staged/${context.contractorId}/`;
  for (const upload of uploads) {
    if (!upload.attachmentId) throw new Error("Upload session is missing attachmentId.");

    const expectedPath = `${expectedPrefix}${upload.attachmentId}-${upload.fileName}`;
    if (!upload.path || upload.path !== expectedPath) {
      throw new Error("Upload session is invalid for this permit request.");
    }

    const metadataError = validateContractorPermitRequestAttachmentMetadata({
      fileName: upload.fileName,
      contentType: upload.contentType,
      fileSize: upload.fileSize,
    });
    if (metadataError) throw new Error(metadataError);

    uniqueById.set(upload.attachmentId, upload);
  }

  const dedupedUploads = Array.from(uniqueById.values());

  for (const upload of dedupedUploads) {
    const { data: signedUrlData, error: signedUrlErr } = await admin.storage
      .from("attachments")
      .createSignedUrl(upload.path, 60);

    const signedUrl = String((signedUrlData as { signedUrl?: unknown } | null)?.signedUrl ?? "").trim();
    if (signedUrlErr || !signedUrl) {
      throw new Error("Uploaded files could not be verified. Please try again.");
    }
  }

  const { data: permitRequestRow, error: requestInsertErr } = await admin
    .from("permit_requests")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      contractor_id: context.contractorId,
      status: "permit_request",
      contractor_note: sanitizeContractorPermitRequestNote(input.note),
      submitted_by_user_id: context.userId,
    })
    .select("id")
    .single();

  if (requestInsertErr) throw requestInsertErr;

  const permitRequestId = String((permitRequestRow as { id?: unknown } | null)?.id ?? "").trim();
  if (!permitRequestId) throw new Error("Permit request could not be created.");

  const { error: eventInsertErr } = await admin
    .from("permit_request_events")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      permit_request_id: permitRequestId,
      event_type: "permit_request_received",
      actor_user_id: context.userId,
      to_status: "permit_request",
      meta: {
        source: "contractor_portal",
        attachment_count: dedupedUploads.length,
      },
    });

  if (eventInsertErr) throw eventInsertErr;

  const attachmentRows = dedupedUploads.map((upload) => ({
    id: upload.attachmentId,
    entity_type: "permit_request",
    entity_id: permitRequestId,
    bucket: "attachments",
    storage_path: upload.path,
    file_name: upload.fileName,
    content_type: upload.contentType,
    file_size: upload.fileSize,
    caption: null,
  }));

  try {
    const { error: insertErr } = await admin.from("attachments").insert(attachmentRows);
    if (insertErr) throw insertErr;
  } catch (error) {
    const cleanupPaths = dedupedUploads.map((upload) => upload.path);
    const { error: cleanupErr } = await admin.storage.from("attachments").remove(cleanupPaths);
    if (cleanupErr) {
      console.error("permit_request_attachment_storage_cleanup_failed", {
        permitRequestId,
        error: cleanupErr instanceof Error ? cleanupErr.message : "Unknown storage cleanup error",
      });
    }

    console.error("permit_request_attachment_finalize_insert_failed", {
      permitRequestId,
      error: error instanceof Error ? error.message : "Unknown attachment insert error",
    });

    throw new Error("Permit request submitted, but files could not be attached. Compliance Matters will review it.");
  }

  revalidatePath("/portal");
  revalidatePath("/portal/permit-request");
  revalidatePath("/ops");

  return {
    permitRequestId,
    count: dedupedUploads.length,
    attachmentIds: dedupedUploads.map((upload) => upload.attachmentId),
  };
}
