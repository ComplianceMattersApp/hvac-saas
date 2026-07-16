type AttachmentShareEvent = {
  event_type?: string | null;
  meta?: unknown;
};

export function getContractorSharedAttachmentIds(events: AttachmentShareEvent[]) {
  const ids = new Set<string>();

  for (const event of events) {
    if (event.event_type !== "public_note") continue;
    const meta = event.meta && typeof event.meta === "object" ? event.meta as Record<string, unknown> : null;
    if (meta?.source !== "internal_share" || !Array.isArray(meta.attachment_ids)) continue;

    for (const value of meta.attachment_ids) {
      const id = String(value ?? "").trim();
      if (id) ids.add(id);
    }
  }

  return [...ids];
}
