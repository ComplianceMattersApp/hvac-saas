//app portal page - shows summary tiles and recent jobs list, with links to queues and job details
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

function statusBadgeClass(ops: string | null | undefined) {
  const v = (ops ?? "").toLowerCase();

  if (v === "need_to_schedule")
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  if (v === "pending_info")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (v === "retest_needed")
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (v === "ready")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (v === "on_hold")
    return "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200";

  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
}

function rowAccentClass(opts: {
  isUrgent: boolean;
  ops_status?: string | null;
}) {
  const ops = (opts.ops_status ?? "").toLowerCase();

  if (opts.isUrgent) return "border-red-500 bg-red-50 dark:bg-red-950/20";
  if (ops === "pending_info")
    return "border-amber-400 bg-amber-50 dark:bg-amber-950/20";
  if (ops === "retest_needed")
    return "border-red-400 bg-red-50 dark:bg-red-950/15";
  if (ops === "ready")
    return "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20";

  return "border-transparent";
}

export default async function PortalPage() {
  const supabase = await createClient();

  // Must be logged in
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  // Must be a contractor user (otherwise send internal users to ops)
  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;

  const contractorName =
    (cu as any)?.contractors?.name ?? (cu?.contractor_id ? "Contractor" : null);

  if (!cu?.contractor_id) redirect("/ops");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // “Attention Today” count
  const { count: attentionTodayCount } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .not("follow_up_date", "is", null)
    .lte("follow_up_date", today)
    .in("ops_status", ["need_to_schedule", "pending_info", "retest_needed"]);

  // Counts by ops_status
  const { data: countsData, error: countsErr } = await supabase
    .from("jobs")
    .select("ops_status");

  if (countsErr) throw countsErr;

  const counts: Record<string, number> = {};
  for (const row of countsData ?? []) {
    const key = (row as any)?.ops_status ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  // Recent jobs list (top 10)
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title, status, ops_status, follow_up_date, created_at, city")
    .order("created_at", { ascending: false })
    .limit(10);

  if (jobsErr) throw jobsErr;

  const openCount =
    (counts["need_to_schedule"] ?? 0) +
    (counts["pending_info"] ?? 0) +
    (counts["retest_needed"] ?? 0) +
    (counts["on_hold"] ?? 0) +
    (counts["ready"] ?? 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 text-gray-900 dark:text-gray-100">
      {/* Header */}
      {/* Header */}
<div className="rounded-xl border bg-white dark:bg-gray-900 p-5 flex items-start justify-between gap-4 shadow-sm">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Contractor Portal</h1>
    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
      {contractorName}
    </div>
  </div>

    <Link
    href="/jobs/new"
    className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 transition"
  >
    + Add Job
  </Link>
</div>

      {/* Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          href="/portal?queue=attention_today"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <div className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-2">
            <span>🔴</span>
            <span>Attention Today</span>
          </div>
          <div className="text-4xl font-bold tracking-tight mt-1">
            {attentionTodayCount ?? 0}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
            Follow-up due today or earlier
          </div>
        </Link>

        <Link
          href="/portal?queue=need_to_schedule"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <div className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-2">
            <span>🗓️</span>
            <span>Need to Schedule</span>
          </div>
          <div className="text-4xl font-bold tracking-tight mt-1">
            {counts["need_to_schedule"] ?? 0}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
            Jobs awaiting scheduling
          </div>
        </Link>

        <Link
          href="/portal?queue=pending_info"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <div className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-2">
            <span>📝</span>
            <span>Pending Info</span>
          </div>
          <div className="text-4xl font-bold tracking-tight mt-1">
            {counts["pending_info"] ?? 0}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
            Jobs missing required info
          </div>
        </Link>

        <Link
          href="/portal?queue=retest_needed"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <div className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-2">
            <span>🔁</span>
            <span>Retest Needed</span>
          </div>
          <div className="text-4xl font-bold tracking-tight mt-1">
            {counts["retest_needed"] ?? 0}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
            Jobs needing retest
          </div>
        </Link>
      </div>

      {/* Recent Jobs */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="text-sm font-semibold">Recent Jobs</div>
          <div className="text-xs text-gray-500 dark:text-gray-300">
            Open items: {openCount}
          </div>
        </div>

        {!jobs || jobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
            No jobs yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {jobs.map((job: any) => {
              const isUrgent =
                job.follow_up_date &&
                job.follow_up_date <= today &&
                ["need_to_schedule", "pending_info", "retest_needed"].includes(
                  job.ops_status ?? ""
                );

              const accent = rowAccentClass({
                isUrgent,
                ops_status: job.ops_status,
              });

              return (
                <Link
                  key={job.id}
                  href={`/portal/jobs/${job.id}`}
                  className={`block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-l-4 ${accent}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{job.title}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-2">
                        <span>{(job.city ?? "—") as string}</span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span>{(job.status ?? "—") as string}</span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>

                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(
                            job.ops_status
                          )}`}
                        >
                          {(job.ops_status ?? "—") as string}
                        </span>

                        {job.follow_up_date ? (
                          <span className="text-xs text-gray-500 dark:text-gray-300">
                            Follow-up: {job.follow_up_date}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 dark:text-gray-300 whitespace-nowrap">
                      {job.created_at ? formatDateLA(String(job.created_at)) : "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Help */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 p-4 text-sm text-gray-700 dark:text-gray-200 shadow-sm">
        If you need help, contact Compliance Matters:{" "}
        <b className="whitespace-nowrap">(209) 518-2383</b>
      </div>
    </div>
  );
}