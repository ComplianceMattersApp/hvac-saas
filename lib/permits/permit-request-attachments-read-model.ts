import { requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isPermitRequestSchemaUnavailableError, PermitRequestReadModelError } from "./permit-requests-read-model";

type RawAttachmentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string | null;
};

export type PermitRequestAttachmentLink = {
  id: string;
  permitRequestId: string;
  fileName: string;
  contentType: string | null;
  fileSize: number | null;
  caption: string | null;
  createdAt: string | null;
  signedUrl: string | null;
};

export type PermitRequestAttachmentReadResult = {
  schemaAvailable: boolean;
  attachmentsByPermitRequestId: Record<string, PermitRequestAttachmentLink[]>;
};

function getUniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function isUnavailableError(error: unknown) {
  return isPermitRequestSchemaUnavailableError(error);
}

function normalizeStoragePath(value: unknown) {
  return String(value ?? "").trim().replace(/^\/+/, "");
}

export async function listInternalPermitRequestAttachmentsForAccount(params: {
  accountOwnerUserId: string;
  permitRequestIds: string[];
  admin?: any;
  expiresInSeconds?: number;
}): Promise<PermitRequestAttachmentReadResult> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const permitRequestIds = getUniqueIds(params.permitRequestIds);

  if (!accountOwnerUserId || !permitRequestIds.length) {
    return { schemaAvailable: true, attachmentsByPermitRequestId: {} };
  }

  const admin = params.admin ?? createAdminClient();

  try {
    const { data: scopedRequests, error: requestErr } = await admin
      .from("permit_requests")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .in("id", permitRequestIds)
      .limit(permitRequestIds.length);

    if (requestErr) throw requestErr;

    const scopedIds = getUniqueIds((scopedRequests ?? []).map((row: { id?: unknown }) => String(row?.id ?? "")));
    if (!scopedIds.length) {
      return { schemaAvailable: true, attachmentsByPermitRequestId: {} };
    }

    const { data: attachmentRows, error: attachmentErr } = await admin
      .from("attachments")
      .select("id, entity_type, entity_id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
      .eq("entity_type", "permit_request")
      .in("entity_id", scopedIds)
      .order("created_at", { ascending: true });

    if (attachmentErr) throw attachmentErr;

    const attachmentsByPermitRequestId: Record<string, PermitRequestAttachmentLink[]> = {};
    for (const row of (attachmentRows ?? []) as RawAttachmentRow[]) {
      if (row.entity_type !== "permit_request" || !scopedIds.includes(String(row.entity_id))) continue;

      const bucket = String(row.bucket ?? "").trim();
      const storagePath = normalizeStoragePath(row.storage_path);
      let signedUrl: string | null = null;

      if (bucket && storagePath) {
        const { data: signedData, error: signedErr } = await admin.storage
          .from(bucket)
          .createSignedUrl(storagePath, params.expiresInSeconds ?? 60 * 60);

        signedUrl = signedErr ? null : String((signedData as { signedUrl?: unknown } | null)?.signedUrl ?? "").trim() || null;
      }

      const permitRequestId = String(row.entity_id);
      if (!attachmentsByPermitRequestId[permitRequestId]) attachmentsByPermitRequestId[permitRequestId] = [];
      attachmentsByPermitRequestId[permitRequestId].push({
        id: String(row.id),
        permitRequestId,
        fileName: String(row.file_name ?? "").trim() || "Attachment",
        contentType: String(row.content_type ?? "").trim() || null,
        fileSize: typeof row.file_size === "number" ? row.file_size : null,
        caption: String(row.caption ?? "").trim() || null,
        createdAt: String(row.created_at ?? "").trim() || null,
        signedUrl,
      });
    }

    return {
      schemaAvailable: true,
      attachmentsByPermitRequestId,
    };
  } catch (error) {
    if (isUnavailableError(error)) {
      return { schemaAvailable: false, attachmentsByPermitRequestId: {} };
    }

    throw new PermitRequestReadModelError("Failed to load permit request attachments.", error);
  }
}

export async function listCurrentInternalPermitRequestAttachments(params: {
  permitRequestIds: string[];
  supabase?: any;
  admin?: any;
  expiresInSeconds?: number;
}) {
  const supabase = params.supabase ?? (await createClient());
  const { internalUser } = await requireInternalUser({ supabase });

  return listInternalPermitRequestAttachmentsForAccount({
    accountOwnerUserId: internalUser.account_owner_user_id,
    permitRequestIds: params.permitRequestIds,
    admin: params.admin,
    expiresInSeconds: params.expiresInSeconds,
  });
}
