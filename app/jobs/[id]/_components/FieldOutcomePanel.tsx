import SubmitButton from "@/components/SubmitButton";
import { markJobFieldCompleteFromForm } from "@/lib/actions/job-ops-actions";

type FieldOutcomePanelProps = {
  jobId: string;
  isEccJob: boolean;
  className?: string;
  anchorId?: string;
};

export default function FieldOutcomePanel(props: FieldOutcomePanelProps) {
  return (
    <section
      id={props.anchorId}
      className={`rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.26)] ${props.className ?? ""}`.trim()}
    >
      <div className="text-base font-semibold text-slate-900">Confirm field work complete</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Field work is marked complete and can move to closeout or billing as applicable.
      </p>

      <form action={markJobFieldCompleteFromForm} className="mt-3">
        <input type="hidden" name="job_id" value={props.jobId} />
        <SubmitButton
          loadingText="Completing..."
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
        >
          Confirm Work Completed
        </SubmitButton>
      </form>

      <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        <p>Notes, photos, tests, and work items stay in their sections.</p>
        <p>Only Work Completed is wired in this slice. Other outcomes remain unwired until future slices.</p>
        <p>
          Office-owned outcomes route to office/dispatch after submission in a future slice.
        </p>
        {props.isEccJob ? (
          <p className="rounded-lg border border-sky-200/80 bg-sky-50/70 px-2.5 py-2 text-sky-900">
            ECC guardrail: manual generic Failed is intentionally unavailable. Failed/retest results come from ECC test completion.
          </p>
        ) : null}
      </div>
    </section>
  );
}