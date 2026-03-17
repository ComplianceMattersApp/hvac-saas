//app portal/page
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  extractFailureReasons,
  finalRunPass,
  resolveContractorIssues,
  type ContractorIssue,
} from "@/lib/portal/resolveContractorIssues";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";

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

function toDateMs(value: string | null | undefined) {
  if (!value) return 0;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? t : 0;
}

type SP = Record<string, string | string[] | undefined>;

function sp1(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const supabase = await createClient();

  const sp: SP = (searchParams ? await searchParams : {}) ?? {};
  const q = (sp1(sp.q) ?? "").toString().trim();

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
      permit_number,
      pending_info_reason,
      next_action_note,
      action_required_by,
      parent_job_id,
      follow_up_date,
      created_at,
      data_entry_completed_at,
      scheduled_date,
      window_start,
      window_end,
      customer_first_name,
      customer_last_name,
      customer_phone,
      city,
      job_address,
      locations:location_id ( address_line1, city, state )
    `
    )
    .eq("contractor_id", contractorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (baseJobsErr) throw baseJobsErr;

  const jobs = (baseJobs ?? []) as any[];

  const openRetestChildByParentId = new Map<string, any>();
  for (const candidate of jobs) {
    const parentId = String(candidate.parent_job_id ?? "").trim();
    if (!parentId) continue;
    if (String(candidate.ops_status ?? "").toLowerCase() === "closed") continue;

    const current = openRetestChildByParentId.get(parentId);
    if (!current || toDateMs(candidate.created_at) > toDateMs(current.created_at)) {
      openRetestChildByParentId.set(parentId, candidate);
    }
  }

  const normalizedQuery = q.toLowerCase();

  function matchesSearch(job: any) {
    if (!normalizedQuery) return true;

    const fullName = [
      String(job.customer_first_name ?? "").trim(),
      String(job.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ");

    const haystack = [
      job.title,
      fullName,
      job.customer_phone,
      job.job_address,
      job.city,
      job.locations?.address_line1,
      job.locations?.city,
      job.permit_number,
      job.id,
    ]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .filter(Boolean)
      .join(" ");

    return haystack.includes(normalizedQuery);
  }

  function portalHref() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);

    const qs = params.toString();
    return qs ? `/portal?${qs}` : "/portal";
  }

  const scopedJobs = jobs.filter(matchesSearch);

  const scopedJobIds = scopedJobs.map((j: any) => j.id);

  const { data: visibleRuns, error: visibleRunsErr } = await supabase
    .from("ecc_test_runs")
    .select(
      "job_id, created_at, test_type, computed_pass, override_pass, computed, is_completed"
    )
    .in("job_id", scopedJobIds.length ? scopedJobIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_completed", true)
    .order("created_at", { ascending: false });

  if (visibleRunsErr) throw visibleRunsErr;

  const failedRunByJob = new Map<string, any>();

  for (const run of visibleRuns ?? []) {
    if (finalRunPass(run) === false && !failedRunByJob.has(run.job_id)) {
      failedRunByJob.set(run.job_id, run);
    }
  }

  const { data: rawIssueEvents, error: rawIssueEventsErr } = await supabase
    .from("job_events")
    .select("job_id, event_type, created_at, meta")
    .in("job_id", scopedJobIds.length ? scopedJobIds : ["00000000-0000-0000-0000-000000000000"])
    .in("event_type", [
      "contractor_correction_submission",
      "contractor_note",
      "retest_ready_requested",
      "status_changed",
    ])
    .order("created_at", { ascending: false })
    .limit(1000);

  if (rawIssueEventsErr) throw rawIssueEventsErr;

  const eventsByJob = new Map<string, any[]>();
  for (const ev of rawIssueEvents ?? []) {
    const jobId = String((ev as any)?.job_id ?? "").trim();
    if (!jobId) continue;
    if (!eventsByJob.has(jobId)) eventsByJob.set(jobId, []);
    eventsByJob.get(jobId)!.push(ev);
  }

  const resolvedJobs = scopedJobs.map((job: any) => {
    const failedRun = failedRunByJob.get(job.id);
    const failureReasons = failedRun ? extractFailureReasons(failedRun) : [];
    const issueEvents = eventsByJob.get(String(job.id)) ?? [];
    const openRetestChild = openRetestChildByParentId.get(String(job.id)) ?? null;
    const hasRetestReadyRequest = issueEvents.some(
      (ev: any) => String(ev?.event_type ?? "").trim().toLowerCase() === "retest_ready_requested"
    );

    const resolved = resolveContractorIssues({
      job: {
        id: String(job.id ?? ""),
        ops_status: job.ops_status,
        pending_info_reason: job.pending_info_reason,
        next_action_note: job.next_action_note,
        action_required_by: job.action_required_by,
        scheduled_date: job.scheduled_date,
        window_start: job.window_start,
        window_end: job.window_end,
      },
      failureReasons,
      events: issueEvents,
      chain: {
        hasOpenRetestChild: !!openRetestChild,
        hasRetestReadyRequest,
        retestScheduledDate: openRetestChild?.scheduled_date ?? null,
        retestWindowStart: openRetestChild?.window_start ?? null,
        retestWindowEnd: openRetestChild?.window_end ?? null,
      },
    });

    return {
      job,
      resolved,
      openRetestChild,
    };
  });

  const actionRequiredJobs = resolvedJobs
    .filter((row) => row.resolved.bucket === "action_required")
    .sort((a, b) => {
      const urgencyA = Number(
        !!a.job.follow_up_date && String(a.job.follow_up_date) <= String(today)
      );
      const urgencyB = Number(
        !!b.job.follow_up_date && String(b.job.follow_up_date) <= String(today)
      );

      if (urgencyA !== urgencyB) return urgencyB - urgencyA;
      return toDateMs(b.job.created_at) - toDateMs(a.job.created_at);
    });

  const inProgressJobs = resolvedJobs
    .filter((row) => row.resolved.bucket === "in_progress")
    .sort((a, b) => toDateMs(b.job.created_at) - toDateMs(a.job.created_at));

  const passedJobs = resolvedJobs
    .filter((row) => row.resolved.bucket === "passed")
    .sort((a, b) => {
      const aResolved = toDateMs(a.job.data_entry_completed_at ?? a.job.created_at);
      const bResolved = toDateMs(b.job.data_entry_completed_at ?? b.job.created_at);
      return bResolved - aResolved;
    })
    .slice(0, 50);

  function issueLine(issue: ContractorIssue): string {
    if (issue.group === "needs_info") {
      return `Need information from you - ${issue.headline}`;
    }

    return issue.headline;
  }

  function cardIssueLines(input: {
    primaryIssue: ContractorIssue;
    secondaryIssues?: ContractorIssue[];
  }) {
    const lines: string[] = [];

    const failedIssue =
      input.primaryIssue.group === "failed"
        ? input.primaryIssue
        : (input.secondaryIssues ?? []).find((issue) => issue.group === "failed");

    const hasSpecificFailedReason = (failedIssue?.detailLines ?? []).length > 0;

    if (!(input.primaryIssue.group === "failed" && hasSpecificFailedReason)) {
      lines.push(issueLine(input.primaryIssue));
    }

    const secondaryBlocker = (input.secondaryIssues ?? []).find(
      (issue) => issue.group === "needs_info" || issue.group === "failed"
    );

    if (
      secondaryBlocker &&
      !(secondaryBlocker.group === "failed" && hasSpecificFailedReason)
    ) {
      lines.push(issueLine(secondaryBlocker));
    }

    const failureLines = (failedIssue?.detailLines ?? []).slice(0, 1);
    for (const reason of failureLines) {
      if (lines.length >= 3) break;
      lines.push(`Failed - ${reason}`);
    }

    return lines.slice(0, 3);
  }

  function customerName(job: any) {
    const full = [
      String(job.customer_first_name ?? "").trim(),
      String(job.customer_last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ");

    return full || "Customer";
  }

  function displayAddress(job: any) {
    const addr =
      String(job.locations?.address_line1 ?? "").trim() ||
      String(job.job_address ?? "").trim() ||
      "No address";
    const city = String(job.locations?.city ?? "").trim() || String(job.city ?? "").trim();

    return city ? `${addr}, ${city}` : addr;
  }

  function retestScheduleLabel(child: any) {
    if (!child) return "";
    const date = child.scheduled_date ? formatBusinessDateUS(String(child.scheduled_date)) : "";
    const window = displayWindowLA(child.window_start, child.window_end);
    if (date && window) return `${date} ${window}`;
    return date || window || "";
  }

  function cardStatusMeta(row: { job: any; resolved: any; openRetestChild?: any }) {
    const lifecycle = String(row.job.status ?? "").trim().toLowerCase();
    const ops = String(row.job.ops_status ?? "").trim().toLowerCase();
    const resolvedLabel = String(row.resolved?.statusLabel ?? "").trim();

    if (resolvedLabel === "Retest Scheduled") return { label: resolvedLabel, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    if (resolvedLabel === "Retest Pending Scheduling") return { label: resolvedLabel, tone: "border-amber-200 bg-amber-50 text-amber-800" };
    if (resolvedLabel === "Failed") return { label: resolvedLabel, tone: "border-rose-200 bg-rose-50 text-rose-800" };
    if (lifecycle === "on_the_way") return { label: "On the Way", tone: "border-sky-200 bg-sky-50 text-sky-800" };
    if (lifecycle === "in_progress") return { label: "In Progress", tone: "border-blue-200 bg-blue-50 text-blue-800" };
    if (ops === "scheduled") return { label: "Scheduled", tone: "border-slate-200 bg-slate-50 text-slate-800" };
    if (row.resolved.bucket === "passed") return { label: "Passed", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    return { label: "In Progress", tone: "border-slate-200 bg-slate-50 text-slate-800" };
  }

  function nextStepText(row: { job: any; resolved: any; openRetestChild?: any }) {
    const lifecycle = String(row.job.status ?? "").trim().toLowerCase();
    if (row.resolved?.retestState === "scheduled" || row.resolved?.retestState === "pending_scheduling") {
      return `Next step: ${String(row.resolved?.nextStep ?? "")}`;
    }
    if (lifecycle === "on_the_way") return "Next step: Technician is on the way.";
    if (lifecycle === "in_progress") return "Next step: Work is currently underway.";
    if (row.resolved.bucket === "action_required") {
      return `Next step: ${row.resolved.primaryIssue?.explanation ?? row.resolved.primaryIssue?.headline ?? "Action required."}`;
    }
    if (String(row.job.ops_status ?? "").trim().toLowerCase() === "scheduled") return "Next step: Await scheduled visit.";
    if (row.resolved.bucket === "passed") return "Next step: Final processing is underway.";
    return "Next step: Monitor job progress.";
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

        <form method="get" className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">

          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search customer, address, city, permit, job title, or reference"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg border bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Apply
            </button>
            {q && (
              <Link
                href={portalHref()}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Reset
              </Link>
            )}
          </div>
        </form>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {labelWithCount("Action Required", actionRequiredJobs.length)}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Failed and missing-information items are prioritized.
          </div>
        </div>

      <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {actionRequiredJobs.slice(0, 5).map(({ job: j, resolved }) => {
            const openRetestChild = openRetestChildByParentId.get(String(j.id));
            const isUrgent =
              Boolean(resolved?.actionRequired) &&
              !!j.follow_up_date && String(j.follow_up_date) <= String(today);
            const displayLines = cardIssueLines(resolved);
            const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });

            return (
              <Link
                key={j.id}
                href={`/portal/jobs/${j.id}`}
                className={[
                  "block border-l-4 p-4 transition-all duration-150 border-l-transparent",
                  "hover:bg-gray-50 hover:shadow-sm dark:hover:bg-gray-800/40",
                  isUrgent ? "border-l-red-500" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {customerName(j)}
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                        {j.title ?? "Untitled Job"}
                      </div>
                    </div>

                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {displayAddress(j)}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusMeta.tone}`}>
                        {statusMeta.label}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${isUrgent ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        {resolved?.actionRequired ? "Action Required" : "No Immediate Action"}
                      </span>
                    </div>

                    <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {nextStepText({ job: j, resolved, openRetestChild })}
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {displayLines.map((line, idx) => (
                        <div key={`${j.id}-line-${idx}`}>{line}</div>
                      ))}
                    </div>
                  </div>

                  <div className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">
                    {j.scheduled_date ? `Service ${formatBusinessDateUS(String(j.scheduled_date))}` : "Service date pending"}
                  </div>
                </div>
              </Link>
            );
          })}

          {actionRequiredJobs.length === 0 && (
            <div className="p-8 text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                No action-required jobs.
              </div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                New failed or pending-info jobs will appear here.
              </div>
            </div>
          )}
        </div>
      </div>

      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {labelWithCount("In Progress", inProgressJobs.length)}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Scheduling and active work states.
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {inProgressJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const displayLines = cardIssueLines(resolved);
              const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
              return (
                <Link
                  key={j.id}
                  href={`/portal/jobs/${j.id}`}
                  className="block p-4 transition-all duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-gray-800/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {customerName(j)}
                      </div>

                      <div className="mt-0.5 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                        {j.title ?? "Untitled Job"}
                      </div>

                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {displayAddress(j)}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusMeta.tone}`}>
                          {statusMeta.label}
                        </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${resolved?.actionRequired ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                            {resolved?.actionRequired ? "Action Required" : "No Immediate Action"}
                        </span>
                      </div>

                      <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {nextStepText({ job: j, resolved, openRetestChild })}
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {displayLines.map((line, idx) => (
                          <div key={`${j.id}-inprogress-line-${idx}`}>{line}</div>
                        ))}
                      </div>
                    </div>

                    <div className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">
                      {j.scheduled_date ? `Service ${formatBusinessDateUS(String(j.scheduled_date))}` : "Schedule pending"}
                    </div>
                  </div>
                </Link>
              );
            })}

            {inProgressJobs.length === 0 && (
              <div className="p-8 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No in-progress jobs.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Jobs that are scheduled or active appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {labelWithCount("Passed", passedJobs.length)}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Passed jobs and completion processing.
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {passedJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const resolvedAt = j.data_entry_completed_at ?? j.created_at;
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const displayLines = cardIssueLines(resolved);
              return (
                <Link
                  key={j.id}
                  href={`/portal/jobs/${j.id}`}
                  className="block p-4 transition-all duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-gray-800/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {customerName(j)}
                      </div>

                      <div className="mt-0.5 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                        {j.title ?? "Untitled Job"}
                      </div>

                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {displayAddress(j)}
                      </div>

                      <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {nextStepText({ job: j, resolved, openRetestChild })}
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {displayLines.map((line, idx) => (
                          <div key={`${j.id}-passed-line-${idx}`}>{line}</div>
                        ))}
                      </div>
                    </div>

                    <div className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">
                      {resolvedAt ? `Resolved ${formatDateLA(String(resolvedAt))}` : "Resolved recently"}
                    </div>
                  </div>
                </Link>
              );
            })}

            {passedJobs.length === 0 && (
              <div className="p-8 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No passed jobs.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Passed jobs will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {resolvedJobs.length > 5 && (
        <div className="flex justify-end pb-2">
          <Link
            href="/portal/jobs"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            View all {resolvedJobs.length} jobs &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}