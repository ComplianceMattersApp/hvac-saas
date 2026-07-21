import { calendarDateKeyLA } from "@/lib/utils/schedule-la";

export type CustomerVisitSummaryJob = {
  scheduled_date?: string | null;
  status?: string | null;
  ops_status?: string | null;
  deleted_at?: string | null;
};

export type CustomerVisitSummary = {
  heading: "NEXT VISIT" | "LAST VISIT";
  scheduledDate: string;
  relativeLabel: string;
};

function normalized(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function validDateOnly(value: string | null | undefined): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function calendarDayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function relativeCalendarDateLabel(scheduledDate: string, today: string) {
  const difference = calendarDayNumber(scheduledDate) - calendarDayNumber(today);
  if (difference === 0) return "today";
  if (difference === 1) return "tomorrow";
  if (difference > 1) return `in ${difference} days`;
  if (difference === -1) return "yesterday";
  return `${Math.abs(difference)} days ago`;
}

function isEligibleBase(job: CustomerVisitSummaryJob) {
  if (job.deleted_at) return false;
  return !["cancelled", "canceled", "archived", "deleted", "draft"].includes(normalized(job.status));
}

export function resolveCustomerVisitSummary(
  jobs: CustomerVisitSummaryJob[],
  now = new Date(),
): CustomerVisitSummary | null {
  const today = calendarDateKeyLA(now);
  const eligible = jobs.filter((job) => isEligibleBase(job) && validDateOnly(job.scheduled_date));

  const upcoming = eligible
    .filter((job) => normalized(job.ops_status) === "scheduled" && job.scheduled_date! >= today)
    .sort((left, right) => left.scheduled_date!.localeCompare(right.scheduled_date!))[0];

  if (upcoming?.scheduled_date) {
    return {
      heading: "NEXT VISIT",
      scheduledDate: upcoming.scheduled_date,
      relativeLabel: relativeCalendarDateLabel(upcoming.scheduled_date, today),
    };
  }

  const completed = eligible
    .filter((job) => {
      const lifecycle = normalized(job.status);
      return job.scheduled_date! <= today &&
        (normalized(job.ops_status) === "closed" || lifecycle === "completed" || lifecycle === "closed");
    })
    .sort((left, right) => right.scheduled_date!.localeCompare(left.scheduled_date!))[0];

  if (!completed?.scheduled_date) return null;
  return {
    heading: "LAST VISIT",
    scheduledDate: completed.scheduled_date,
    relativeLabel: relativeCalendarDateLabel(completed.scheduled_date, today),
  };
}
