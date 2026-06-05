import { listFieldOutcomeRoutes } from "@/lib/jobs/field-outcome-routing";
import SubmitButton from "@/components/SubmitButton";
import { markJobFieldCompleteFromForm } from "@/lib/actions/job-ops-actions";

type FieldOutcomePanelProps = {
  jobId: string;
  isFieldComplete: boolean;
  canSubmitWorkCompleted: boolean;
  isEccJob: boolean;
  className?: string;
  anchorId?: string;
};

const outcomeRoutes = listFieldOutcomeRoutes();

export default function FieldOutcomePanel(props: FieldOutcomePanelProps) {
  return (
    <section
      id={props.anchorId}
      className={`rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.26)] ${props.className ?? ""}`.trim()}
    >
      <div className="text-base font-semibold text-slate-900">What happened today?</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Choose the outcome. Notes, photos, tests, and work items stay in their sections.
      </p>

      {props.isFieldComplete ? (
        <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-xs leading-5 text-slate-600">
          Field complete is already recorded for this visit. This guided finish panel is intentionally read-only in this slice.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {outcomeRoutes.map((route) => (
            <div
              key={route.code}
              className="rounded-xl border border-slate-200/80 bg-slate-50/65 px-3 py-2.5"
            >
              <div className="text-sm font-semibold text-slate-900">{route.label}</div>
              <div className="mt-0.5 text-xs leading-5 text-slate-600">{route.description}</div>

              {route.code === "work_completed" ? (
                <div className="mt-2.5 space-y-2">
                  {props.canSubmitWorkCompleted ? (
                    <form action={markJobFieldCompleteFromForm}>
                      <input type="hidden" name="job_id" value={props.jobId} />
                      <SubmitButton
                        loadingText="Completing..."
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                      >
                        Confirm Work Completed
                      </SubmitButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
                    >
                      Confirm Work Completed
                    </button>
                  )}

                  {!props.canSubmitWorkCompleted ? (
                    <p className="text-[11px] leading-5 text-slate-500">
                      Mark the job complete first, then confirm field completion.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2.5 space-y-1.5">
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
                  >
                    {route.label}
                  </button>
                  <p className="text-[11px] font-medium text-slate-500">
                    {route.officeOwnedAfterSubmission
                      ? "Routes to office/dispatch after submit (future)"
                      : "Remains in field completion flow (future)"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        <p>Only Work Completed is wired in this slice. Other outcomes remain read-only until future slices.</p>
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