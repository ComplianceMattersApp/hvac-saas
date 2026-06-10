import {
  markJobApprovalNeededFromForm,
  markJobDifferentIssueFoundFromForm,
  markJobUnableToCompleteFromForm,
  markJobPartsNeededFromForm,
} from "@/lib/actions/job-ops-actions";
import FieldExceptionRoutingPicker from "./FieldExceptionRoutingPicker";

type FieldOutcomePanelProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  isEccJob: boolean;
  showDifferentIssueFoundOutcome?: boolean;
  className?: string;
  anchorId?: string;
};

export default function FieldOutcomePanel(props: FieldOutcomePanelProps) {
  return (
    <section
      id={props.anchorId}
      className={`rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.26)] sm:max-w-xl ${props.className ?? ""}`.trim()}
    >
      <div className="text-sm font-semibold text-slate-900">Need a field exception?</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Route active field work to office/dispatch only if this visit cannot be completed.
      </p>

      <FieldExceptionRoutingPicker
        jobId={props.jobId}
        currentStatus={props.currentStatus}
        tab={props.tab}
        showDifferentIssueFoundOutcome={props.showDifferentIssueFoundOutcome}
        partsNeededAction={markJobPartsNeededFromForm}
        approvalNeededAction={markJobApprovalNeededFromForm}
        unableToCompleteAction={markJobUnableToCompleteFromForm}
        differentIssueFoundAction={markJobDifferentIssueFoundFromForm}
      />

      {props.isEccJob ? (
        <p className="mt-3 rounded-lg border border-sky-200/80 bg-sky-50/70 px-2.5 py-2 text-xs leading-5 text-sky-900">
          ECC guardrail: Failed/retest outcomes come from ECC test completion.
        </p>
      ) : null}
    </section>
  );
}
