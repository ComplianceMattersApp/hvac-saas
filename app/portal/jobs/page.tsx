// app/portal/jobs/page.tsx — View all contractor jobs (uncapped)
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FlashBanner from "@/components/ui/FlashBanner";
import PortalJobListItem from "@/components/portal/PortalJobListItem";
import {
  extractFailureReasons,
  finalRunPass,
  resolveContractorIssues,
  type ContractorIssue,
} from "@/lib/portal/resolveContractorIssues";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { isPortalVisibleJob } from "@/lib/visibility/portal";

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

const portalSecondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800";
const portalMetricChipClass =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]";

export default async function PortalAllJobsPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const supabase = await createClient();
  const sp: SP = (searchParams ? await searchParams : {}) ?? {};
  const banner = (sp1(sp.banner) ?? "").toString().trim();

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
      lifecycle_state,
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
      locations:location_id ( address_line1, city, state, zip )
    `
    )
    .eq("contractor_id", contractorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (baseJobsErr) throw baseJobsErr;

  const jobs = ((baseJobs ?? []) as any[]).filter(isPortalVisibleJob);
  const openRetestChildByParentId = new Map<string, any>();
  const resolvedRetestParentIds = new Set<string>();
  for (const candidate of jobs) {
    const parentId = String(candidate.parent_job_id ?? "").trim();
    if (!parentId) continue;
    const childStatus = String(candidate.ops_status ?? "").toLowerCase();
    if (["paperwork_required", "invoice_required", "closed"].includes(childStatus)) {
      resolvedRetestParentIds.add(parentId);
      continue;
    }

    const current = openRetestChildByParentId.get(parentId);
    if (!current || toDateMs(candidate.created_at) > toDateMs(current.created_at)) {
      openRetestChildByParentId.set(parentId, candidate);
    }
  }
  const jobIds = jobs.map((j: any) => j.id);

  const { data: visibleRuns, error: visibleRunsErr } = await supabase
    .from("ecc_test_runs")
    .select(
      "job_id, created_at, test_type, computed_pass, override_pass, computed, is_completed"
    )
    .in("job_id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"])
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
    .in("job_id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"])
    .in("event_type", [
      "contractor_correction_submission",
      "contractor_note",
      "retest_ready_requested",
      "status_changed",
    ])
    .order("created_at", { ascending: false })
    .limit(2000);

  if (rawIssueEventsErr) throw rawIssueEventsErr;

  const eventsByJob = new Map<string, any[]>();
  for (const ev of rawIssueEvents ?? []) {
    const jobId = String((ev as any)?.job_id ?? "").trim();
    if (!jobId) continue;
    if (!eventsByJob.has(jobId)) eventsByJob.set(jobId, []);
    eventsByJob.get(jobId)!.push(ev);
  }

  const resolvedJobs = jobs.map((job: any) => {
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
        follow_up_date: job.follow_up_date,
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

    return { job, resolved, openRetestChild };
  });

  // Exclude parent jobs that have an active (non-closed) retest child.
  // Exclude parent jobs that have any retest child — active or resolved.
  // The retest child is the actionable/outcome unit; the parent must not appear in active portal views.
  const activeResolvedJobs = resolvedJobs.filter(
    ({ job }) =>
      !openRetestChildByParentId.has(String(job.id)) &&
      !resolvedRetestParentIds.has(String(job.id))
  );

  const actionRequiredJobs = activeResolvedJobs
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

  const inProgressJobs = activeResolvedJobs
    .filter((row) => row.resolved.bucket === "in_progress")
    .sort((a, b) => toDateMs(b.job.created_at) - toDateMs(a.job.created_at));

  const passedJobs = activeResolvedJobs
    .filter((row) => row.resolved.bucket === "passed")
    .sort((a, b) => {
      const aResolved = toDateMs(a.job.data_entry_completed_at ?? a.job.created_at);
      const bResolved = toDateMs(b.job.data_entry_completed_at ?? b.job.created_at);
      return bResolved - aResolved;
    });

  function cardDetailLine(input: {
    primaryIssue: ContractorIssue;
    secondaryIssues?: ContractorIssue[];
  }) {

    const failedIssue =
      input.primaryIssue.group === "failed"
        ? input.primaryIssue
        : (input.secondaryIssues ?? []).find((issue) => issue.group === "failed");

    const firstFailure = String((failedIssue?.detailLines ?? [])[0] ?? "").trim();
    if (firstFailure) {
      return firstFailure.toLowerCase().startsWith("failed") ? firstFailure : `Failed - ${firstFailure}`;
    }

    const needsInfoIssue =
      input.primaryIssue.group === "needs_info"
        ? input.primaryIssue
        : (input.secondaryIssues ?? []).find((issue) => issue.group === "needs_info");

    const needsInfoHeadline = String(needsInfoIssue?.headline ?? "").trim();
    if (needsInfoHeadline) {
      return `Missing info: ${needsInfoHeadline}`;
    }

    return "";
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
    const city =
      String(job.locations?.city ?? "").trim() || String(job.city ?? "").trim();
    const state = String(job.locations?.state ?? "").trim();
    const zip = String(job.locations?.zip ?? "").trim();
    const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    return cityStateZip ? `${addr}, ${cityStateZip}` : addr;
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

    if (ops === "pending_info" || row.resolved?.primaryIssue?.group === "needs_info") return { label: "Needs info", tone: "border-amber-200 bg-amber-50 text-amber-800" };
    if (resolvedLabel === "Retest Scheduled") return { label: "Retest Scheduled", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    if (resolvedLabel === "Retest Pending Scheduling") return { label: "Ready to schedule", tone: "border-amber-200 bg-amber-50 text-amber-800" };
    if (resolvedLabel === "Under Review") return { label: "Under review", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" };
    if (resolvedLabel === "Failed") return { label: "Needs correction", tone: "border-rose-200 bg-rose-50 text-rose-800" };
    if (ops === "paperwork_required") return { label: "Final paperwork", tone: "border-violet-200 bg-violet-50 text-violet-800" };
    if (ops === "invoice_required") return { label: "Final Processing", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" };
    if (lifecycle === "on_the_way") return { label: "On the way", tone: "border-sky-200 bg-sky-50 text-sky-800" };
    if (lifecycle === "in_progress" || lifecycle === "in_process" || ops === "in_process") return { label: "In progress", tone: "border-blue-200 bg-blue-50 text-blue-800" };
    if (ops === "scheduled") return { label: "Scheduled", tone: "border-slate-200 bg-slate-50 text-slate-800" };
    if (row.resolved.bucket === "passed") return { label: "Passed", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    return { label: "In progress", tone: "border-slate-200 bg-slate-50 text-slate-800" };
  }

  function preferredStatusMessage(row: { job: any; resolved: any; openRetestChild?: any }) {
    const ops = String(row.job.ops_status ?? "").trim().toLowerCase();
    const detailLine = cardDetailLine(row.resolved);
    if (detailLine) return detailLine;

    const pendingInfoReason = String(row.job.pending_info_reason ?? "").trim();
    if (ops === "pending_info") {
      return pendingInfoReason ? `Missing info: ${pendingInfoReason}` : "";
    }

    if (ops === "pending_office_review") {
      return String(row.resolved?.primaryIssue?.explanation ?? "").trim();
    }

    if (ops === "failed" || ops === "retest_needed") {
      const stage = String(row.resolved?.primaryIssue?.stage ?? "").trim().toLowerCase();
      if (["awaiting_review", "retest_pending_scheduling", "retest_scheduled"].includes(stage)) {
        return String(row.resolved?.primaryIssue?.explanation ?? row.resolved?.primaryIssue?.headline ?? "").trim();
      }
      return "";
    }

    return "";
  }

  function nextStepText(row: { job: any; resolved: any; openRetestChild?: any }) {
    const lifecycle = String(row.job.status ?? "").trim().toLowerCase();
    const ops = String(row.job.ops_status ?? "").trim().toLowerCase();
    if (row.resolved?.retestState === "scheduled" || row.resolved?.bucket === "passed") return "Open the job to review details.";
    if (ops === "pending_office_review") return "Corrections were submitted and are currently under internal review.";
    if (row.resolved?.primaryIssue?.group === "needs_info") return "Open this job to provide the requested information.";
    if (ops === "failed" || ops === "retest_needed" || row.resolved?.primaryIssue?.group === "failed") return "Open this job to review the issue details and next step.";
    if (ops === "paperwork_required") return "Field work is complete. We're finishing the paperwork.";
    if (ops === "invoice_required") return "Field work is complete. We're completing final processing.";
    if (row.resolved?.retestState === "pending_scheduling") return "Open this job to schedule a retest.";
    if (lifecycle === "on_the_way" || lifecycle === "in_progress" || lifecycle === "in_process" || ops === "scheduled" || ops === "in_process") {
      return "Your technician is on the way or work is scheduled.";
    }
    return "Open this job for details.";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-gray-900 dark:text-gray-100">
      {banner === "invalid_request" ? (
        <FlashBanner
          type="warning"
          message="That action could not be completed. Please open the job and try again."
        />
      ) : null}

      <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_60%,rgba(239,246,255,0.68))] p-5 shadow-[0_26px_52px_-36px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(17,24,39,0.96)_62%,rgba(15,23,42,0.92))] sm:p-6 lg:p-6">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-5">
          <div className="max-w-2xl">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              <Link href="/portal" className="hover:underline">
                ← Portal
              </Link>
            </div>
            <div className="mt-4 inline-flex items-center rounded-full border border-slate-200/80 bg-white/92 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-[0_14px_26px_-28px_rgba(15,23,42,0.24)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {contractorName}
            </div>
            <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Contractor Jobs
            </div>
            <h1 className="mt-1 text-[clamp(1.7rem,3vw,2.4rem)] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
              Active jobs portfolio
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Every portal-visible job, with status and next step surfaced for faster review.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-[240px] lg:justify-end">
            <div className={`${portalMetricChipClass} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300`}>
              {actionRequiredJobs.length} attention
            </div>
            <div className={`${portalMetricChipClass} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300`}>
              {inProgressJobs.length} in progress
            </div>
            <div className={`${portalMetricChipClass} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300`}>
              {passedJobs.length} passed
            </div>
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {activeResolvedJobs.length} total
            </div>
          </div>
        </div>
      </div>

      {/* Needs Attention */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Priority Queue
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("Needs Attention", actionRequiredJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            Waiting on your response, correction, or scheduling.
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {actionRequiredJobs.map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = preferredStatusMessage({ job: j, resolved, openRetestChild });
              const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
              return (
                <PortalJobListItem
                  key={j.id}
                  href={`/portal/jobs/${j.id}`}
                  customerName={customerName(j)}
                  title={normalizeRetestLinkedJobTitle(j.title) || "Untitled Job"}
                  address={displayAddress(j)}
                  statusLabel={statusMeta.label}
                  statusToneClass={statusMeta.tone}
                  detailLine={detailLine}
                  nextStep={nextStepText({ job: j, resolved, openRetestChild })}
                  secondaryMeta={j.scheduled_date ? `Service ${formatBusinessDateUS(j.scheduled_date)}` : "Service date pending"}
                />
              );
            })}

            {actionRequiredJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No jobs need attention.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  New follow-up items will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* In Progress */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Active Work
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("In Progress", inProgressJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            Work underway or moving through final processing.
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {inProgressJobs.map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = preferredStatusMessage({ job: j, resolved, openRetestChild });
              const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
              return (
                <PortalJobListItem
                  key={j.id}
                  href={`/portal/jobs/${j.id}`}
                  customerName={customerName(j)}
                  title={normalizeRetestLinkedJobTitle(j.title) || "Untitled Job"}
                  address={displayAddress(j)}
                  statusLabel={statusMeta.label}
                  statusToneClass={statusMeta.tone}
                  detailLine={detailLine}
                  nextStep={nextStepText({ job: j, resolved, openRetestChild })}
                  secondaryMeta={j.scheduled_date ? `Service ${formatBusinessDateUS(String(j.scheduled_date))}` : "Schedule pending"}
                />
              );
            })}

            {inProgressJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No in-progress jobs.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Active work will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Passed */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Completed Outcomes
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("Passed", passedJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            Passed jobs and recent completion outcomes.
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {passedJobs.map(({ job: j, resolved }) => {
              const resolvedAt = j.data_entry_completed_at ?? j.created_at;
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = preferredStatusMessage({ job: j, resolved, openRetestChild });
              const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
              return (
                <PortalJobListItem
                  key={j.id}
                  href={`/portal/jobs/${j.id}`}
                  customerName={customerName(j)}
                  title={normalizeRetestLinkedJobTitle(j.title) || "Untitled Job"}
                  address={displayAddress(j)}
                  statusLabel={statusMeta.label}
                  statusToneClass={statusMeta.tone}
                  detailLine={detailLine}
                  nextStep={nextStepText({ job: j, resolved, openRetestChild })}
                  secondaryMeta={resolvedAt ? `Resolved ${formatDateLA(String(resolvedAt))}` : "Resolved recently"}
                />
              );
            })}

            {passedJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No passed jobs.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Completed results will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
