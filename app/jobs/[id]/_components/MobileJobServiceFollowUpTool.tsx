type MobileJobServiceFollowUpToolProps = Record<string, any> & {
  presentation?: "current" | "v2Tools";
};

export default function MobileJobServiceFollowUpTool(props: MobileJobServiceFollowUpToolProps) {
  const {
    createNextServiceVisitFromForm,
    job,
    mobileToolLinkClass,
    SubmitButton,
    tab,
    ToolIcon,
    toolsRowClass,
    toolsRowIconClass,
    toolsRowTextClass,
    presentation = "current",
  } = props;

  if (presentation === "v2Tools") {
    return (
      <details id="mobile-follow-up-job" className="group">
        <summary className={`${toolsRowClass} cursor-pointer list-none`}>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className={toolsRowIconClass}>
              <ToolIcon className="h-4 w-4" />
            </span>
            <span className={toolsRowTextClass}>
              <span className="block font-semibold text-slate-950">Create Return Visit</span>
              <span className="block text-sm font-medium text-slate-600">Create an unscheduled follow-up visit</span>
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium text-slate-500 group-open:hidden">Open</span>
          <span className="hidden shrink-0 text-sm font-medium text-slate-500 group-open:inline">Close</span>
        </summary>
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
          <form action={createNextServiceVisitFromForm} className="space-y-3">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="visit_intent" value="return_visit" />
            <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-follow-up-job`} />

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">Why is a return visit needed?</label>
              <input
                type="text"
                name="next_visit_reason"
                required
                maxLength={220}
                placeholder="Example: return to complete repair"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
              />
              <p className="text-xs leading-5 text-slate-600">This creates an unscheduled office/dispatch item.</p>
            </div>

            <SubmitButton loadingText="Creating..." className={mobileToolLinkClass}>
              Create Return Visit
            </SubmitButton>
          </form>
        </div>
      </details>
    );
  }

  return (
    <details id="mobile-follow-up-job" className="group">
      <summary className={`${mobileToolLinkClass} cursor-pointer list-none`}>
        <span className="inline-flex items-center gap-2">
          <ToolIcon className="h-4.5 w-4.5" />
          Create Return Visit
        </span>
      </summary>
      <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
        <form action={createNextServiceVisitFromForm} className="space-y-3">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="visit_intent" value="return_visit" />
          <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-follow-up-job`} />

          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-700">Why is a return visit needed?</label>
            <input
              type="text"
              name="next_visit_reason"
              required
              maxLength={220}
              placeholder="Example: return to complete repair"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            />
            <p className="text-xs leading-5 text-slate-600">This creates an unscheduled office/dispatch item.</p>
          </div>

          <SubmitButton loadingText="Creating..." className={mobileToolLinkClass}>
            Create Return Visit
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
