// lib/utils/scheduling.ts
export function deriveScheduleAndOps(formData: FormData) {
  const scheduledDateStr = String(formData.get("scheduled_date") || "").trim(); // YYYY-MM-DD or ""
  const windowStartStr = String(formData.get("window_start") || "").trim();     // HH:MM or ""
  const windowEndStr = String(formData.get("window_end") || "").trim();         // HH:MM or ""

  const hasScheduledDate = Boolean(scheduledDateStr);
  const ops_status = hasScheduledDate ? "scheduled" : "need_to_schedule";

  const scheduled_date = hasScheduledDate ? scheduledDateStr : null;
  const window_start = hasScheduledDate ? (windowStartStr || null) : null;
  const window_end = hasScheduledDate ? (windowEndStr || null) : null;

  if (window_start && window_end && window_start >= window_end) {
    throw new Error("Arrival window start must be before end");
  }

  return { scheduled_date, window_start, window_end, ops_status };
}