import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatDateLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function statusLabel(ops: string | null | undefined) {
  const v = (ops ?? "").toLowerCase();

  if (v === "failed") return "FAILED";
  if (v === "pending_info") return "PENDING INFO";
  if (v === "retest_needed") return "RETEST REQUIRED";
  if (v === "need_to_schedule") return "NEED TO SCHEDULE";
  if (v === "scheduled" || v === "ready") return "SCHEDULED";
  if (v === "on_hold") return "ON HOLD";
  if (v === "field_complete") return "FIELD COMPLETE";
  if (v === "closed") return "CLOSED";

  return v ? v.toUpperCase().replaceAll("_", " ") : "UNKNOWN";
}

function statusBadgeClass(ops: string | null | undefined) {
  const v = (ops ?? "").toLowerCase();

  if (v === "failed")
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300";
  if (v === "retest_needed")
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300";
  if (v === "pending_info")
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300";
  if (v === "need_to_schedule")
    return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300";
  if (v === "scheduled" || v === "ready")
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (v === "on_hold")
    return "border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";
  if (v === "field_complete")
    return "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

  return "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";
}

function rowAccentClass(opts: { isUrgent: boolean; ops_status?: string | null }) {
  const ops = (opts.ops_status ?? "").toLowerCase();

  if (opts.isUrgent) return "border-l-red-500";
  if (ops === "pending_info") return "border-l-amber-400";
  if (ops === "retest_needed" || ops === "failed") return "border-l-red-400";
  if (ops === "scheduled" || ops === "ready") return "border-l-emerald-500";
  if (ops === "need_to_schedule") return "border-l-blue-500";
  if (ops === "field_complete") return "border-l-slate-400";

  return "border-l-transparent";
}

type SP = Record<string, string | string[] | undefined>;

function sp1(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function queueCardClass(isActive: boolean) {
  return [
    "rounded-xl border p-4 transition-all duration-150",
    isActive
      ? "border-gray-900 bg-gray-900 text-white shadow-md dark:border-white dark:bg-white dark:text-gray-900"
      : "bg-white text-gray-900 hover:shadow-sm hover:-translate-y-[1px] dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800",
  ].join(" ");
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const supabase = await createClient();

  const sp: SP = (searchParams ? await searchParams : {}) ?? {};
  const queue = (sp1(sp.queue) ?? "").toString();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;

  const contractorId = cu?.contractor_id ?? null;
  const contractorName =
    (cu as any)?.contractors?.name ?? (contractorId ? "Contractor" : null);

  if (!contractorId) redirect("/ops");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data: baseJobs, error: baseJobsErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      status,
      ops_status,
      pending_info_reason,
      next_action_note,
      follow_up_date,
      created_at,
      city,
      job_address,
      locations:location_id ( address_line1, city, state )
    `
    )
    .eq("contractor_id", contractorId)
    .is("deleted_at", null)
    .neq("ops_status", "closed");

  if (baseJobsErr) throw baseJobsErr;

  const jobs = (baseJobs ?? []) as any[];

  const counts: Record<string, number> = {};
  for (const row of jobs) {
    const key = row?.ops_status ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const attentionTodayStatuses = [
    "need_to_schedule",
    "pending_info",
    "retest_needed",
    "failed",
  ];

  const attentionTodayCount = jobs.filter(
    (j) =>
      !!j.follow_up_date &&
      String(j.follow_up_date) <= String(today) &&
      attentionTodayStatuses.includes((j.ops_status ?? "").toLowerCase())
  ).length;

  const openCount = jobs.length;

  let visibleJobs = jobs;

  if (queue === "attention_today") {
    visibleJobs = jobs.filter(
      (j) =>
        !!j.follow_up_date &&
        String(j.follow_up_date) <= String(today) &&
        attentionTodayStatuses.includes((j.ops_status ?? "").toLowerCase())
    );
  } else if (queue === "need_to_schedule") {
    visibleJobs = jobs.filter((j) => j.ops_status === "need_to_schedule");
  } else if (queue === "pending_info") {
    visibleJobs = jobs.filter((j) => j.ops_status === "pending_info");
  } else if (queue === "retest_needed") {
    visibleJobs = jobs.filter((j) => j.ops_status === "retest_needed");
  } else {
    visibleJobs = jobs;
  }

  visibleJobs = [...visibleJobs]
    .sort((a, b) => {
      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 25);

  return (
    <div className="max-w-6xl mx-auto space-y-6 text-gray-900 dark:text-gray-100">
      <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Contractor Portal
            </h1>
            <div className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
              {contractorName}
            </div>
          </div>

          <Link
            href="/jobs/new"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            + Add Job
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Open Jobs
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {openCount}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Attention Today
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {attentionTodayCount}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Current View
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {queue ? queue.replaceAll("_", " ") : "all open jobs"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/portal" className={queueCardClass(!queue)}>
          <div
            className={`text-sm font-medium ${
              !queue ? "text-white/80 dark:text-gray-600" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Open Jobs
          </div>
          <div className="mt-1 text-3xl font-semibold">{openCount}</div>
          <div
            className={`mt-2 text-xs ${
              !queue ? "text-white/70 dark:text-gray-500" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            All active contractor jobs
          </div>
        </Link>

        <Link
          href="/portal?queue=attention_today"
          className={queueCardClass(queue === "attention_today")}
        >
          <div
            className={`text-sm font-medium ${
              queue === "attention_today"
                ? "text-white/80 dark:text-gray-600"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Attention Today
          </div>
          <div className="mt-1 text-3xl font-semibold">{attentionTodayCount}</div>
          <div
            className={`mt-2 text-xs ${
              queue === "attention_today"
                ? "text-white/70 dark:text-gray-500"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Follow-ups due today or earlier
          </div>
        </Link>

        <Link
          href="/portal?queue=need_to_schedule"
          className={queueCardClass(queue === "need_to_schedule")}
        >
          <div
            className={`text-sm font-medium ${
              queue === "need_to_schedule"
                ? "text-white/80 dark:text-gray-600"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Need to Schedule
          </div>
          <div className="mt-1 text-3xl font-semibold">
            {counts["need_to_schedule"] ?? 0}
          </div>
          <div
            className={`mt-2 text-xs ${
              queue === "need_to_schedule"
                ? "text-white/70 dark:text-gray-500"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Jobs waiting for scheduling
          </div>
        </Link>

        <Link
          href="/portal?queue=pending_info"
          className={queueCardClass(queue === "pending_info")}
        >
          <div
            className={`text-sm font-medium ${
              queue === "pending_info"
                ? "text-white/80 dark:text-gray-600"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Pending Info
          </div>
          <div className="mt-1 text-3xl font-semibold">
            {counts["pending_info"] ?? 0}
          </div>
          <div
            className={`mt-2 text-xs ${
              queue === "pending_info"
                ? "text-white/70 dark:text-gray-500"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Missing permit, notes, or info
          </div>
        </Link>

        <Link
          href="/portal?queue=retest_needed"
          className={queueCardClass(queue === "retest_needed")}
        >
          <div
            className={`text-sm font-medium ${
              queue === "retest_needed"
                ? "text-white/80 dark:text-gray-600"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Retest Needed
          </div>
          <div className="mt-1 text-3xl font-semibold">
            {counts["retest_needed"] ?? 0}
          </div>
          <div
            className={`mt-2 text-xs ${
              queue === "retest_needed"
                ? "text-white/70 dark:text-gray-500"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            Failed jobs awaiting retest
          </div>
        </Link>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {queue ? `Queue: ${queue.replaceAll("_", " ")}` : "Open Jobs"}
        </h2>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Showing <span className="font-semibold">{visibleJobs.length}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {visibleJobs.map((j: any) => {
            const isUrgent =
              !!j.follow_up_date && String(j.follow_up_date) <= String(today);

            return (
              <Link
                key={j.id}
                href={`/portal/jobs/${j.id}`}
                className={[
                  "block border-l-4 p-4 transition-all duration-150",
                  "hover:bg-gray-50 hover:shadow-sm dark:hover:bg-gray-800/40",
                  rowAccentClass({ isUrgent, ops_status: j.ops_status }),
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                        {j.title ?? "Untitled Job"}
                      </div>

                      <span
                        className={[
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusBadgeClass(j.ops_status),
                        ].join(" ")}
                      >
                        {statusLabel(j.ops_status)}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {j.job_address ?? j.locations?.address_line1 ?? "No address"} •{" "}
                      {j.city ?? j.locations?.city ?? "—"}
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {!!j.pending_info_reason && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            Pending info:
                          </span>{" "}
                          {j.pending_info_reason}
                        </div>
                      )}

                      {!!j.next_action_note && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            Next action:
                          </span>{" "}
                          {j.next_action_note}
                        </div>
                      )}

                      {!!j.follow_up_date && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            Follow up:
                          </span>{" "}
                          {j.follow_up_date}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">
                    {j.created_at ? `Added ${formatDateLA(j.created_at)}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}

          {visibleJobs.length === 0 && (
            <div className="p-8 text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                No jobs found in this queue.
              </div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try another queue or add a new job.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}