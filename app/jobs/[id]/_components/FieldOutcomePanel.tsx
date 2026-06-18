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
  labels?: {
    partsNeeded?: string;
    approvalNeeded?: string;
    unableToComplete?: string;
  };
  className?: string;
  anchorId?: string;
};

export default function FieldOutcomePanel(props: FieldOutcomePanelProps) {
  return (
    <div
      id={props.anchorId}
      className={props.className ?? ""}
    >
      <FieldExceptionRoutingPicker
        jobId={props.jobId}
        currentStatus={props.currentStatus}
        tab={props.tab}
        showDifferentIssueFoundOutcome={props.showDifferentIssueFoundOutcome}
        labels={props.labels}
        partsNeededAction={markJobPartsNeededFromForm}
        approvalNeededAction={markJobApprovalNeededFromForm}
        unableToCompleteAction={markJobUnableToCompleteFromForm}
        differentIssueFoundAction={markJobDifferentIssueFoundFromForm}
      />
    </div>
  );
}
