import type { ContractorIssue } from "@/lib/portal/resolveContractorIssues";

export type PortalJobSection =
  | "action_required"
  | "upcoming_scheduled"
  | "active_work"
  | "waiting"
  | "passed";

type PortalPresentationRow = {
  job: any;
  resolved: any;
  openRetestChild?: any;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function appendReason(base: string, reason: string) {
  const trimmedReason = String(reason ?? "").trim();
  return trimmedReason ? `${base} Reason: ${trimmedReason}` : base;
}

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

  return "";
}

export function getPortalJobSection(row: PortalPresentationRow): PortalJobSection {
  const lifecycle = normalize(row.job.status);
  const ops = normalize(row.job.ops_status);

  if (row.resolved?.bucket === "passed") return "passed";

  if (ops === "pending_info" || ops === "on_hold" || ops === "pending_office_review" || ops === "paperwork_required" || ops === "invoice_required" || ops === "need_to_schedule") {
    return "waiting";
  }

  if (row.resolved?.retestState === "scheduled") return "upcoming_scheduled";

  if (lifecycle === "on_the_way" || lifecycle === "in_progress" || lifecycle === "in_process" || ops === "in_process") {
    return "active_work";
  }

  if (ops === "scheduled") return "upcoming_scheduled";

  if (row.resolved?.bucket === "action_required") return "action_required";

  return "waiting";
}

export function getPortalJobStatusMeta(row: PortalPresentationRow) {
  const lifecycle = normalize(row.job.status);
  const ops = normalize(row.job.ops_status);
  const resolvedLabel = String(row.resolved?.statusLabel ?? "").trim();

  if (ops === "pending_info") return { label: "Pending information", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  if (ops === "on_hold") return { label: "On hold", tone: "border-slate-300 bg-slate-100 text-slate-800" };
  if (ops === "pending_office_review") return { label: "Under review", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" };
  if (resolvedLabel === "Retest Scheduled") return { label: "Retest scheduled", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (resolvedLabel === "Retest Pending Scheduling") return { label: "Retest needs scheduling", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  if (resolvedLabel === "Under Review") return { label: "Under review", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" };
  if (resolvedLabel === "Failed") return { label: "Needs correction", tone: "border-rose-200 bg-rose-50 text-rose-800" };
  if (ops === "paperwork_required") return { label: "Final paperwork", tone: "border-violet-200 bg-violet-50 text-violet-800" };
  if (ops === "invoice_required") return { label: "Final processing", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" };
  if (lifecycle === "on_the_way") return { label: "On the way", tone: "border-sky-200 bg-sky-50 text-sky-800" };
  if (lifecycle === "in_progress" || lifecycle === "in_process" || ops === "in_process") return { label: "In progress", tone: "border-blue-200 bg-blue-50 text-blue-800" };
  if (ops === "scheduled") return { label: "Scheduled", tone: "border-slate-200 bg-slate-50 text-slate-800" };
  if (row.resolved?.bucket === "passed") return { label: "Passed", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return { label: "Waiting", tone: "border-slate-200 bg-slate-50 text-slate-800" };
}

export function getPortalJobDetailLine(row: PortalPresentationRow) {
  const lifecycle = normalize(row.job.status);
  const ops = normalize(row.job.ops_status);
  const pendingInfoReason = String(row.job.pending_info_reason ?? "").trim();
  const onHoldReason = String(row.job.on_hold_reason ?? "").trim();
  const failureDetail = cardDetailLine(row.resolved);

  if (ops === "pending_info") {
    return appendReason("We're waiting on information to keep this job moving.", pendingInfoReason);
  }

  if (ops === "on_hold") {
    return appendReason("This job is currently on hold.", onHoldReason);
  }

  if (ops === "pending_office_review") return "Your recent update was received and is under review.";
  if (ops === "paperwork_required") return "Final paperwork is in progress.";
  if (ops === "invoice_required") return "Final processing is underway.";
  if (row.resolved?.retestState === "scheduled") return "Your retest visit is scheduled.";
  if (lifecycle === "on_the_way") return "Your technician is on the way.";
  if (lifecycle === "in_progress" || lifecycle === "in_process" || ops === "in_process") return "Work is in progress.";
  if (ops === "scheduled") return "Your visit is scheduled.";
  if (failureDetail) return failureDetail;

  return "";
}

export function getPortalJobNextStep(row: PortalPresentationRow) {
  const lifecycle = normalize(row.job.status);
  const ops = normalize(row.job.ops_status);

  if (row.resolved?.bucket === "passed") return "Open the job to review details.";
  if (ops === "pending_info") return "Open this job to review the requested information.";
  if (ops === "on_hold") return "Open this job to review the hold details.";
  if (ops === "pending_office_review") return "Open this job to review the latest update.";
  if (ops === "paperwork_required" || ops === "invoice_required") return "Open this job to review the latest processing details.";
  if (row.resolved?.retestState === "pending_scheduling") return "Open this job to schedule the retest.";
  if (row.resolved?.retestState === "scheduled") return "Open this job to review the retest appointment.";
  if (row.resolved?.bucket === "action_required") return "Open this job to review the issue details and next step.";
  if (lifecycle === "on_the_way" || lifecycle === "in_progress" || lifecycle === "in_process" || ops === "in_process") return "Open this job for live visit details.";
  if (ops === "scheduled") return "Open this job to review your scheduled visit.";
  return "Open this job for details.";
}

export function getPortalSectionSecondaryMeta(section: PortalJobSection) {
  if (section === "action_required") return "Action needed";
  if (section === "upcoming_scheduled") return "Upcoming visit";
  if (section === "active_work") return "Active now";
  if (section === "waiting") return "Waiting update";
  return "";
}