import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

function todayBusinessDateLA() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function telHref(phone?: string | null) {
  const digits = digitsOnly(phone);
  return digits ? `tel:${digits}` : "";
}

function smsHref(phone?: string | null) {
  const digits = digitsOnly(phone);
  return digits ? `sms:${digits}` : "";
}

function mapsHref(parts: { address?: string | null; city?: string | null }) {
  const query = [parts.address, parts.city]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

function customerName(job: any) {
  return (
    [String(job?.customer_first_name ?? "").trim(), String(job?.customer_last_name ?? "").trim()]
      .filter(Boolean)
      .join(" ") || "Customer"
  );
}

function contractorName(job: any) {
  return String((job as any)?.contractors?.name ?? "").trim() || "Unassigned";
}

function addressLine(job: any) {
  const address = String(job?.job_address ?? "").trim();
  const city = String(job?.city ?? "").trim();
  return [address, city].filter(Boolean).join(", ") || "No address";
}

function sortBySchedule(a: any, b: any) {
  const dateDiff = String(a?.scheduled_date ?? "").localeCompare(String(b?.scheduled_date ?? ""));
  if (dateDiff !== 0) return dateDiff;

  const windowDiff = String(a?.window_start ?? "").localeCompare(String(b?.window_start ?? ""));
  if (windowDiff !== 0) return windowDiff;

  return String(a?.title ?? "").localeCompare(String(b?.title ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function renderJobCard(job: any) {
  const phone = String(job?.customer_phone ?? "").trim();
  const navigateHref = mapsHref({
    address: job?.job_address,
    city: job?.city,
  });

  return (
    <div key={job.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/jobs/${job.id}?tab=ops`}
            className="text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline"
          >
            {String(job?.title ?? "Untitled Job")}
          </Link>
          <div className="mt-0.5 text-sm font-medium text-gray-800">{customerName(job)}</div>
          <div className="text-xs text-gray-600">Contractor: {contractorName(job)}</div>
          <div className="text-xs text-gray-500">{addressLine(job)}</div>
          <div className="mt-1 text-xs text-gray-600">
            {job?.scheduled_date ? formatBusinessDateUS(String(job.scheduled_date)) : "Schedule pending"}
            {job?.window_start || job?.window_end
              ? ` • ${displayWindowLA(job.window_start, job.window_end) || "Window pending"}`
              : ""}
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
          {String(job?.status ?? "open").replaceAll("_", " ")}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          Open Job
        </Link>
        {telHref(phone) ? (
          <a
            href={telHref(phone)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Call
          </a>
        ) : null}
        {smsHref(phone) ? (
          <a
            href={smsHref(phone)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Text
          </a>
        ) : null}
        {navigateHref ? (
          <a
            href={navigateHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Navigate
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default async function OpsFieldPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) redirect("/login");

  try {
    await requireInternalUser({
      supabase,
      userId: user.id,
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/login");
    }

    throw error;
  }

  const { data: assignmentRows, error: assignmentErr } = await supabase
    .from("job_assignments")
    .select("job_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (assignmentErr) throw assignmentErr;

  const assignedJobIds = Array.from(
    new Set(
      (assignmentRows ?? [])
        .map((row: any) => String(row?.job_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      "id, title, status, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), field_complete, deleted_at"
    )
    .in(
      "id",
      assignedJobIds.length
        ? assignedJobIds
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .is("deleted_at", null);

  if (jobsErr) throw jobsErr;

  const today = todayBusinessDateLA();
  const activeJobs = (jobs ?? []).filter((job: any) => !job?.field_complete);

  const inProgressJobs = activeJobs
    .filter((job: any) => {
      const status = String(job?.status ?? "").toLowerCase();
      return status === "on_the_way" || status === "in_process";
    })
    .sort(sortBySchedule);

  const inProgressIds = new Set(inProgressJobs.map((job: any) => String(job.id ?? "")));

  const todayJobs = activeJobs
    .filter((job: any) => {
      const jobId = String(job?.id ?? "");
      return !inProgressIds.has(jobId) && String(job?.scheduled_date ?? "") === today;
    })
    .sort(sortBySchedule);

  const upcomingJobs = activeJobs
    .filter((job: any) => {
      const jobId = String(job?.id ?? "");
      if (inProgressIds.has(jobId)) return false;

      const scheduledDate = String(job?.scheduled_date ?? "").trim();
      return !scheduledDate || scheduledDate > today;
    })
    .sort(sortBySchedule);

  const sections = [
    {
      title: "Today",
      subtitle: "Assigned visits scheduled for today.",
      jobs: todayJobs,
    },
    {
      title: "In Progress",
      subtitle: "Assigned jobs already underway.",
      jobs: inProgressJobs,
    },
    {
      title: "Upcoming",
      subtitle: "Assigned work scheduled after today or awaiting schedule.",
      jobs: upcomingJobs,
    },
  ];

  const totalVisibleJobs = sections.reduce((sum, section) => sum + section.jobs.length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Ops</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Work</h1>
            <p className="text-sm text-slate-600">Jobs currently assigned to you.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Back to Ops
            </Link>
          </div>
        </div>
      </div>

      {totalVisibleJobs === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
          No active assigned jobs right now.
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
              <p className="text-sm text-gray-600">{section.subtitle}</p>
            </div>
            <div className="text-sm text-gray-500">{section.jobs.length}</div>
          </div>

          {section.jobs.length > 0 ? (
            <div className="grid gap-3">{section.jobs.map((job: any) => renderJobCard(job))}</div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              No jobs in this section.
            </div>
          )}
        </section>
      ))}
    </div>
  );
}