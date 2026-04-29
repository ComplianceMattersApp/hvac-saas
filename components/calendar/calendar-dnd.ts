export type DraggedJobPayload = {
  jobId: string;
  windowStart: string | null;
  windowEnd: string | null;
  title?: string | null;
  city?: string | null;
  assigneeSummary?: string | null;
  hasNoTechAssigned?: boolean;
};

export const DISPATCH_GRID_START_MINUTES = 6 * 60;
export const DISPATCH_GRID_END_MINUTES = 18 * 60;
export const DISPATCH_GRID_SNAP_MINUTES = 30;
export const DEFAULT_DROP_DURATION_MINUTES = 120;

export function toHm(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.floor(minutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function toMinutes(value?: string | null): number | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function durationMinutes(windowStart?: string | null, windowEnd?: string | null): number | null {
  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);
  if (start == null || end == null || end <= start) return null;
  return end - start;
}

export function buildDragPayload(args: {
  jobId: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  title?: string | null;
  city?: string | null;
  assigneeSummary?: string | null;
  hasNoTechAssigned?: boolean;
}): DraggedJobPayload {
  return {
    jobId: String(args.jobId ?? "").trim(),
    windowStart: String(args.windowStart ?? "").trim() || null,
    windowEnd: String(args.windowEnd ?? "").trim() || null,
    title: String(args.title ?? "").trim() || null,
    city: String(args.city ?? "").trim() || null,
    assigneeSummary: String(args.assigneeSummary ?? "").trim() || null,
    hasNoTechAssigned: Boolean(args.hasNoTechAssigned),
  };
}

export function serializeDragPayload(payload: DraggedJobPayload): string {
  return JSON.stringify(payload);
}

export function parseDroppedJobId(rawUri: string): string | null {
  const raw = String(rawUri ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "http://localhost");
    const job = String(parsed.searchParams.get("job") ?? "").trim();
    return job || null;
  } catch {
    return null;
  }
}

export function extractDraggedJobPayloadFromDataTransfer(transfer: DataTransfer): DraggedJobPayload | null {
  const explicit = String(transfer.getData("application/x-cm-job") || "").trim();
  if (explicit) {
    try {
      const parsed = JSON.parse(explicit) as Partial<DraggedJobPayload>;
      const jobId = String(parsed.jobId ?? "").trim();
      if (jobId) {
        return {
          jobId,
          windowStart: String(parsed.windowStart ?? "").trim() || null,
          windowEnd: String(parsed.windowEnd ?? "").trim() || null,
          title: String(parsed.title ?? "").trim() || null,
          city: String(parsed.city ?? "").trim() || null,
          assigneeSummary: String(parsed.assigneeSummary ?? "").trim() || null,
          hasNoTechAssigned: parsed.hasNoTechAssigned === true,
        };
      }
    } catch {
      // Fall through to URI payload extraction.
    }
  }

  const uriLike = String(transfer.getData("text/uri-list") || transfer.getData("text/plain") || "").trim();
  const jobId = parseDroppedJobId(uriLike);
  if (!jobId) return null;

  return {
    jobId,
    windowStart: null,
    windowEnd: null,
  };
}

export function computeDropStartMinutes(args: {
  clientY: number;
  top: number;
  height: number;
  gridStartMinutes?: number;
  gridEndMinutes?: number;
  snapMinutes?: number;
}): number {
  const gridStart = args.gridStartMinutes ?? DISPATCH_GRID_START_MINUTES;
  const gridEnd = args.gridEndMinutes ?? DISPATCH_GRID_END_MINUTES;
  const snap = args.snapMinutes ?? DISPATCH_GRID_SNAP_MINUTES;

  const clampedY = Math.max(0, Math.min(args.height, args.clientY - args.top));
  const totalMinutes = gridEnd - gridStart;
  const ratio = args.height > 0 ? clampedY / args.height : 0;
  const exact = gridStart + ratio * totalMinutes;
  const snapped = Math.round(exact / snap) * snap;

  return Math.max(gridStart, Math.min(gridEnd - snap, snapped));
}

export function computeDropWindow(args: {
  payload: DraggedJobPayload;
  startMinutes: number;
  gridEndMinutes?: number;
  defaultDurationMinutes?: number;
  minimumDurationMinutes?: number;
}): { windowStart: string; windowEnd: string } {
  const gridEnd = args.gridEndMinutes ?? DISPATCH_GRID_END_MINUTES;
  const minDuration = args.minimumDurationMinutes ?? DISPATCH_GRID_SNAP_MINUTES;
  const defaultDuration = args.defaultDurationMinutes ?? DEFAULT_DROP_DURATION_MINUTES;

  const existingDuration = durationMinutes(args.payload.windowStart, args.payload.windowEnd);
  const requestedDuration = existingDuration ?? defaultDuration;

  const safeStart = Math.max(DISPATCH_GRID_START_MINUTES, Math.min(gridEnd - minDuration, args.startMinutes));
  let safeEnd = safeStart + Math.max(minDuration, requestedDuration);
  if (safeEnd > gridEnd) safeEnd = gridEnd;
  if (safeEnd <= safeStart) safeEnd = Math.min(gridEnd, safeStart + minDuration);

  return {
    windowStart: toHm(safeStart),
    windowEnd: toHm(safeEnd),
  };
}
