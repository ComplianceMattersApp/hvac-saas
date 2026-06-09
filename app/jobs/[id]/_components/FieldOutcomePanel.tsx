import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";
import {
  markJobApprovalNeededFromForm,
  markJobDifferentIssueFoundFromForm,
  markJobUnableToCompleteFromForm,
  markJobPartsNeededFromForm,
} from "@/lib/actions/job-ops-actions";

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
      <div className="text-base font-semibold text-slate-900">Confirm field work complete</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Ready to finish this visit? This moves the job to closeout for invoice/certs as needed.
      </p>

      <form action={advanceJobStatusFromForm} className="mt-3 flex items-center">
        <input type="hidden" name="job_id" value={props.jobId} />
        <input type="hidden" name="current_status" value={props.currentStatus} />
        <input type="hidden" name="tab" value={props.tab} />
        <ImmediateSubmitButton
          pendingText="Completing..."
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 sm:w-auto sm:px-4"
        >
          Confirm Work Completed
        </ImmediateSubmitButton>
      </form>

      <details className="mt-3 w-full rounded-xl border border-amber-200/80 bg-amber-50/40 p-3">
        <summary className="list-none cursor-pointer">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-900">Can&apos;t finish today?</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/90">Need parts, approval, or unable to complete?</p>
            </div>
            <span className="inline-flex min-h-8 items-center justify-center rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900">
              Open
            </span>
          </div>
        </summary>

        <div className="mt-3 grid gap-3 border-t border-amber-200/80 pt-3">
          <form action={markJobPartsNeededFromForm} className="rounded-lg border border-amber-200/80 bg-white/80 p-3">
            <input type="hidden" name="job_id" value={props.jobId} />
            <input type="hidden" name="current_status" value={props.currentStatus} />
            <input type="hidden" name="tab" value={props.tab} />
            <p className="text-xs font-semibold text-amber-900">Need parts?</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/90">
              Send this visit to office/dispatch as Waiting on Part.
            </p>
            <textarea
              id={`parts-note-${props.jobId}`}
              name="parts_note"
              required
              rows={2}
              maxLength={280}
              className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
              placeholder="What part or issue is needed?"
            />
            <div className="mt-2 flex items-center">
              <ImmediateSubmitButton
                pendingText="Saving..."
                className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:w-auto"
              >
                Submit Parts Needed
              </ImmediateSubmitButton>
            </div>
          </form>

          <form action={markJobApprovalNeededFromForm} className="rounded-lg border border-amber-200/80 bg-white/80 p-3">
            <input type="hidden" name="job_id" value={props.jobId} />
            <input type="hidden" name="current_status" value={props.currentStatus} />
            <input type="hidden" name="tab" value={props.tab} />
            <p className="text-xs font-semibold text-amber-900">Need approval?</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/90">
              Send this visit to office/dispatch as Approval Needed.
            </p>
            <textarea
              id={`approval-note-${props.jobId}`}
              name="approval_note"
              required
              rows={2}
              maxLength={280}
              className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
              placeholder="Example: customer approval for repair, owner approval for added work"
            />
            <div className="mt-2 flex items-center">
              <ImmediateSubmitButton
                pendingText="Saving..."
                className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:w-auto"
              >
                Submit Approval Needed
              </ImmediateSubmitButton>
            </div>
          </form>

          <form action={markJobUnableToCompleteFromForm} className="rounded-lg border border-amber-200/80 bg-white/80 p-3">
            <input type="hidden" name="job_id" value={props.jobId} />
            <input type="hidden" name="current_status" value={props.currentStatus} />
            <input type="hidden" name="tab" value={props.tab} />
            <p className="text-xs font-semibold text-amber-900">Unable to complete?</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/90">
              Send this visit to office/dispatch for review.
            </p>
            <p className="mt-2 text-xs font-medium text-amber-900">Why couldn&apos;t the visit be completed?</p>
            <textarea
              id={`unable-note-${props.jobId}`}
              name="unable_note"
              required
              rows={2}
              maxLength={280}
              className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
              placeholder="Example: customer not home, no access, unsafe condition, missing information"
            />
            <div className="mt-2 flex items-center">
              <ImmediateSubmitButton
                pendingText="Saving..."
                className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:w-auto"
              >
                Submit Unable to Complete
              </ImmediateSubmitButton>
            </div>
          </form>

          {props.showDifferentIssueFoundOutcome ? (
            <form action={markJobDifferentIssueFoundFromForm} className="rounded-lg border border-amber-200/80 bg-white/80 p-3">
              <input type="hidden" name="job_id" value={props.jobId} />
              <input type="hidden" name="current_status" value={props.currentStatus} />
              <input type="hidden" name="tab" value={props.tab} />
              <p className="text-xs font-semibold text-amber-900">Different issue found?</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/90">
                Callback/revisit-only: send this visit to office review without creating a new visit.
              </p>
              <p className="mt-2 text-xs font-medium text-amber-900">What different issue was identified on site?</p>
              <textarea
                id={`different-issue-note-${props.jobId}`}
                name="different_issue_note"
                required
                rows={2}
                maxLength={280}
                className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200"
                placeholder="Example: original issue resolved, but separate airflow issue found in upstairs zone"
              />
              <div className="mt-2 flex items-center">
                <ImmediateSubmitButton
                  pendingText="Saving..."
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:w-auto"
                >
                  Submit Different Issue Found
                </ImmediateSubmitButton>
              </div>
            </form>
          ) : null}
        </div>
      </details>

      {props.isEccJob ? (
        <p className="mt-3 rounded-lg border border-sky-200/80 bg-sky-50/70 px-2.5 py-2 text-xs leading-5 text-sky-900">
          ECC guardrail: Failed/retest outcomes come from ECC test completion.
        </p>
      ) : null}
    </section>
  );
}
