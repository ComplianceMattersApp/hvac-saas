import { Suspense } from "react";
import SubmitButton from "@/components/SubmitButton";
import {
  removeJobAssigneeFromForm,
  setPrimaryJobAssigneeFromForm,
} from "@/lib/actions/job-actions";
import type { ActiveJobAssignmentDisplay } from "@/lib/staffing/human-layer";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import DeferredAddAssigneeForm from "./DeferredAddAssigneeForm";

type AssignedTeamControlsProps = {
  jobId: string;
  tab: string;
  assignedTeam: ActiveJobAssignmentDisplay[];
  assignedUserIds: string[];
  isInternalUser: boolean;
  fieldTeamLabel: string;
  fieldUserLabel: string;
  emptyStateClassName: string;
  variant?: "desktop" | "mobile";
};

const desktopUtilityControlClass =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

const mobileUtilityControlClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

const desktopRemoveControlClass =
  "rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200";

const mobileRemoveControlClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200";

export default function AssignedTeamControls({
  jobId,
  tab,
  assignedTeam,
  assignedUserIds,
  isInternalUser,
  fieldTeamLabel,
  fieldUserLabel,
  emptyStateClassName,
  variant = "desktop",
}: AssignedTeamControlsProps) {
  const isMobile = variant === "mobile";
  const returnTo = `/jobs/${jobId}?tab=${tab}#${isMobile ? "mobile-assigned-team" : "assigned-team"}`;
  const listClassName = isMobile ? "mt-3 space-y-2" : "mt-3 flex min-w-0 flex-wrap gap-2";
  const assigneeClassName = isMobile
    ? "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.24)]"
    : "inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-sm text-slate-800 shadow-[0_8px_20px_-24px_rgba(15,23,42,0.22)]";
  const identityClassName = isMobile
    ? "break-words text-base font-semibold"
    : "max-w-full break-words";
  const actionRowClassName = isMobile ? "mt-2 flex flex-wrap gap-2" : "contents";
  const primaryControlClassName = isMobile ? mobileUtilityControlClass : desktopUtilityControlClass;
  const removeControlClassName = isMobile ? mobileRemoveControlClass : desktopRemoveControlClass;

  return (
    <div id={isMobile ? "mobile-assigned-team" : "assigned-team"} className={isMobile ? "" : "rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 sm:px-3 sm:py-2.5"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Assigned {fieldTeamLabel}</div>
          <div className="mt-0.5 text-xs text-slate-600">{fieldUserLabel}s assigned to the job.</div>
        </div>
        <div className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9.5px] font-semibold text-slate-600 sm:px-2.5 sm:py-1 sm:text-[10px]">
          {assignedTeam.length > 0 ? `${assignedTeam.length} assigned` : "Awaiting assignment"}
        </div>
      </div>

      {assignedTeam.length > 0 ? (
        <div className={listClassName}>
          {assignedTeam.map((assignee) => (
            <div key={`${isMobile ? "mobile-" : ""}${assignee.job_id}-${assignee.user_id}`} className={assigneeClassName}>
              <span className={identityClassName}>{formatPersonNamePart(assignee.display_name)}</span>
              {assignee.is_primary ? (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  Primary
                </span>
              ) : null}

              {isInternalUser ? (
                <div className={actionRowClassName}>
                  {!assignee.is_primary ? (
                    <form action={setPrimaryJobAssigneeFromForm} className="shrink-0">
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="user_id" value={assignee.user_id} />
                      <input type="hidden" name="tab" value={tab} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <SubmitButton loadingText="Updating..." className={primaryControlClassName}>
                        Make Primary
                      </SubmitButton>
                    </form>
                  ) : null}

                  <form action={removeJobAssigneeFromForm} className="shrink-0">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="user_id" value={assignee.user_id} />
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <SubmitButton loadingText="Removing..." className={removeControlClassName}>
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className={`mt-3 ${emptyStateClassName}`}>No team assigned yet.</div>
      )}

      {isInternalUser ? (
        <Suspense
          fallback={
            isMobile ? (
              <div className="mt-3 h-12 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <div className="mt-3 flex min-w-0 animate-pulse flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="h-10 w-full rounded-lg bg-slate-100 sm:w-56" />
                <div className="h-4 w-28 rounded bg-slate-100" />
                <div className="h-10 w-full rounded-lg bg-slate-100 sm:w-20" />
              </div>
            )
          }
        >
          <DeferredAddAssigneeForm
            jobId={jobId}
            tab={tab}
            assignedUserIds={assignedUserIds}
            returnAnchor={isMobile ? "mobile-assigned-team" : "assigned-team"}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
