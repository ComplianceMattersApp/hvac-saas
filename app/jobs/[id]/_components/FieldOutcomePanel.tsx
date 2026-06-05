import SubmitButton from "@/components/SubmitButton";
import { advanceJobStatusFromForm } from "@/lib/actions/job-actions";

type FieldOutcomePanelProps = {
  jobId: string;
  currentStatus: string;
  tab: string;
  isEccJob: boolean;
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
        <SubmitButton
          loadingText="Completing..."
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 sm:w-auto sm:px-4"
        >
          Confirm Work Completed
        </SubmitButton>
      </form>

      {props.isEccJob ? (
        <p className="mt-3 rounded-lg border border-sky-200/80 bg-sky-50/70 px-2.5 py-2 text-xs leading-5 text-sky-900">
          ECC guardrail: Failed/retest outcomes come from ECC test completion.
        </p>
      ) : null}
    </section>
  );
}