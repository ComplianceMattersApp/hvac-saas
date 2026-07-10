/**
 * Renders the On-The-Way SMS template body with real values.
 * Token map: {{recipient_first_name}}, {{operator_or_tech_name}},
 * {{company_name}}, {{appointment_or_job_context}}
 *
 * Quiet-hours write-vs-skip policy (locked July 9 2026):
 * When quiet hours is implemented, a blocked send must still write an
 * sms_message_intents row with decision_outcome='blocked' and
 * quiet_hours_decision='blocked_quiet_hours'. Do not skip the write.
 * This preserves a full audit trail of every intent that was suppressed.
 */

export interface OnTheWayTokenValues {
  recipientFirstName: string;
  operatorOrTechName: string;
  companyName: string;
  appointmentOrJobContext: string;
}

/**
 * Substitutes the four allowed On-The-Way tokens with real values.
 * Whitespace inside the braces is tolerated (e.g. `{{ company_name }}`), matching
 * the governance sample-preview renderer's token pattern. Unknown/other tokens are
 * left untouched — the caller controls the source template.
 */
export function renderOnTheWayMessageBody(
  bodyTemplate: string,
  tokens: OnTheWayTokenValues,
): string {
  return String(bodyTemplate ?? "")
    .replace(/\{\{\s*recipient_first_name\s*\}\}/g, tokens.recipientFirstName)
    .replace(/\{\{\s*operator_or_tech_name\s*\}\}/g, tokens.operatorOrTechName)
    .replace(/\{\{\s*company_name\s*\}\}/g, tokens.companyName)
    .replace(/\{\{\s*appointment_or_job_context\s*\}\}/g, tokens.appointmentOrJobContext);
}

/**
 * Builds a human-readable appointment context string from schedule fields.
 * Examples:
 *   "Tuesday, July 9 between 10 AM – 12 PM"
 *   "Tuesday, July 9"
 *   "your service appointment" (fallback when no date available)
 */
export function formatAppointmentContext(params: {
  scheduledDate: string | null | undefined;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
}): string {
  const scheduledDate = String(params.scheduledDate ?? "").trim();
  const windowStart = String(params.windowStart ?? "").trim();
  const windowEnd = String(params.windowEnd ?? "").trim();

  if (!scheduledDate) return "your service appointment";

  // Parse date as a local date — avoid UTC-midnight shift by splitting the ISO date
  // string (YYYY-MM-DD) manually rather than passing it to new Date(string).
  const [year, month, day] = scheduledDate.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return "your service appointment";
  }

  const date = new Date(year, month - 1, day);

  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (!windowStart || !windowEnd) return dateStr;

  // Time strings are stored as bare clock values (HH:MM or HH:MM:SS) with no
  // date/zone, so parse them directly rather than constructing a Date.
  const formatTime = (t: string): string | null => {
    const parts = t.split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1] ?? 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
  };

  const startStr = formatTime(windowStart);
  const endStr = formatTime(windowEnd);

  if (!startStr || !endStr) return dateStr;

  return `${dateStr} between ${startStr} – ${endStr}`;
}
