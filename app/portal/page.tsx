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
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { displayWindowLA, formatBusinessDateUS } from "@/lib/utils/schedule-la";
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
    })
    .slice(0, 50);

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
    const city = String(job.locations?.city ?? "").trim() || String(job.city ?? "").trim();
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

    if (resolvedLabel === "Retest Scheduled") return { label: "Retest Scheduled", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    if (resolvedLabel === "Retest Pending Scheduling") return { label: "Needs to be scheduled", tone: "border-amber-200 bg-amber-50 text-amber-800" };
    if (resolvedLabel === "Under Review") return { label: "Under review", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" };
    if (resolvedLabel === "Failed") return { label: "Needs correction", tone: "border-rose-200 bg-rose-50 text-rose-800" };
    if (ops === "paperwork_required") return { label: "Paperwork in Progress", tone: "border-violet-200 bg-violet-50 text-violet-800" };
    if (ops === "invoice_required") return { label: "Final Processing", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" };
    if (lifecycle === "on_the_way") return { label: "On the way", tone: "border-sky-200 bg-sky-50 text-sky-800" };
    if (lifecycle === "in_progress" || lifecycle === "in_process" || ops === "in_process") return { label: "Work in progress", tone: "border-blue-200 bg-blue-50 text-blue-800" };
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
    <div className="max-w-6xl mx-auto space-y-8 pt-4 text-gray-900 dark:text-gray-100">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-white via-gray-50 to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 p-6 shadow-md">
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
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
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

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {labelWithCount("Action Needed", actionRequiredJobs.length)}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Jobs that need your input or follow-up.
          </div>
        </div>

      <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {actionRequiredJobs.slice(0, 5).map(({ job: j, resolved }) => {
            const openRetestChild = openRetestChildByParentId.get(String(j.id));
            const detailLine = preferredStatusMessage({ job: j, resolved, openRetestChild });
            const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
            const isPendingInfoOps = String(j?.ops_status ?? "").trim().toLowerCase() === "pending_info";

            return (
              <Link
                key={j.id}
                href={`/portal/jobs/${j.id}`}
                className={[
                  "block p-4 transition-all duration-150",
                  "hover:bg-gray-50 hover:shadow-sm dark:hover:bg-gray-800/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {customerName(j)}
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                        {normalizeRetestLinkedJobTitle(j.title) || "Untitled Job"}
                      </div>
                    </div>

                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {displayAddress(j)}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusMeta.tone}`}>
                        {statusMeta.label}
                      </span>
                      {isPendingInfoOps ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                          Pending Info
                        </span>
                      ) : null}
                    </div>

                    {detailLine ? (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detailLine}</div>
                    ) : (
                      <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {nextStepText({ job: j, resolved, openRetestChild })}
                      </div>
                    ) : null}
                    {(() => {
                      const count = attachmentCountByJob.get(String(j.id)) ?? 0;
                      if (count === 0) return null;
                      return <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">📷 {count} {count === 1 ? "photo" : "photos"} uploaded</div>;
                    })()}
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
                No action needed right now.
              </div>
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Any jobs that need your attention will show up here.
              </div>
            </div>
          )}
        </div>
      </div>

      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {labelWithCount("In Progress", inProgressJobs.length)}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Field work and office follow-through in progress.
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {inProgressJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = preferredStatusMessage({ job: j, resolved, openRetestChild });
              const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
              const isPendingInfoOps = String(j?.ops_status ?? "").trim().toLowerCase() === "pending_info";
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
                        {normalizeRetestLinkedJobTitle(j.title) || "Untitled Job"}
                      </div>

                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {displayAddress(j)}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusMeta.tone}`}>
                          {statusMeta.label}
                        </span>
                        {isPendingInfoOps ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                            Pending Info
                          </span>
                        ) : null}
                      </div>

                      {detailLine ? (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detailLine}</div>
                      ) : (
                        <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          {nextStepText({ job: j, resolved, openRetestChild })}
                        </div>
                      ) : null}
                      {(() => {
                        const count = attachmentCountByJob.get(String(j.id)) ?? 0;
                        if (count === 0) return null;
                        return <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">📷 {count} {count === 1 ? "photo" : "photos"} uploaded</div>;
                      })()}
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
                  No jobs in progress.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Scheduled jobs and office follow-through will appear here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {labelWithCount("Passed", passedJobs.length)}
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Jobs that have passed inspection.
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {passedJobs.slice(0, 5).map(({ job: j, resolved }) => {
              const resolvedAt = j.data_entry_completed_at ?? j.created_at;
              const openRetestChild = openRetestChildByParentId.get(String(j.id));
              const detailLine = preferredStatusMessage({ job: j, resolved, openRetestChild });
              const statusMeta = cardStatusMeta({ job: j, resolved, openRetestChild });
              const isPendingInfoOps = String(j?.ops_status ?? "").trim().toLowerCase() === "pending_info";
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
                        {normalizeRetestLinkedJobTitle(j.title) || "Untitled Job"}
                      </div>

                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {displayAddress(j)}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusMeta.tone}`}>
                          {statusMeta.label}
                        </span>
                        {isPendingInfoOps ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                            Pending Info
                          </span>
                        ) : null}
                      </div>

                      {detailLine ? (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detailLine}</div>
                      ) : (
                        <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          {nextStepText({ job: j, resolved, openRetestChild })}
                        </div>
                      ) : null}
                      {(() => {
                        const count = attachmentCountByJob.get(String(j.id)) ?? 0;
                        if (count === 0) return null;
                        return <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">📷 {count} {count === 1 ? "photo" : "photos"} uploaded</div>;
                      })()}
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
                  No passed jobs yet.
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Jobs that have passed inspection will appear here.
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
            className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            View all {resolvedJobs.length} jobs &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}