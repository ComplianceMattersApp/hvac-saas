import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { buildServiceFollowUpProgressState } from "@/lib/jobs/service-follow-up-progress";

type DeferredServiceChainPanelBodyProps = {
	accountOwnerUserId: string;
	currentJobId: string;
	serviceCaseId: string;
	emptyStateClassName: string;
};

function formatDateLAFromIso(iso: string) {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(iso));
}

function formatTimeDisplay(time?: string | null) {
	if (!time) return "";
	const value = String(time);
	return value.slice(0, 5);
}

function finalRunPass(run: any): boolean | null {
	if (!run) return null;
	if (run.computed?.status === "photo_evidence") return null;
	if (run.override_pass != null) return Boolean(run.override_pass);
	if (run.computed_pass != null) return Boolean(run.computed_pass);
	return null;
}

function isFailedFamilyOpsStatus(value?: string | null) {
	return ["failed", "retest_needed", "pending_office_review"].includes(
		String(value ?? "").toLowerCase(),
	);
}

function serviceChainVisitLabel(visit: any, idx: number) {
	if (idx === 0 && !visit?.parent_job_id) return "Original visit";
	if (visit?.parent_job_id && String(visit?.job_type ?? "").toLowerCase() === "service") return "Return visit";
	if (visit?.parent_job_id) return "Retest visit";
	return `Visit ${idx + 1}`;
}

function formatOpsStatusLabel(value?: string | null) {
	const normalized = String(value ?? "").trim();
	if (!normalized) return "â€”";

	const labelMap: Record<string, string> = {
		need_to_schedule: "Need to Schedule",
		scheduled: "Scheduled",
		on_the_way: "On the Way",
		in_process: "In Progress",
		pending_info: "Pending Info",
		pending_office_review: "Pending Office Review",
		on_hold: "On Hold",
		failed: "Failed",
		retest_needed: "Retest Needed",
		paperwork_required: "Paperwork Required",
		invoice_required: "Invoice Required",
		closed: "Closed",
	};

	const mapped = labelMap[normalized.toLowerCase()];
	if (mapped) return mapped;

	return normalized
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function serviceChainBadgeClass(opsStatus?: string | null, isCurrent?: boolean, isContinued?: boolean) {
	const normalized = String(opsStatus ?? "").toLowerCase();

	if (isContinued) return "bg-emerald-100 text-emerald-800";
	if (isCurrent) return "bg-black text-white";
	if (["failed", "retest_needed", "pending_office_review"].includes(normalized)) {
		return "bg-red-100 text-red-800";
	}
	if (normalized === "pending_info") return "bg-amber-100 text-amber-800";
	if (normalized === "scheduled" || normalized === "ready") return "bg-emerald-100 text-emerald-800";
	if (["paperwork_required", "invoice_required", "field_complete"].includes(normalized)) {
		return "bg-blue-100 text-blue-800";
	}
	if (normalized === "closed") return "bg-gray-200 text-gray-800";
	return "bg-gray-100 text-gray-700";
}

export default async function DeferredServiceChainPanelBody({
	accountOwnerUserId,
	currentJobId,
	serviceCaseId,
	emptyStateClassName,
}: DeferredServiceChainPanelBodyProps) {
	const supabase = await createClient();

	const scopedReadJob = await loadScopedInternalJobDetailReadBoundary({
		accountOwnerUserId,
		jobId: currentJobId,
	});

	if (!scopedReadJob?.id) {
		return null;
	}

	const { data: serviceChainJobs, error: serviceChainErr } = await supabase
		.from("jobs")
		.select(
			"id, title, status, ops_status, job_type, created_at, scheduled_date, window_start, window_end, parent_job_id, pending_info_reason"
		)
		.eq("service_case_id", serviceCaseId)
		.is("deleted_at", null)
		.order("created_at", { ascending: true })
		.limit(50);

	if (serviceChainErr) throw new Error(serviceChainErr.message);

	if (!serviceChainJobs || serviceChainJobs.length === 0) {
		return <div className={emptyStateClassName}>No visits found in this service case.</div>;
	}

	const serviceChainJobIds = serviceChainJobs.map((job) => String(job.id ?? "").trim()).filter(Boolean);

	const { data: serviceChainRuns, error: serviceChainRunsErr } =
		serviceChainJobIds.length > 0
			? await supabase
					.from("ecc_test_runs")
					.select(
						"id, job_id, created_at, test_type, computed, computed_pass, override_pass, is_completed"
					)
					.in("job_id", serviceChainJobIds)
					.eq("is_completed", true)
					.order("created_at", { ascending: false })
			: { data: [], error: null };

	if (serviceChainRunsErr) throw new Error(serviceChainRunsErr.message);

	const { data: serviceFollowUpEvents, error: serviceFollowUpEventsErr } =
		serviceChainJobIds.length > 0
			? await supabase
					.from("job_events")
					.select("job_id, created_at, meta")
					.in("job_id", serviceChainJobIds)
					.eq("event_type", "ops_update")
					.order("created_at", { ascending: true })
			: { data: [], error: null };

	if (serviceFollowUpEventsErr) throw new Error(serviceFollowUpEventsErr.message);

	const serviceFollowUpEventsByJob = new Map<string, Array<{ created_at?: string | null; meta?: unknown }>>();
	for (const event of serviceFollowUpEvents ?? []) {
		const rowJobId = String((event as any)?.job_id ?? "").trim();
		if (!rowJobId) continue;
		const rows = serviceFollowUpEventsByJob.get(rowJobId) ?? [];
		rows.push({ created_at: (event as any)?.created_at ?? null, meta: (event as any)?.meta ?? null });
		serviceFollowUpEventsByJob.set(rowJobId, rows);
	}

	const latestFailedServiceChainRunByJob = new Map<string, any>();
	for (const run of serviceChainRuns ?? []) {
		const rowJobId = String(run.job_id ?? "").trim();
		if (!rowJobId) continue;
		if (finalRunPass(run) === false && !latestFailedServiceChainRunByJob.has(rowJobId)) {
			latestFailedServiceChainRunByJob.set(rowJobId, run);
		}
	}

	const serviceChainFailureReasonByJob = new Map<string, string>();
	for (const [rowJobId, run] of latestFailedServiceChainRunByJob.entries()) {
		const primaryReason = String(extractFailureReasons(run)[0] ?? "").trim();
		if (primaryReason) serviceChainFailureReasonByJob.set(rowJobId, primaryReason);
	}

	const serviceFollowUpProgressByJob = new Map<string, ReturnType<typeof buildServiceFollowUpProgressState>>();
	for (const visit of serviceChainJobs) {
		const visitId = String((visit as any)?.id ?? "").trim();
		if (!visitId) continue;
		serviceFollowUpProgressByJob.set(visitId, buildServiceFollowUpProgressState({
			pendingInfoReason: (visit as any)?.pending_info_reason ?? null,
			events: serviceFollowUpEventsByJob.get(visitId) ?? [],
		}));
	}

	const continuedParentIdByChildId = new Map<string, string>();
	for (const [parentId, state] of serviceFollowUpProgressByJob.entries()) {
		if (state.continuedThroughChildJobId) {
			continuedParentIdByChildId.set(state.continuedThroughChildJobId, parentId);
		}
	}

	return (
		<div className="max-h-96 space-y-2 overflow-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
			{serviceChainJobs.map((visit: any, idx: number) => {
				const visitId = String(visit.id ?? "").trim();
				const followUpProgress = serviceFollowUpProgressByJob.get(visitId);
				const isContinuedParent = Boolean(followUpProgress?.continuedThroughChildJobId);
				const isContinuationChild = continuedParentIdByChildId.has(visitId);
				const isCurrent = visit.id === currentJobId;
				const isCurrentActive = isCurrent && !isContinuedParent;
				const visitLabel = serviceChainVisitLabel(visit, idx);
				const failureReason = serviceChainFailureReasonByJob.get(visitId) ?? "";
				const windowLabel =
					visit.scheduled_date && visit.window_start && visit.window_end
						? `${formatTimeDisplay(visit.window_start)}â€“${formatTimeDisplay(visit.window_end)}`
						: null;

				return (
					<div
						key={visit.id}
						className={[
							"rounded-xl border p-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]",
							isCurrentActive || isContinuationChild ? "border-slate-900/90 bg-slate-50" : "border-slate-200/80 bg-white",
						].join(" ")}
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<div className="text-sm font-semibold text-slate-950">
										{visitLabel}
										{isCurrentActive ? <span className="text-blue-600"> • Active</span> : null}
										{isContinuationChild ? <span className="text-blue-600"> • Active continuation</span> : null}
									</div>
									<span
										className={[
											"inline-flex rounded-md px-2 py-1 text-xs font-semibold",
											serviceChainBadgeClass(visit.ops_status, isCurrentActive, isContinuedParent),
										].join(" ")}
									>
										{isContinuedParent ? "Continued" : formatOpsStatusLabel(visit.ops_status)}
									</span>
								</div>

								<div className="mt-1 text-sm text-slate-800">
									{normalizeRetestLinkedJobTitle(visit.title) || "Untitled Job"}
								</div>

								<div className="mt-1 text-xs text-slate-500">
									Created: {visit.created_at ? formatDateLAFromIso(String(visit.created_at)) : "â€”"}
									{visit.scheduled_date ? ` â€¢ Scheduled: ${formatBusinessDateUS(String(visit.scheduled_date))}` : ""}
									{windowLabel ? ` â€¢ ${windowLabel}` : ""}
								</div>

								{isContinuedParent ? (
									<div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
										<span className="font-semibold uppercase tracking-[0.08em] text-emerald-700">Continuation:</span>{" "}
										Linked return visit created{followUpProgress?.progressLabel ? ` after ${followUpProgress.progressLabel}` : ""}.
									</div>
								) : null}

								{isFailedFamilyOpsStatus(visit.ops_status) && failureReason ? (
									<div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
										<span className="font-semibold uppercase tracking-[0.08em] text-rose-700">Reason:</span>{" "}
										{failureReason}
									</div>
								) : null}
							</div>

							{!isCurrent ? (
								<Link
									href={`/jobs/${visit.id}?tab=ops`}
									className="text-sm font-medium text-blue-700 underline decoration-blue-200 underline-offset-4"
								>
									View Job
								</Link>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}
