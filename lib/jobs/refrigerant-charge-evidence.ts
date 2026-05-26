export const REFRIGERANT_CHARGE_ATTACHMENT_TAG = "[refrigerant-charge-evidence]";

export type JobAttachmentEvidenceContext = "refrigerant_charge_photo";

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
