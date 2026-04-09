//app portal/page
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  extractFailureReasons,
  finalRunPass,
  resolveContractorIssues,
} from "@/lib/portal/resolveContractorIssues";
import PortalJobListItem from "@/components/portal/PortalJobListItem";
import {
  getPortalJobDetailLine,
  getPortalJobNextStep,
  getPortalJobSection,
  getPortalJobStatusMeta,
  getPortalSectionSecondaryMeta,
} from "@/lib/portal/portal-job-presentation";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { isPortalVisibleJob } from "@/lib/visibility/portal";
import { matchesNormalizedSearch } from "@/lib/utils/search-normalization";

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

const portalPrimaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_16px_28px_-20px_rgba(37,99,235,0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const portalSecondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800";
const portalMetricChipClass =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]";

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
      lifecycle_state,
      ops_status,
      permit_number,
      pending_info_reason,
      on_hold_reason,
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

  function matchesSearch(job: any) {
    return matchesNormalizedSearch({
      query: q,
      values: [
        job?.title,
        job?.customer_first_name,
        job?.customer_last_name,
        job?.customer_phone,
        job?.job_address,
        job?.city,
        job?.locations?.address_line1,
        job?.locations?.city,
        job?.locations?.zip,
        job?.permit_number,
        job?.id,
      ],
    });
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

  // Attachment counts for "photos uploaded" signal on cards
  const { data: attachmentCounts } = await supabase
    .from("attachments")
    .select("entity_id")
    .eq("entity_type", "job")
    .in("entity_id", scopedJobIds.length ? scopedJobIds : ["00000000-0000-0000-0000-000000000000"]);

  const attachmentCountByJob = new Map<string, number>();
  for (const row of attachmentCounts ?? []) {
    const id = String((row as any).entity_id ?? "").trim();
    if (!id) continue;
    attachmentCountByJob.set(id, (attachmentCountByJob.get(id) ?? 0) + 1);
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

    return {
      job,
      resolved,
      openRetestChild,
    };
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
    .filter((row) => getPortalJobSection(row) === "action_required")
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

  const upcomingScheduledJobs = activeResolvedJobs
    .filter((row) => getPortalJobSection(row) === "upcoming_scheduled")
    .sort((a, b) => {
      const aDate = toDateMs(a.job.scheduled_date ?? a.job.created_at);
      const bDate = toDateMs(b.job.scheduled_date ?? b.job.created_at);
      return aDate - bDate;
    });

  const activeWorkJobs = activeResolvedJobs
    .filter((row) => getPortalJobSection(row) === "active_work")
    .sort((a, b) => toDateMs(b.job.created_at) - toDateMs(a.job.created_at));

  const waitingJobs = activeResolvedJobs
    .filter((row) => getPortalJobSection(row) === "waiting")
    .sort((a, b) => toDateMs(b.job.created_at) - toDateMs(a.job.created_at));

  const passedJobs = activeResolvedJobs
    .filter((row) => row.resolved.bucket === "passed")
    .sort((a, b) => {
      const aResolved = toDateMs(a.job.data_entry_completed_at ?? a.job.created_at);
      const bResolved = toDateMs(b.job.data_entry_completed_at ?? b.job.created_at);
      return bResolved - aResolved;
    })
    .slice(0, 50);

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
    const state = String(job.locations?.state ?? "").trim();
    const zip = String(job.locations?.zip ?? "").trim();
    const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");

    return cityStateZip ? `${addr}, ${cityStateZip}` : addr;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pt-4 text-gray-900 dark:text-gray-100">
      <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98)_58%,rgba(239,246,255,0.72))] p-5 shadow-[0_26px_52px_-36px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(17,24,39,0.96)_62%,rgba(15,23,42,0.92))] sm:p-6 lg:p-6">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start lg:gap-5">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/92 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-[0_14px_26px_-28px_rgba(15,23,42,0.24)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {contractorName}
            </div>
            <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Contractor Portal
            </div>
            <h1 className="mt-1 text-[clamp(1.7rem,3vw,2.5rem)] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
              Job status at a glance.
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Clear status, upcoming visits, active work, waiting states, and recent outcomes across your portal jobs.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 lg:items-end">
            <Link
              href="/jobs/new"
              className={portalPrimaryButtonClass}
            >
              + Add Job
            </Link>
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {activeResolvedJobs.length} portal jobs
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 lg:mt-5">
          <div className={`${portalMetricChipClass} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300`}>
            {actionRequiredJobs.length} action needed
          </div>
          <div className={`${portalMetricChipClass} border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200`}>
            {upcomingScheduledJobs.length} upcoming
          </div>
          <div className={`${portalMetricChipClass} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300`}>
            {activeWorkJobs.length} active work
          </div>
          <div className={`${portalMetricChipClass} border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200`}>
            {waitingJobs.length} waiting
          </div>
          <div className={`${portalMetricChipClass} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300`}>
            {passedJobs.length} passed
          </div>
        </div>

        <form method="get" className="mt-4 grid grid-cols-1 gap-2.5 rounded-2xl border border-slate-200/80 bg-white/75 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] md:grid-cols-[1fr_auto] dark:border-slate-700 dark:bg-slate-950/35 dark:shadow-none">

          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search customer, address, permit, or job reference"
            className="w-full rounded-xl border border-slate-300/80 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          <div className="flex items-center gap-2 md:justify-end">
            <button
              type="submit"
              className={portalSecondaryButtonClass}
            >
              Search
            </button>
            {q && (
              <Link
                href={portalHref()}
                className={portalSecondaryButtonClass}
              >
                Reset
              </Link>
            )}
          </div>
        </form>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Priority Queue
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("Action Needed", actionRequiredJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            Waiting on your input, correction, or follow-up.
          </div>
        </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {actionRequiredJobs.slice(0, 5).map(({ job: j, resolved }) => {
            const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = getPortalJobDetailLine({ job: j, resolved, openRetestChild });
              const statusMeta = getPortalJobStatusMeta({ job: j, resolved, openRetestChild });
            const photoCount = attachmentCountByJob.get(String(j.id)) ?? 0;

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
                nextStep={getPortalJobNextStep({ job: j, resolved, openRetestChild })}
                secondaryMeta={getPortalSectionSecondaryMeta("action_required")}
                photoCount={photoCount}
              />
            );
          })}

          {actionRequiredJobs.length === 0 && (
            <div className="px-6 py-6 text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                No action needed right now.
              </div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                New follow-up items will appear here.
              </div>
            </div>
          )}
        </div>
      </div>

      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Upcoming Scheduled
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("Upcoming Scheduled", upcomingScheduledJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            Scheduled visits that are confirmed but not yet live.
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {upcomingScheduledJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = getPortalJobDetailLine({ job: j, resolved, openRetestChild });
              const statusMeta = getPortalJobStatusMeta({ job: j, resolved, openRetestChild });

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
                  nextStep={getPortalJobNextStep({ job: j, resolved, openRetestChild })}
                  secondaryMeta={j.scheduled_date ? `Service ${formatBusinessDateUS(String(j.scheduled_date))}` : getPortalSectionSecondaryMeta("upcoming_scheduled")}
                  photoCount={attachmentCountByJob.get(String(j.id)) ?? 0}
                />
              );
            })}

            {upcomingScheduledJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No upcoming scheduled visits.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Confirmed visits will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Active Work
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("Active Work", activeWorkJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            Live visits that are on the way or already in progress.
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {activeWorkJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = getPortalJobDetailLine({ job: j, resolved, openRetestChild });
              const statusMeta = getPortalJobStatusMeta({ job: j, resolved, openRetestChild });
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
                  nextStep={getPortalJobNextStep({ job: j, resolved, openRetestChild })}
                  secondaryMeta={getPortalSectionSecondaryMeta("active_work")}
                  photoCount={attachmentCountByJob.get(String(j.id)) ?? 0}
                />
              );
            })}

            {activeWorkJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No active work right now.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Live visits will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Waiting States
            </div>
          <h2 className="mt-0.5 text-[1.1rem] font-semibold tracking-[-0.02em] text-gray-900 dark:text-gray-100">
            {labelWithCount("Waiting", waitingJobs.length)}
          </h2>
          </div>
          <div className="max-w-md text-sm leading-5 text-slate-600 dark:text-slate-300 sm:text-right">
            On-hold, pending-information, review, and final-processing jobs that are not currently live.
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950/80">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {waitingJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = getPortalJobDetailLine({ job: j, resolved, openRetestChild });
              const statusMeta = getPortalJobStatusMeta({ job: j, resolved, openRetestChild });

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
                  nextStep={getPortalJobNextStep({ job: j, resolved, openRetestChild })}
                  secondaryMeta={getPortalSectionSecondaryMeta("waiting")}
                  photoCount={attachmentCountByJob.get(String(j.id)) ?? 0}
                />
              );
            })}

            {waitingJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No waiting-state jobs.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Non-live waits and processing updates will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

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
            {passedJobs.slice(0, 5).map(({ job: j, resolved }) => {
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
                  photoCount={attachmentCountByJob.get(String(j.id)) ?? 0}
                />
              );
            })}

            {passedJobs.length === 0 && (
              <div className="px-6 py-6 text-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No passed jobs yet.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Completed jobs will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {activeResolvedJobs.length > 5 && (
        <div className="flex justify-end pb-2">
          <Link
            href="/portal/jobs"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,color,transform] hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            View all {activeResolvedJobs.length} jobs
          </Link>
        </div>
      )}
    </div>
  );
}