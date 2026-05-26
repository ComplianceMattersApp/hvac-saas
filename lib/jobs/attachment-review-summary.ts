export type AttachmentReviewEventRow = {
  event_type: string | null;
  created_at: string | null;
  meta: unknown;
};

export type AttachmentReviewSummary = {
  contractorUploadCount: number;
  correctionReviewUploadCount: number;
  reviewAnchorUploadCount: number;
};

function attachmentIdsFromMeta(meta: unknown): string[] {
  const payload = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  if (!payload) return [];
  const ids = Array.isArray(payload.attachment_ids) ? payload.attachment_ids : [];
  return ids.map((value) => String(value ?? "").trim()).filter(Boolean);
}

export function buildAttachmentReviewSummary(params: {
  events: AttachmentReviewEventRow[];
  visibleAttachmentIds: Set<string>;
}): AttachmentReviewSummary {
  const contractorUploadIds = new Set<string>();
  const correctionReviewIds = new Set<string>();
  const reviewAnchorUploadIds = new Set<string>();

  const latestReviewAnchorAtMs = params.events.reduce((latest, eventRow) => {
    const eventType = String(eventRow?.event_type ?? "").trim().toLowerCase();
    if (eventType !== "contractor_correction_submission" && eventType !== "retest_ready_requested") {
      return latest;
    }

    const createdAtMs = Date.parse(String(eventRow?.created_at ?? ""));
    if (!Number.isFinite(createdAtMs)) return latest;
    return Math.max(latest, createdAtMs);
  }, 0);

  for (const eventRow of params.events) {
    const eventType = String(eventRow?.event_type ?? "").trim().toLowerCase();
    const createdAtMs = Date.parse(String(eventRow?.created_at ?? ""));
    const meta = eventRow?.meta;
    const metaSource = meta && typeof meta === "object" ? String((meta as any)?.source ?? "").trim().toLowerCase() : "";
    const ids = attachmentIdsFromMeta(meta).filter((id) => params.visibleAttachmentIds.has(id));

    if (ids.length === 0) continue;

    const isContractorUploadEvent =
      eventType === "contractor_note" ||
      eventType === "contractor_correction_submission" ||
      (eventType === "attachment_added" && metaSource === "contractor");

    if (isContractorUploadEvent) {
      ids.forEach((id) => contractorUploadIds.add(id));
      if (Number.isFinite(createdAtMs) && latestReviewAnchorAtMs > 0 && createdAtMs >= latestReviewAnchorAtMs) {
        ids.forEach((id) => reviewAnchorUploadIds.add(id));
      }
    }

    if (eventType === "contractor_correction_submission") {
      ids.forEach((id) => correctionReviewIds.add(id));
    }
  }

  return {
    contractorUploadCount: contractorUploadIds.size,
    correctionReviewUploadCount: correctionReviewIds.size,
    reviewAnchorUploadCount: reviewAnchorUploadIds.size,
  };
}
