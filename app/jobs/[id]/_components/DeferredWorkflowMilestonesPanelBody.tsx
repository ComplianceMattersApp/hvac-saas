import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import {
  WORKFLOW_MILESTONE_STATUSES,
  listActiveWorkflowInstancesByServiceCase,
  listLinkedJobsForWorkflow,
  listWorkflowInstanceMilestones,
  type WorkflowMilestoneStatus,
} from "@/lib/workflows/read-model";
import {
  resolveActiveAuthorizedHandoffRecipientSelection,
  type AuthorizedHandoffRecipientSelectionState,
} from "@/lib/workflows/authorized-handoff-recipients-read";
import {
  assignInstallWithPermitWorkflowForJobFromForm,
  confirmLinkedInternalEccCompletionForWorkflowMilestoneFromForm,
  linkInternalEccJobToWorkflowMilestoneFromForm,
  recordExternalEccCompletionForWorkflowMilestoneFromForm,
  sendWorkflowEccMilestoneToAuthorizedRaterFromForm,
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

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
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

function isLinkedEccJobComplete(job: {
  status?: unknown;
  field_complete?: unknown;
}) {
  return Boolean(job.field_complete) || cleanString(job.status).toLowerCase() === "completed";
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

function MilestoneStatusUpdateForm({
  workflowInstanceId,
  milestoneId,
  milestoneTitle,
  normalizedStatus,
}: {
  workflowInstanceId: string;
  milestoneId: string;
  milestoneTitle: string;
  normalizedStatus: WorkflowMilestoneStatus;
}) {
  return (
    <form action={updateWorkflowMilestoneStatusFromForm} className="flex items-center gap-1.5">
      <input type="hidden" name="workflow_instance_id" value={workflowInstanceId} />
      <input type="hidden" name="milestone_id" value={milestoneId} />
      <select
        name="status"
        defaultValue={normalizedStatus}
        className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-700"
        aria-label={`Update milestone status for ${milestoneTitle || "milestone"}`}
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
    linkedJobs: Awaited<ReturnType<typeof listLinkedJobsForWorkflow>>;
  }> = [];
  let eligibleEccJobs: Array<{
    id: string;
    job_display_number: string | null;
    title: string | null;
    ops_status: string | null;
  }> = [];
  let authorizedEccRaterSelection: AuthorizedHandoffRecipientSelectionState = {
    mode: "none",
    recipients: [],
    defaultRecipientId: null,
    preselectedRecipientId: null,
  };
  try {
    workflows = await Promise.all(
      instances.map(async (instance) => {
        const milestones = await listWorkflowInstanceMilestones({
          supabase,
          accountOwnerUserId,
          workflowInstanceId: instance.id,
        });

        const linkedJobs = await listLinkedJobsForWorkflow({
          supabase,
          accountOwnerUserId,
          workflowInstanceId: instance.id,
        });

        return {
          instance,
          milestones,
          linkedJobs,
        };
      }),
    );

    const { data: eligibleEccJobRows, error: eligibleEccJobRowsError } = await supabase
      .from("jobs")
      .select("id, job_display_number, title, ops_status")
      .eq("service_case_id", serviceCaseId)
      .eq("job_type", "ecc")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(25);

    if (eligibleEccJobRowsError) {
      throw eligibleEccJobRowsError;
    }

    eligibleEccJobs = (Array.isArray(eligibleEccJobRows) ? eligibleEccJobRows : []).map((row: any) => ({
      id: cleanString(row?.id),
      job_display_number: cleanNullableString(row?.job_display_number),
      title: cleanNullableString(row?.title),
      ops_status: cleanNullableString(row?.ops_status),
    })).filter((row) => row.id);

    authorizedEccRaterSelection = await resolveActiveAuthorizedHandoffRecipientSelection({
      supabase,
      accountOwnerUserId,
      handoffKind: "ecc",
    });
  } catch (error) {
    if (isWorkflowSchemaMissingError(error)) {
      return <div className={emptyStateClassName}>Workflow guidance is not available yet for this environment.</div>;
    }
    throw error;
  }

  return (
    <div className="space-y-2">
      {workflows.map(({ instance, milestones, linkedJobs }) => {
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
                  const isCompletedMilestone = normalizedStatus === "completed";
                  const canRecordExternalEccCompletion = isEccMilestone && normalizedStatus !== "completed";
                  const statusReason = cleanString(milestone.status_reason);
                  const milestoneTitle = cleanString(milestone.milestone_title) || "Untitled milestone";
                  const milestoneLinkedJobs = linkedJobs.filter(
                    (row) => cleanString(row.workflow_instance_milestone_id) === cleanString(milestone.id),
                  );
                  const linkedEccJob = milestoneLinkedJobs[0] ?? null;
                  const linkedEccJobIsComplete = linkedEccJob ? isLinkedEccJobComplete(linkedEccJob.job) : false;
                  const canLinkInternalEccJob = isEccMilestone && !linkedEccJob && !isCompletedMilestone;
                  const canReviewCompleteLinkedEccJob =
                    isEccMilestone
                    && !isCompletedMilestone
                    && Boolean(linkedEccJob)
                    && linkedEccJobIsComplete;
                  const shouldShowIncompleteLinkedEccHelper =
                    isEccMilestone
                    && !isCompletedMilestone
                    && Boolean(linkedEccJob)
                    && !linkedEccJobIsComplete;
                  const sendableAuthorizedRecipients = authorizedEccRaterSelection.recipients.filter(
                    (recipient) => cleanString(recipient.recipient_type).toLowerCase() !== "connected_account_future",
                  );
                  const unavailableConnectedRecipientCount =
                    authorizedEccRaterSelection.recipients.length - sendableAuthorizedRecipients.length;
                  const canShowSendToRaterPrimary =
                    isEccMilestone
                    && !isCompletedMilestone
                    && normalizedStatus !== "waiting";
                  const showSetupRequiredSendState =
                    canShowSendToRaterPrimary && sendableAuthorizedRecipients.length === 0;
                  const showSingleRecipientSendState =
                    canShowSendToRaterPrimary && sendableAuthorizedRecipients.length === 1;
                  const showMultipleRecipientSendState =
                    canShowSendToRaterPrimary && sendableAuthorizedRecipients.length > 1;
                  const hasAnySecondaryAction = true;

                  return (
                    <div
                      key={milestone.id}
                      className="rounded-lg border border-slate-200/80 bg-slate-50/55 px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">
                            {milestoneTitle}
                          </div>
                          <div className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${formatStatusBadgeClass(normalizedStatus)}`}>
                            {formatStatusLabel(normalizedStatus)}
                          </div>
                          {statusReason ? (
                            <div className="mt-1 text-[11px] text-slate-600">Reason: {statusReason}</div>
                          ) : null}
                        </div>
                      </div>

                      {linkedEccJob ? (
                        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/70 px-2.5 py-2 text-[11px] text-sky-900">
                          <span className="font-semibold">Linked ECC job:</span>{" "}
                          <Link
                            href={`/jobs/${linkedEccJob.job.id}?tab=tests`}
                            className="font-semibold underline decoration-sky-300 underline-offset-4"
                          >
                            {linkedEccJob.job.job_display_number ? `Job #${linkedEccJob.job.job_display_number}` : cleanString(linkedEccJob.job.title) || "Open job"}
                          </Link>
                          {cleanString(linkedEccJob.job.title) ? (
                            <span className="text-sky-800"> {cleanString(linkedEccJob.job.title)}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {showSetupRequiredSendState ? (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900">
                          <div className="font-semibold">No authorized ECC rater is set up yet.</div>
                          <Link
                            href="/ops/admin/company-profile#authorized-ecc-raters"
                            className="mt-1 inline-flex text-[11px] font-semibold underline decoration-amber-300 underline-offset-4"
                          >
                            Set up authorized raters
                          </Link>
                          {unavailableConnectedRecipientCount > 0 ? (
                            <div className="mt-1 text-[10px] text-amber-800">
                              Connected-account raters are configured but cannot receive workflow sends yet.
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {showSingleRecipientSendState ? (
                        <form action={sendWorkflowEccMilestoneToAuthorizedRaterFromForm} className="mt-2">
                          <input type="hidden" name="workflow_instance_id" value={instance.id} />
                          <input type="hidden" name="milestone_id" value={milestone.id} />
                          <input type="hidden" name="job_id" value={currentJobId} />
                          <input type="hidden" name="authorized_recipient_id" value={sendableAuthorizedRecipients[0]?.id ?? ""} />
                          <button
                            type="submit"
                            className="h-8 rounded-md border border-sky-300 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-100"
                          >
                            Send to {cleanString(sendableAuthorizedRecipients[0]?.display_name) || "authorized rater"}
                          </button>
                        </form>
                      ) : null}

                      {showMultipleRecipientSendState ? (
                        <form action={sendWorkflowEccMilestoneToAuthorizedRaterFromForm} className="mt-2 flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white/80 p-2 sm:flex-row sm:items-end">
                          <input type="hidden" name="workflow_instance_id" value={instance.id} />
                          <input type="hidden" name="milestone_id" value={milestone.id} />
                          <input type="hidden" name="job_id" value={currentJobId} />
                          <div className="min-w-0 flex-1">
                            <label className="mb-0.5 block text-[11px] font-semibold text-slate-700" htmlFor={`authorized-recipient-${milestone.id}`}>
                              Choose authorized rater
                            </label>
                            <select
                              id={`authorized-recipient-${milestone.id}`}
                              name="authorized_recipient_id"
                              required
                              defaultValue={
                                sendableAuthorizedRecipients.find(
                                  (recipient) => recipient.id === authorizedEccRaterSelection.preselectedRecipientId,
                                )?.id
                                ?? sendableAuthorizedRecipients[0]?.id
                                ?? ""
                              }
                              className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800"
                              aria-label={`Choose authorized rater for ${milestoneTitle}`}
                            >
                              {sendableAuthorizedRecipients.map((recipient) => (
                                <option key={recipient.id} value={recipient.id}>
                                  {cleanString(recipient.display_name)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="submit"
                            className="h-8 rounded-md border border-sky-300 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-100"
                          >
                            Send to rater
                          </button>
                        </form>
                      ) : null}

                      {isEccMilestone && normalizedStatus === "waiting" && statusReason.toLowerCase().startsWith("sent to authorized rater:") ? (
                        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/70 px-2.5 py-2 text-[11px] text-sky-900">
                          Sent to rater. Use linked-job review or external completion when the result is ready.
                        </div>
                      ) : null}

                      {shouldShowIncompleteLinkedEccHelper ? (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900">
                          Linked ECC job is not complete yet.
                        </div>
                      ) : null}

                      {canReviewCompleteLinkedEccJob ? (
                        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-2">
                          <div className="text-[11px] font-semibold text-emerald-900">
                            Linked ECC job appears complete. Review and complete ECC milestone.
                          </div>
                          <form action={confirmLinkedInternalEccCompletionForWorkflowMilestoneFromForm} className="mt-1.5 space-y-1.5">
                            <input type="hidden" name="workflow_instance_id" value={instance.id} />
                            <input type="hidden" name="milestone_id" value={milestone.id} />
                            <div>
                              <label className="mb-0.5 block text-[11px] font-semibold text-slate-700" htmlFor={`linked-ecc-review-note-${milestone.id}`}>
                                Review note
                              </label>
                              <input
                                id={`linked-ecc-review-note-${milestone.id}`}
                                type="text"
                                name="review_note"
                                defaultValue="Linked internal ECC job reviewed and completed."
                                maxLength={240}
                                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800"
                              />
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="submit"
                                className="h-7 rounded-md border border-emerald-300 bg-white px-2 text-[11px] font-semibold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                              >
                                Review and complete ECC milestone
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}

                      {canLinkInternalEccJob ? (
                        eligibleEccJobs.length > 0 ? (
                          <form action={linkInternalEccJobToWorkflowMilestoneFromForm} className="mt-2 flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white/80 p-2 sm:flex-row sm:items-end">
                            <input type="hidden" name="workflow_instance_id" value={instance.id} />
                            <input type="hidden" name="milestone_id" value={milestone.id} />
                            <div className="min-w-0 flex-1">
                              <label className="mb-0.5 block text-[11px] font-semibold text-slate-700" htmlFor={`internal-ecc-job-${milestone.id}`}>
                                Link internal ECC job
                              </label>
                              <select
                                id={`internal-ecc-job-${milestone.id}`}
                                name="job_id"
                                required
                                defaultValue=""
                                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800"
                                aria-label={`Link internal ECC job for ${cleanString(milestone.milestone_title) || "milestone"}`}
                              >
                                <option value="" disabled>
                                  Select ECC job
                                </option>
                                {eligibleEccJobs.map((job) => (
                                  <option key={job.id} value={job.id}>
                                    {(job.job_display_number ? `Job #${job.job_display_number}` : job.id.slice(0, 8))}
                                    {job.title ? ` • ${job.title}` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="submit"
                              className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                            >
                              Link internal ECC job
                            </button>
                          </form>
                        ) : (
                          <div className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-2.5 py-2 text-[11px] text-slate-600">
                            No internal ECC job found in this service case yet. Create the ECC job through the normal job flow, then link it here.
                          </div>
                        )
                      ) : null}

                      {hasAnySecondaryAction ? (
                        <details className="mt-2 rounded-md border border-slate-200 bg-white/70 p-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                            More actions
                          </summary>
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] text-slate-600">Update milestone status</div>
                              <MilestoneStatusUpdateForm
                                workflowInstanceId={instance.id}
                                milestoneId={milestone.id}
                                milestoneTitle={milestoneTitle}
                                normalizedStatus={normalizedStatus}
                              />
                            </div>
                            {canRecordExternalEccCompletion ? (
                              <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2">
                                <div className="text-[11px] font-semibold text-emerald-800">Record external ECC completion</div>
                                <form action={recordExternalEccCompletionForWorkflowMilestoneFromForm} className="mt-1.5 space-y-1.5">
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
                              </div>
                            ) : null}
                          </div>
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
