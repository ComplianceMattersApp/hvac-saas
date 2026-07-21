export const REFRIGERANT_CHARGE_ATTACHMENT_TAG = "[refrigerant-charge-evidence]";
export const EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG = "[equipment-label-photo]";
export const DUCT_ASBESTOS_PHOTO_ATTACHMENT_TAG = "[duct-asbestos-photo]";

export type JobAttachmentEvidenceContext =
  | "refrigerant_charge_photo"
  | "equipment_label_photo"
  | "duct_asbestos_photo";

export type RefrigerantChargeEvidenceImageAttachment = {
  id: string;
  fileName: string;
  contentType: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  caption: string | null;
  signedUrl: string | null;
};

export type EquipmentLabelPhotoAttachment = RefrigerantChargeEvidenceImageAttachment & {
  equipmentId: string | null;
  systemId: string | null;
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeJobAttachmentEvidenceContext(
  value: unknown,
): JobAttachmentEvidenceContext | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "refrigerant_charge_photo") return "refrigerant_charge_photo";
  if (normalized === "equipment_label_photo") return "equipment_label_photo";
  if (normalized === "duct_asbestos_photo") return "duct_asbestos_photo";
  return null;
}

export function buildAttachmentCaptionWithEvidenceContext(params: {
  caption?: string | null;
  context?: JobAttachmentEvidenceContext | null;
}) {
  const context = normalizeJobAttachmentEvidenceContext(params.context);
  const normalizedCaption = normalizeWhitespace(String(params.caption ?? ""));

  if (!context) {
    return normalizedCaption || null;
  }

  const tag = context === "equipment_label_photo"
    ? EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG
    : context === "duct_asbestos_photo"
    ? DUCT_ASBESTOS_PHOTO_ATTACHMENT_TAG
    : REFRIGERANT_CHARGE_ATTACHMENT_TAG;

  if (normalizedCaption && normalizedCaption.toLowerCase().startsWith(tag)) {
    return normalizedCaption;
  }

  return normalizedCaption ? `${tag} ${normalizedCaption}` : tag;
}

export function isRefrigerantChargeEvidenceCaption(caption: unknown) {
  const normalized = normalizeWhitespace(String(caption ?? "")).toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith(REFRIGERANT_CHARGE_ATTACHMENT_TAG);
}

export function stripRefrigerantChargeEvidenceTag(caption: unknown) {
  const normalized = normalizeWhitespace(String(caption ?? ""));
  if (!normalized) return "";
  if (!isRefrigerantChargeEvidenceCaption(normalized)) return normalized;
  return normalizeWhitespace(normalized.slice(REFRIGERANT_CHARGE_ATTACHMENT_TAG.length));
}

export function isEquipmentLabelPhotoCaption(caption: unknown) {
  const normalized = normalizeWhitespace(String(caption ?? "")).toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith(EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG);
}

export function buildEquipmentLabelPhotoCaption(params: {
  equipmentId: string;
  systemId?: string | null;
  caption?: string | null;
}) {
  const equipmentId = normalizeWhitespace(String(params.equipmentId ?? ""));
  const systemId = normalizeWhitespace(String(params.systemId ?? ""));
  const caption = normalizeWhitespace(String(params.caption ?? ""));
  const tokens = [
    equipmentId ? `[equipment-id:${equipmentId}]` : "",
    systemId ? `[system-id:${systemId}]` : "",
    caption,
  ].filter(Boolean);

  return buildAttachmentCaptionWithEvidenceContext({
    context: "equipment_label_photo",
    caption: tokens.join(" "),
  });
}

export function parseEquipmentLabelPhotoCaption(caption: unknown) {
  const normalized = normalizeWhitespace(String(caption ?? ""));
  if (!isEquipmentLabelPhotoCaption(normalized)) {
    return { equipmentId: null, systemId: null, caption: normalized };
  }

  const body = normalizeWhitespace(normalized.slice(EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG.length));
  const equipmentId = body.match(/\[equipment-id:([^\]]+)\]/i)?.[1]?.trim() || null;
  const systemId = body.match(/\[system-id:([^\]]+)\]/i)?.[1]?.trim() || null;
  const displayCaption = normalizeWhitespace(
    body
      .replace(/\[equipment-id:[^\]]+\]/gi, "")
      .replace(/\[system-id:[^\]]+\]/gi, ""),
  );

  return {
    equipmentId,
    systemId,
    caption: displayCaption,
  };
}

export function isInlineReportImageAttachment(row: { content_type?: unknown }) {
  return String(row?.content_type ?? "").trim().toLowerCase().startsWith("image/");
}

export async function listJobDuctAsbestosPhotoImages(params: {
  supabase: any;
  admin: any;
  jobId: string;
  limit?: number;
}): Promise<RefrigerantChargeEvidenceImageAttachment[]> {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) return [];

  const { data: evidenceRows, error: evidenceErr } = await params.supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .ilike("caption", `${DUCT_ASBESTOS_PHOTO_ATTACHMENT_TAG}%`)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 20);

  if (evidenceErr) throw evidenceErr;

  return Promise.all(
    ((evidenceRows ?? []) as any[]).filter(isInlineReportImageAttachment).map(async (row: any) => {
      const bucket = String(row?.bucket ?? "").trim();
      const storagePath = String(row?.storage_path ?? "").trim().replace(/^\/+/, "");
      const { data: signed, error: signErr } = bucket && storagePath
        ? await params.admin.storage.from(bucket).createSignedUrl(storagePath, 60 * 60)
        : { data: null, error: null };

      return {
        id: String(row?.id ?? "").trim(),
        fileName: String(row?.file_name ?? "Attachment").trim() || "Attachment",
        contentType: String(row?.content_type ?? "").trim() || null,
        uploadedAt: String(row?.created_at ?? "").trim(),
        uploadedBy: null,
        caption: String(row?.caption ?? "")
          .replace(DUCT_ASBESTOS_PHOTO_ATTACHMENT_TAG, "")
          .trim() || null,
        signedUrl: !signErr && signed?.signedUrl ? signed.signedUrl : null,
      };
    }),
  );
}

export async function listJobRefrigerantChargeEvidenceImages(params: {
  supabase: any;
  admin: any;
  jobId: string;
  limit?: number;
}): Promise<RefrigerantChargeEvidenceImageAttachment[]> {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) return [];

  const { data: evidenceRows, error: evidenceErr } = await params.supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .ilike("caption", `${REFRIGERANT_CHARGE_ATTACHMENT_TAG}%`)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 20);

  if (evidenceErr) throw evidenceErr;

  const imageRows = ((evidenceRows ?? []) as any[]).filter(isInlineReportImageAttachment);

  const signedEvidence = await Promise.all(
    imageRows.map(async (row: any) => {
      const id = String(row?.id ?? "").trim();
      const bucket = String(row?.bucket ?? "").trim();
      const storagePath = String(row?.storage_path ?? "")
        .trim()
        .replace(/^\/+/, "");
      const contentType = String(row?.content_type ?? "").trim() || null;

      let signedUrl: string | null = null;

      if (bucket && storagePath) {
        const { data: signed, error: signErr } = await params.admin.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60);

        if (!signErr && signed?.signedUrl) {
          signedUrl = signed.signedUrl;
        }
      }

      return {
        id,
        fileName: String(row?.file_name ?? "Attachment").trim() || "Attachment",
        contentType,
        uploadedAt: String(row?.created_at ?? "").trim(),
        uploadedBy: null,
        caption: stripRefrigerantChargeEvidenceTag(row?.caption) || null,
        signedUrl,
      };
    }),
  );

  return signedEvidence.filter((row) => Boolean(row.id));
}

export async function listJobEquipmentLabelPhotoImages(params: {
  supabase: any;
  admin: any;
  jobId: string;
  equipmentIds?: string[];
  limit?: number;
}): Promise<EquipmentLabelPhotoAttachment[]> {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) return [];

  const { data: evidenceRows, error: evidenceErr } = await params.supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .ilike("caption", `${EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG}%`)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (evidenceErr) throw evidenceErr;

  const equipmentIdFilter = new Set(
    (params.equipmentIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean),
  );
  const imageRows = ((evidenceRows ?? []) as any[])
    .filter(isInlineReportImageAttachment)
    .map((row) => ({ row, parsed: parseEquipmentLabelPhotoCaption(row?.caption) }))
    .filter(({ parsed }) => !equipmentIdFilter.size || (parsed.equipmentId && equipmentIdFilter.has(parsed.equipmentId)));

  const signedEvidence = await Promise.all(
    imageRows.map(async ({ row, parsed }: any) => {
      const id = String(row?.id ?? "").trim();
      const bucket = String(row?.bucket ?? "").trim();
      const storagePath = String(row?.storage_path ?? "")
        .trim()
        .replace(/^\/+/, "");
      const contentType = String(row?.content_type ?? "").trim() || null;

      let signedUrl: string | null = null;

      if (bucket && storagePath) {
        const { data: signed, error: signErr } = await params.admin.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60);

        if (!signErr && signed?.signedUrl) {
          signedUrl = signed.signedUrl;
        }
      }

      return {
        id,
        fileName: String(row?.file_name ?? "Attachment").trim() || "Attachment",
        contentType,
        uploadedAt: String(row?.created_at ?? "").trim(),
        uploadedBy: null,
        caption: parsed.caption || null,
        equipmentId: parsed.equipmentId,
        systemId: parsed.systemId,
        signedUrl,
      };
    }),
  );

  return signedEvidence.filter((row) => Boolean(row.id));
}
