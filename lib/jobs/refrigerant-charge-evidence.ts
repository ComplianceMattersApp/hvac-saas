export const REFRIGERANT_CHARGE_ATTACHMENT_TAG = "[refrigerant-charge-evidence]";

export type JobAttachmentEvidenceContext = "refrigerant_charge_photo";

export type RefrigerantChargeEvidenceImageAttachment = {
  id: string;
  fileName: string;
  contentType: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  caption: string | null;
  signedUrl: string | null;
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeJobAttachmentEvidenceContext(
  value: unknown,
): JobAttachmentEvidenceContext | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "refrigerant_charge_photo") return "refrigerant_charge_photo";
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

  if (
    normalizedCaption &&
    normalizedCaption.toLowerCase().startsWith(REFRIGERANT_CHARGE_ATTACHMENT_TAG)
  ) {
    return normalizedCaption;
  }

  return normalizedCaption
    ? `${REFRIGERANT_CHARGE_ATTACHMENT_TAG} ${normalizedCaption}`
    : REFRIGERANT_CHARGE_ATTACHMENT_TAG;
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

export function isInlineReportImageAttachment(row: { content_type?: unknown }) {
  return String(row?.content_type ?? "").trim().toLowerCase().startsWith("image/");
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
