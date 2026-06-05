import { listFieldOutcomeRoutes } from "@/lib/jobs/field-outcome-routing";

type FieldOutcomePanelProps = {
  isFieldComplete: boolean;
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
            <fieldset
              key={route.code}
              disabled
              className="rounded-xl border border-slate-200/80 bg-slate-50/65 px-3 py-2.5"
            >
              <label className="block cursor-not-allowed select-none">
                <span className="flex items-start gap-2.5">
                  <input type="radio" disabled className="mt-0.5 h-3.5 w-3.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{route.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">{route.description}</span>
                    <span className="mt-1 block text-[11px] font-medium text-slate-500">
                      {route.officeOwnedAfterSubmission
                        ? "Routes to office/dispatch after submit (future)"
                        : "Remains in field completion flow (future)"}
                    </span>
                  </span>
                </span>
              </label>
            </fieldset>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        <p>
          Submission wiring is coming in a future slice. This panel currently does not send actions or update job state.
        </p>
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