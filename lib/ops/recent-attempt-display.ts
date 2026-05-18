export type CustomerAttemptEvent = {
  job_id: string;
  created_at: string;
};

export function buildLatestCustomerAttemptByJob(
  events: CustomerAttemptEvent[],
): Map<string, string> {
  const latestByJob = new Map<string, string>();

  for (const event of events ?? []) {
    const jobId = String(event?.job_id ?? "").trim();
    const createdAt = String(event?.created_at ?? "").trim();
    if (!jobId || !createdAt) continue;

    if (!latestByJob.has(jobId)) {
      latestByJob.set(jobId, createdAt);
      continue;
    }

    const existing = latestByJob.get(jobId) ?? "";
    if (createdAt > existing) latestByJob.set(jobId, createdAt);
  }

  return latestByJob;
}

export function formatRecentAttemptDateTime(isoLike: string) {
  const raw = String(isoLike ?? "").trim();
  if (!raw) return "";

  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(dt);

  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase();

  if (!month || !day || !year || !hour || !minute || !dayPeriod) return "";
  return `${month}-${day}-${year} ${hour}:${minute} ${dayPeriod}`;
}

export function resolveRecentAttemptDisplay(isoLike?: string | null) {
  const formatted = formatRecentAttemptDateTime(String(isoLike ?? ""));
  return formatted || "No attempts logged";
}
