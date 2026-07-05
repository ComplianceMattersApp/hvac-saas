import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import { extractFailureReasons } from "@/lib/portal/resolveContractorIssues";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";
import { buildServiceFollowUpProgressState } from "@/lib/jobs/service-follow-up-progress";
import { formatEccOpsStatusLabel, isEccJobType } from "@/lib/ecc/ecc-workflow-display";

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
	const visitType = String(visit?.service_visit_type ?? "").trim().toLowerCase();
	if (visit?.parent_job_id && visitType === "callback") return "Callback visit";
	if (visit?.parent_job_id && visitType === "return_visit") return "Return visit";
	if (visit?.parent_job_id && String(visit?.job_type ?? "").toLowerCase() === "service") return "Linked service visit";
	if (visit?.parent_job_id) return "Retest visit";
	return `Visit ${idx + 1}`;
}

function formatOpsStatusLabel(value?: string | null, jobType?: string | null) {
	const normalized = String(value ?? "").trim();
	if (!normalized) return "-";

	const eccLabel = isEccJobType(jobType) ? formatEccOpsStatusLabel(normalized, "internal") : null;
	if (eccLabel) return eccLabel;

	const labelMap: Record<string, string> = {
		need_to_schedule: "Need to Schedule",
		scheduled: "Scheduled",
		on_the_way: "On the Way",
		in_process: "In Progress",
		pending_info: "Pending Info",
		pending_office_review: "Office Review Needed",
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
	if (isCurrent) return "bg-blue-600 text-white";
	if (["failed", "retest_needed", "pending_office_review"].includes(normalized)) {
		return "bg-red-100 text-red-800";
	}
	if (normalized === "pending_info") return "bg-amber-100 text-amber-800";
	if (normalized === "scheduled" || normalized === "ready") return "bg-emerald-100 text-emerald-800";
	if (["paperwork_required", "invoice_required", "field_complete"].includes(normalized)) {
		return "bg-blue-100 text-blue-800";
	}
	if (normalized === "closed") return "bg-slate-200 text-slate-800";
	return "bg-slate-100 text-slate-700";
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
			"id, title, status, ops_status, job_type, service_visit_type, created_at, scheduled_date, window_start, window_end, parent_job_id, pending_info_reason"
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

	const retestParentIdsWithActiveChild = new Set<string>();
	for (const visit of serviceChainJobs) {
		const childId = String((visit as any)?.id ?? "").trim();
		const parentId = String((visit as any)?.parent_job_id ?? "").trim();
		const status = String((visit as any)?.status ?? "").trim().toLowerCase();
		const opsStatus = String((visit as any)?.ops_status ?? "").trim().toLowerCase();
		if (!childId || !parentId || status === "cancelled" || opsStatus === "closed") continue;
		retestParentIdsWithActiveChild.add(parentId);
	}

	return (
		<div className="relative max-h-96 space-y-2 overflow-auto pl-7 pr-1 sm:max-h-none sm:overflow-visible sm:pl-8 sm:pr-0">
			<div aria-hidden="true" className="absolute bottom-4 left-3 top-4 w-px bg-slate-200 sm:left-3.5" />
			{serviceChainJobs.map((visit: any, idx: number) => {
				const visitId = String(visit.id ?? "").trim();
				const parentVisitId = String((visit as any)?.parent_job_id ?? "").trim();
				const followUpProgress = serviceFollowUpProgressByJob.get(visitId);
				const isContinuedParent = Boolean(followUpProgress?.continuedThroughChildJobId);
				const isLinkedRetestParent =
					isEccJobType((visit as any)?.job_type) && retestParentIdsWithActiveChild.has(visitId);
				const isContinuationChild = continuedParentIdByChildId.has(visitId);
				const isLinkedChildVisit = Boolean(parentVisitId);
				const isCurrent = visit.id === currentJobId;
				const isCurrentActive = isCurrent && !isContinuedParent && !isLinkedRetestParent;
				const visitLabel = serviceChainVisitLabel(visit, idx);
				const failureReason = serviceChainFailureReasonByJob.get(visitId) ?? "";
				const windowLabel =
					visit.scheduled_date && visit.window_start && visit.window_end
						? `${formatTimeDisplay(visit.window_start)}-${formatTimeDisplay(visit.window_end)}`
						: null;
				const metadataParts = [
					`Created: ${visit.created_at ? formatDateLAFromIso(String(visit.created_at)) : "-"}`,
					visit.scheduled_date ? `Scheduled: ${formatBusinessDateUS(String(visit.scheduled_date))}` : null,
					windowLabel,
				].filter(Boolean) as string[];

				return (
					<div
						key={visit.id}
						className={["relative", isLinkedChildVisit ? "ml-5 sm:ml-7" : ""].join(" ")}
					>
						<span
							aria-hidden="true"
							className={[
								"absolute top-6 h-px bg-slate-300",
								isLinkedChildVisit ? "-left-[2.75rem] w-11 sm:-left-[3.25rem] sm:w-[3.25rem]" : "-left-4 w-4 sm:-left-[1.125rem] sm:w-[1.125rem]",
							].join(" ")}
						/>
						<span
							aria-hidden="true"
							className={[
								"absolute top-[1.15rem] h-3 w-3 rounded-full border-2 bg-white",
								isCurrentActive || isContinuationChild ? "border-blue-600" : isLinkedChildVisit ? "border-slate-500" : "border-slate-300",
								isLinkedChildVisit ? "-left-[2.95rem] sm:-left-[3.45rem]" : "-left-[1.25rem] sm:-left-[1.375rem]",
							].join(" ")}
						/>
						<div
							className={[
								"rounded-xl border p-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]",
								isCurrentActive || isContinuationChild ? "border-slate-900/90 bg-slate-50" : "border-slate-200/80 bg-white",
							].join(" ")}
						>
							{isLinkedChildVisit ? (
								<div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
									Linked to previous visit
								</div>
							) : null}
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<div className="text-sm font-semibold text-slate-950">
										{visitLabel}
										{isCurrentActive ? <span className="ml-2 text-blue-600">Active</span> : null}
										{isContinuationChild ? <span className="ml-2 text-blue-600">Active continuation</span> : null}
									</div>
									<span
										className={[
											"inline-flex rounded-md px-2 py-1 text-xs font-semibold",
											serviceChainBadgeClass(visit.ops_status, isCurrentActive, isContinuedParent || isLinkedRetestParent),
										].join(" ")}
									>
										{isLinkedRetestParent
											? "Linked Retest Created"
											: isContinuedParent
												? "Continued"
												: formatOpsStatusLabel(visit.ops_status, visit.job_type)}
									</span>
								</div>

								<div className="mt-1 text-sm text-slate-800">
									{normalizeRetestLinkedJobTitle(visit.title) || "Untitled Job"}
								</div>

								<div className="mt-1 flex flex-wrap items-center gap-y-1 text-xs text-slate-500">
									{metadataParts.map((part, partIndex) => (
										<span
											key={`${visitId}-metadata-${partIndex}`}
											className={partIndex === 0 ? "pr-2" : "border-l border-slate-300 px-2"}
										>
											{part}
										</span>
									))}
								</div>

								{isContinuedParent ? (
									<div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
										<span className="font-semibold uppercase tracking-[0.08em] text-emerald-700">Continuation:</span>{" "}
										Linked return visit created{followUpProgress?.progressLabel ? ` after ${followUpProgress.progressLabel}` : ""}.
									</div>
								) : null}

								{isLinkedRetestParent ? (
									<div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
										<span className="font-semibold uppercase tracking-[0.08em] text-emerald-700">Retest:</span>{" "}
										Linked retest created. The child retest job is the active scheduling item.
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
					</div>
				);
			})}
		</div>
	);
}
