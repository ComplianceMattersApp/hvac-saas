import { createClient } from "@/lib/supabase/server";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import {
  WORKFLOW_MILESTONE_STATUSES,
  listActiveWorkflowInstancesByServiceCase,
  listWorkflowInstanceMilestones,
  type WorkflowMilestoneStatus,
} from "@/lib/workflows/read-model";
import {
  assignInstallWithPermitWorkflowForJobFromForm,
  recordExternalEccCompletionForWorkflowMilestoneFromForm,
  updateWorkflowMilestoneStatusFromForm,
} from "@/lib/workflows/actions";

type DeferredWorkflowMilestonesPanelBodyProps = {
  accountOwnerUserId: string;
  currentJobId: string;
  serviceCaseId: string;
  canManageWorkflowGuidance: boolean;
  returnToPath: string;
  emptyStateClassName: string;
};

const statusLabelMap: Record<WorkflowMilestoneStatus, string> = {
  planned: "Planned",
  ready: "Ready",
  in_progress: "In Progress",
  completed: "Completed",
  skipped: "Skipped",
  blocked: "Blocked",
  waiting: "Waiting",
  needs_attention: "Needs Attention",
  superseded: "Superseded",
};

const statusBadgeClassMap: Record<WorkflowMilestoneStatus, string> = {
  planned: "bg-slate-100 text-slate-700 border-slate-200",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  skipped: "bg-zinc-200 text-zinc-700 border-zinc-300",
  blocked: "bg-rose-100 text-rose-800 border-rose-200",
  waiting: "bg-amber-100 text-amber-800 border-amber-200",
  needs_attention: "bg-orange-100 text-orange-800 border-orange-200",
  superseded: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toWorkflowMilestoneStatus(value: unknown): WorkflowMilestoneStatus {
  const normalized = cleanString(value).toLowerCase();
  if ((WORKFLOW_MILESTONE_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as WorkflowMilestoneStatus;
  }
  return "planned";
}

function formatStatusLabel(status: WorkflowMilestoneStatus) {
  return statusLabelMap[status] ?? "Planned";
}

function formatStatusBadgeClass(status: WorkflowMilestoneStatus) {
  return statusBadgeClassMap[status] ?? statusBadgeClassMap.planned;
}

function normalizeMilestoneTitle(value: unknown) {
  return cleanString(value).toLowerCase().replace(/\s+/g, " ");
}

function isEccHandoffCompletionMilestone(milestone: {
  milestone_key?: unknown;
  milestone_title?: unknown;
}) {
  const milestoneKey = cleanString(milestone.milestone_key).toLowerCase();
  if (milestoneKey) {
    return milestoneKey === "ecc_handoff_completion";
  }

  return normalizeMilestoneTitle(milestone.milestone_title) === "ecc handoff/completion";
}

function isWorkflowSchemaMissingError(error: unknown) {
  const code = cleanString((error as any)?.code).toUpperCase();
  const message = cleanString((error as any)?.message).toLowerCase();
  return (
    code === "PGRST205"
    || message.includes("could not find the table 'public.workflow_")
    || message.includes("relation \"workflow_")
  );
}

export default async function DeferredWorkflowMilestonesPanelBody({
  accountOwnerUserId,
  currentJobId,
  serviceCaseId,
  canManageWorkflowGuidance,
  returnToPath,
  emptyStateClassName,
}: DeferredWorkflowMilestonesPanelBodyProps) {
  const supabase = await createClient();

  const scopedReadJob = await loadScopedInternalJobDetailReadBoundary({
    accountOwnerUserId,
    jobId: currentJobId,
  });

  if (!scopedReadJob?.id) {
    return null;
  }

  let instances: Awaited<ReturnType<typeof listActiveWorkflowInstancesByServiceCase>> = [];
  try {
    instances = await listActiveWorkflowInstancesByServiceCase({
      supabase,
      accountOwnerUserId,
      serviceCaseId,
      includeArchived: false,
      limit: 10,
    });
  } catch (error) {
    if (isWorkflowSchemaMissingError(error)) {
      return <div className={emptyStateClassName}>Workflow guidance is not available yet for this environment.</div>;
    }
    throw error;
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-2">
        <div className={emptyStateClassName}>No active workflow guidance is attached yet.</div>
        {canManageWorkflowGuidance ? (
          <form action={assignInstallWithPermitWorkflowForJobFromForm} className="flex items-center gap-2">
            <input type="hidden" name="job_id" value={currentJobId} />
            <input type="hidden" name="return_to" value={returnToPath} />
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              Add Install with Permit workflow
            </button>
          </form>
        ) : null}
      </div>
    );
  }

  let workflows: Array<{
    instance: (typeof instances)[number];
    milestones: Awaited<ReturnType<typeof listWorkflowInstanceMilestones>>;
  }> = [];
  try {
    workflows = await Promise.all(
      instances.map(async (instance) => {
        const milestones = await listWorkflowInstanceMilestones({
          supabase,
          accountOwnerUserId,
          workflowInstanceId: instance.id,
        });

        return {
          instance,
          milestones,
        };
      }),
    );
  } catch (error) {
    if (isWorkflowSchemaMissingError(error)) {
      return <div className={emptyStateClassName}>Workflow guidance is not available yet for this environment.</div>;
    }
    throw error;
  }

  return (
    <div className="space-y-2">
      {workflows.map(({ instance, milestones }) => {
        const totalMilestones = milestones.length;
        const completedMilestones = milestones.filter(
          (row) => toWorkflowMilestoneStatus(row.milestone_status) === "completed",
        ).length;

        return (
          <div
            key={instance.id}
            className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {cleanString(instance.workflow_name_snapshot) || "Workflow"}
                </div>
                <div className="text-xs text-slate-500">
                  {completedMilestones} of {totalMilestones} complete
                </div>
              </div>
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                {cleanString(instance.workflow_status) || "active"}
              </span>
            </div>

            {totalMilestones === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
                This workflow has no milestone guidance.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {milestones.map((milestone) => {
                  const normalizedStatus = toWorkflowMilestoneStatus(milestone.milestone_status);
                  const isEccMilestone = isEccHandoffCompletionMilestone(milestone);
                  const canRecordExternalEccCompletion = isEccMilestone && normalizedStatus !== "completed";
                  const statusReason = cleanString(milestone.status_reason);

                  return (
                    <div
                      key={milestone.id}
                      className="rounded-lg border border-slate-200/80 bg-slate-50/55 px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">
                            {cleanString(milestone.milestone_title) || "Untitled milestone"}
                          </div>
                          <div className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${formatStatusBadgeClass(normalizedStatus)}`}>
                            {formatStatusLabel(normalizedStatus)}
                          </div>
                          {statusReason ? (
                            <div className="mt-1 text-[11px] text-slate-600">Reason: {statusReason}</div>
                          ) : null}
                        </div>

                        <form action={updateWorkflowMilestoneStatusFromForm} className="flex items-center gap-1.5">
                          <input type="hidden" name="workflow_instance_id" value={instance.id} />
                          <input type="hidden" name="milestone_id" value={milestone.id} />
                          <select
                            name="status"
                            defaultValue={normalizedStatus}
                            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-700"
                            aria-label={`Update milestone status for ${cleanString(milestone.milestone_title) || "milestone"}`}
                          >
                            {WORKFLOW_MILESTONE_STATUSES.map((statusOption) => (
                              <option key={statusOption} value={statusOption}>
                                {formatStatusLabel(statusOption)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                          >
                            Save
                          </button>
                        </form>
                      </div>

                      {canRecordExternalEccCompletion ? (
                        <details className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-emerald-800">
                            Record external ECC completion
                          </summary>
                          <form action={recordExternalEccCompletionForWorkflowMilestoneFromForm} className="mt-2 space-y-1.5">
                            <input type="hidden" name="workflow_instance_id" value={instance.id} />
                            <input type="hidden" name="milestone_id" value={milestone.id} />
                            <div>
                              <label className="mb-0.5 block text-[11px] font-semibold text-slate-700" htmlFor={`external-ecc-note-${milestone.id}`}>
                                Completion note
                              </label>
                              <input
                                id={`external-ecc-note-${milestone.id}`}
                                type="text"
                                name="completion_note"
                                required
                                maxLength={240}
                                placeholder="External ECC completion smoke test"
                                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[11px] font-semibold text-slate-700" htmlFor={`external-ecc-evidence-${milestone.id}`}>
                                Evidence reference (optional)
                              </label>
                              <input
                                id={`external-ecc-evidence-${milestone.id}`}
                                type="text"
                                name="evidence_reference"
                                maxLength={240}
                                placeholder="Certificate #, rater, email, or file reference"
                                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800"
                              />
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="submit"
                                className="h-7 rounded-md border border-emerald-300 bg-white px-2 text-[11px] font-semibold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                              >
                                Save external completion
                              </button>
                            </div>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
