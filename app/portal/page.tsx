//app portal/page
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

function labelWithCount(label: string, count: number) {
  return count > 0 ? `${label} (${count})` : label;
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

function extractTopReasons(run: any): string[] {
  const computed = run?.computed ?? null;
  if (!computed) return [];

  const failures = Array.isArray(computed.failures)
    ? computed.failures.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];

  if (failures.length) return failures.slice(0, 3);

  const warnings = Array.isArray(computed.warnings)
    ? computed.warnings.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];

  if (warnings.length) return warnings.slice(0, 3);

  const measured = computed.measured_duct_leakage_cfm;
  const max = computed.max_leakage_cfm;

  if (typeof measured === "number" && typeof max === "number") {
    if (measured > max) return [`Duct leakage ${measured} CFM exceeds max ${max} CFM.`];
    return [`Duct leakage ${measured} CFM (max ${max} CFM).`];
  }

  return [];
}

function finalRunPass(run: any): boolean | null {
  if (!run) return null;
  return run.override_pass != null ? !!run.override_pass : !!run.computed_pass;
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
    const key = String(row?.ops_status ?? "unknown").toLowerCase();
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
      attentionTodayStatuses.includes(String(j.ops_status ?? "").toLowerCase())
  ).length;

  const retestOrFailedCount =
    (counts["retest_needed"] ?? 0) + (counts["failed"] ?? 0);

  const openCount = jobs.length;
  const pendingInfoCount = counts["pending_info"] ?? 0;
  const needToScheduleCount = counts["need_to_schedule"] ?? 0;
  const onHoldCount = counts["on_hold"] ?? 0;
  const scheduledCount = counts["scheduled"] ?? 0;


  const needsAttentionTotal =
    retestOrFailedCount +
    pendingInfoCount +
    needToScheduleCount +
    onHoldCount;

  let visibleJobs = jobs;

  if (queue === "attention_today") {
    visibleJobs = jobs.filter(
      (j) =>
        !!j.follow_up_date &&
        String(j.follow_up_date) <= String(today) &&
        attentionTodayStatuses.includes(String(j.ops_status ?? "").toLowerCase())
    );
    } else if (queue === "scheduled") {
  visibleJobs = jobs.filter(
    (j) => String(j.ops_status ?? "").toLowerCase() === "scheduled"
  );
  } else if (queue === "need_to_schedule") {
    visibleJobs = jobs.filter(
      (j) => String(j.ops_status ?? "").toLowerCase() === "need_to_schedule"
    );
  } else if (queue === "pending_info") {
    visibleJobs = jobs.filter(
      (j) => String(j.ops_status ?? "").toLowerCase() === "pending_info"
    );
  } else if (queue === "retest_needed") {
    visibleJobs = jobs.filter((j) =>
      ["retest_needed", "failed"].includes(String(j.ops_status ?? "").toLowerCase())
    );
    } else if (queue === "on_hold") {
  visibleJobs = jobs.filter(
    (j) => String(j.ops_status ?? "").toLowerCase() === "on_hold"
  );
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

      const visibleJobIds = visibleJobs.map((j: any) => j.id);

  const { data: visibleRuns, error: visibleRunsErr } = await supabase
    .from("ecc_test_runs")
    .select(
      "job_id, created_at, test_type, computed_pass, override_pass, computed, is_completed"
    )
    .in("job_id", visibleJobIds.length ? visibleJobIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_completed", true)
    .order("created_at", { ascending: false });

  if (visibleRunsErr) throw visibleRunsErr;

  const failedRunByJob = new Map<string, any>();

  for (const run of visibleRuns ?? []) {
    if (finalRunPass(run) === false && !failedRunByJob.has(run.job_id)) {
      failedRunByJob.set(run.job_id, run);
    }
  }

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

     <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5 shadow-sm">
  <div className="flex items-start justify-between gap-4">
    <div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Needs Your Attention
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Jobs waiting on your action, scheduling, or information.
      </p>
    </div>

    <div
      className={`rounded-full border px-3 py-1 text-sm font-semibold ${
        needsAttentionTotal > 0
          ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300"
          : "border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400"
      }`}
    >
      {needsAttentionTotal}
    </div>
  </div>

  {needsAttentionTotal === 0 ? (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
      No contractor action items right now.
    </div>
  ) : (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {retestOrFailedCount > 0 ? (
        <Link
          href="/portal?queue=retest_needed"
          className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm font-semibold text-red-900 dark:text-red-200">
            Failed / Retest Required
          </div>
          <div className="mt-1 text-2xl font-semibold text-red-900 dark:text-red-100">
            {retestOrFailedCount}
          </div>
          <div className="mt-1 text-xs text-red-800/80 dark:text-red-200/80">
            Jobs that failed or need retesting
          </div>
        </Link>
      ) : null}

      {pendingInfoCount > 0 ? (
        <Link
          href="/portal?queue=pending_info"
          className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Pending Info
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber-900 dark:text-amber-100">
            {pendingInfoCount}
          </div>
          <div className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
            Waiting on info from you
          </div>
        </Link>
      ) : null}

      {needToScheduleCount > 0 ? (
        <Link
          href="/portal?queue=need_to_schedule"
          className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">
            Need to Schedule
          </div>
          <div className="mt-1 text-2xl font-semibold text-blue-900 dark:text-blue-100">
            {needToScheduleCount}
          </div>
          <div className="mt-1 text-xs text-blue-800/80 dark:text-blue-200/80">
            Jobs waiting for scheduling
          </div>
        </Link>
      ) : null}

      {onHoldCount > 0 ? (
        <Link
          href="/portal?queue=on_hold"
          className="rounded-xl border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            On Hold
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {onHoldCount}
          </div>
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Paused on your side
          </div>
        </Link>
      ) : null}
    </div>
  )}
</div>

<div className="flex flex-wrap gap-2">
  <Link
    href="/portal"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      !queue
        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    }`}
  >
    {labelWithCount("All Open Jobs", openCount)}
  </Link>

  <Link
    href="/portal?queue=attention_today"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      queue === "attention_today"
        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    }`}
  >
    {labelWithCount("Attention Today", attentionTodayCount)}
  </Link>

  <Link
    href="/portal?queue=scheduled"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      queue === "scheduled"
        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
        : "border-emerald-200 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
    }`}
  >
    {labelWithCount("Scheduled", scheduledCount)}
  </Link>

  <Link
    href="/portal?queue=need_to_schedule"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      queue === "need_to_schedule"
        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
        : "border-blue-200 text-blue-800 hover:bg-blue-50 dark:border-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-950/20"
    }`}
  >
    {labelWithCount("Need to Schedule", needToScheduleCount)}
  </Link>

  <Link
    href="/portal?queue=pending_info"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      queue === "pending_info"
        ? "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500"
        : "border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-950/20"
    }`}
  >
    {labelWithCount("Pending Info", pendingInfoCount)}
  </Link>

  <Link
    href="/portal?queue=retest_needed"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      queue === "retest_needed"
        ? "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500"
        : "border-red-200 text-red-800 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/20"
    }`}
  >
    {labelWithCount("Failed / Retest", retestOrFailedCount)}
  </Link>

  <Link
    href="/portal?queue=on_hold"
    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      queue === "on_hold"
        ? "border-gray-700 bg-gray-700 text-white dark:border-gray-500 dark:bg-gray-500"
        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    }`}
  >
    {labelWithCount("On Hold", onHoldCount)}
  </Link>
</div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {queue === "retest_needed"
            ? "Queue: Failed / Retest"
            : queue === "need_to_schedule"
            ? "Queue: Need to Schedule"
            : queue === "pending_info"
            ? "Queue: Pending Info"
            : queue === "attention_today"
            ? "Queue: Attention Today"
            : queue === "on_hold"
            ? "Queue: On Hold"
            : queue === "scheduled"
            ? "Queue: Scheduled"
            : "Open Jobs"}
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
            const ops = String(j.ops_status ?? "").toLowerCase();
            const failedRun = failedRunByJob.get(j.id);
            const failureReasons = failedRun ? extractTopReasons(failedRun) : [];
            const displayAddress =
              j.locations?.address_line1?.trim() ||
              j.job_address?.trim() ||
              "No address";

            const displayCity =
              j.locations?.city?.trim() ||
              j.city?.trim() ||
              "—";

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
                      {displayAddress} • {displayCity}
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

                      {["failed", "retest_needed"].includes(ops) && failureReasons.length > 0 && (
                      <div>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          Why failed:
                        </span>{" "}
                        {failureReasons[0]}
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