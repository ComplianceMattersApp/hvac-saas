import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
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

function contractorName(job: any, internalBusinessDisplayName: string) {
  return String((job as any)?.contractors?.name ?? "").trim() || internalBusinessDisplayName;
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

  const titleDiff = String(a?.title ?? "").localeCompare(String(b?.title ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (titleDiff !== 0) return titleDiff;

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

function isLifecycleComplete(job: any) {
  const status = String(job?.status ?? "").toLowerCase();
  return ["completed", "closed", "cancelled"].includes(status);
}

function formatStatus(value: unknown) {
  return String(value ?? "open")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusTone(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "on_the_way") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "in_process") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function sectionVisualTone(key: string) {
  if (key === "in_progress") {
    return {
      border: "border-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      dot: "bg-emerald-500",
      card: "border-l-emerald-500",
    };
  }

  if (key === "today") {
    return {
      border: "border-blue-200",
      bg: "bg-blue-50",
      text: "text-blue-800",
      dot: "bg-blue-500",
      card: "border-l-blue-500",
    };
  }

  if (key === "overdue") {
    return {
      border: "border-rose-200",
      bg: "bg-rose-50",
      text: "text-rose-800",
      dot: "bg-rose-500",
      card: "border-l-rose-500",
    };
  }

  if (key === "upcoming") {
    return {
      border: "border-indigo-200",
      bg: "bg-indigo-50",
      text: "text-indigo-800",
      dot: "bg-indigo-500",
      card: "border-l-indigo-500",
    };
  }

  return {
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-700",
    dot: "bg-slate-400",
    card: "border-l-slate-400",
  };
}

function renderJobCard(job: any, internalBusinessDisplayName: string, sectionKey: string) {
  const phone = String(job?.customer_phone ?? "").trim();
  const navigateHref = mapsHref({
    address: job?.job_address,
    city: job?.city,
  });
  const sectionTone = sectionVisualTone(sectionKey);
  const scheduleLabel = job?.scheduled_date
    ? formatBusinessDateUS(String(job.scheduled_date))
    : "Schedule pending";
  const windowLabel =
    job?.window_start || job?.window_end
      ? displayWindowLA(job.window_start, job.window_end) || "Window pending"
      : "";

  return (
    <div
      key={job.id}
      className={`rounded-lg border border-l-4 ${sectionTone.card} border-slate-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.42)]`}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Link
            href={`/jobs/${job.id}?tab=ops`}
            className="text-base font-semibold tracking-tight text-slate-950 hover:text-blue-700 hover:underline"
          >
            {normalizeRetestLinkedJobTitle(job?.title) || "Untitled Job"}
          </Link>
          <div className="grid gap-1 text-sm text-slate-700">
            <div className="font-medium text-slate-900">{customerName(job)}</div>
            <div>{addressLine(job)}</div>
            <div>Contractor: {contractorName(job, internalBusinessDisplayName)}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${sectionTone.border} ${sectionTone.bg} ${sectionTone.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${sectionTone.dot}`} />
              {scheduleLabel}
            </span>
            {windowLabel ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                {windowLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(job?.status)}`}>
          {formatStatus(job?.status)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link
          href={`/jobs/${job.id}?tab=ops`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:min-h-10"
        >
          Open Job
        </Link>
        {telHref(phone) ? (
          <a
            href={telHref(phone)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-10"
          >
            Call
          </a>
        ) : null}
        {smsHref(phone) ? (
          <a
            href={smsHref(phone)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-10"
          >
            Text
          </a>
        ) : null}
        {navigateHref ? (
          <a
            href={navigateHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-10"
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

  let internalBusinessDisplayName = "";

  try {
    const internalAccess = await requireInternalUser({
      supabase,
      userId: user.id,
    });

    const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalAccess.internalUser.account_owner_user_id,
    });
    internalBusinessDisplayName = internalBusinessIdentity.display_name;
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
    .neq("status", "cancelled")
    .is("deleted_at", null);

  if (jobsErr) throw jobsErr;

  const today = todayBusinessDateLA();
  const activeJobs = (jobs ?? []).filter((job: any) => {
    if (isLifecycleComplete(job)) return false;
    if (Boolean(job?.field_complete)) return false;
    return true;
  });

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

  const overdueJobs = activeJobs
    .filter((job: any) => {
      const jobId = String(job?.id ?? "");
      if (inProgressIds.has(jobId)) return false;

      const scheduledDate = String(job?.scheduled_date ?? "").trim();
      return !!scheduledDate && scheduledDate < today;
    })
    .sort(sortBySchedule)
    .reverse();

  const upcomingScheduledJobs = activeJobs
    .filter((job: any) => {
      const jobId = String(job?.id ?? "");
      if (inProgressIds.has(jobId)) return false;

      const scheduledDate = String(job?.scheduled_date ?? "").trim();
      return !!scheduledDate && scheduledDate > today;
    })
    .sort(sortBySchedule);

  const unscheduledJobs = activeJobs
    .filter((job: any) => {
      const jobId = String(job?.id ?? "");
      if (inProgressIds.has(jobId)) return false;
      if (String(job?.scheduled_date ?? "") === today) return false;

      const scheduledDate = String(job?.scheduled_date ?? "").trim();
      return !scheduledDate;
    })
    .sort(sortBySchedule);

  const sections = [
    {
      key: "in_progress",
      title: "In Progress",
      subtitle: "Assigned jobs already underway.",
      jobs: inProgressJobs,
    },
    {
      key: "today",
      title: "Today",
      subtitle: "Assigned visits scheduled for today.",
      jobs: todayJobs,
    },
    {
      key: "overdue",
      title: "Overdue",
      subtitle: "Assigned visits scheduled before today and not yet in progress (most recent overdue first).",
      jobs: overdueJobs,
    },
    {
      key: "upcoming",
      title: "Upcoming",
      subtitle: "Assigned upcoming scheduled work in chronological order.",
      jobs: upcomingScheduledJobs,
    },
    {
      key: "unscheduled",
      title: "Unscheduled",
      subtitle: "Assigned work awaiting a scheduled date.",
      jobs: unscheduledJobs,
    },
  ];

  const totalVisibleJobs = sections.reduce((sum, section) => sum + section.jobs.length, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5 bg-slate-50 p-3 text-slate-900 sm:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Field Queue</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">My Work</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Assigned visits grouped by what needs attention first. Open a job for full notes, status actions, tests, and closeout.
            </p>
          </div>
          <Link
            href="/ops"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
          >
            Back to Ops
          </Link>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          {sections.map((section) => {
            const tone = sectionVisualTone(section.key);
            return (
              <a
                key={`summary-${section.key}`}
                href={`#${section.key}`}
                className={`rounded-lg border px-3 py-3 transition-colors hover:bg-white ${tone.border} ${tone.bg}`}
              >
                <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${tone.text}`}>{section.title}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{section.jobs.length}</div>
              </a>
            );
          })}
        </div>
      </div>

      {totalVisibleJobs === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.34)]">
          <div className="text-base font-semibold text-slate-950">No active assigned jobs right now.</div>
          <div className="mt-1">You are clear from this field queue. New assignments will appear here when dispatch adds you to active work.</div>
        </div>
      ) : null}

      {sections.map((section) => (
        <section id={section.key} key={section.title} className="scroll-mt-24 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${sectionVisualTone(section.key).dot}`} />
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">{section.title}</h2>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{section.subtitle}</p>
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sectionVisualTone(section.key).border} ${sectionVisualTone(section.key).bg} ${sectionVisualTone(section.key).text}`}>
              {section.jobs.length}
            </div>
          </div>

          {section.jobs.length > 0 ? (
            <div className="grid gap-3">
              {section.jobs.map((job: any) => renderJobCard(job, internalBusinessDisplayName, section.key))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-sm text-slate-500">
              No jobs in this section.
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
