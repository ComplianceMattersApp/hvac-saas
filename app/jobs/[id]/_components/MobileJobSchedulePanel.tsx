type MobileJobSchedulePanelProps = Record<string, any>;

export default function MobileJobSchedulePanel(props: MobileJobSchedulePanelProps) {
  const {
    appointmentDateLabel,
    ChevronRightIcon,
    ClockIcon,
    displayDateLA,
    job,
    Link,
    mobileAppointmentTimeLabel,
    SubmitButton,
    tab,
    timeToTimeInput,
    UnscheduleButton,
    updateJobScheduleFromForm,
  } = props;
  const presentation = props.presentation ?? "current";
  const closeHref =
    presentation === "v2TargetPanel"
      ? "#mobile-v2-schedule-summary"
      : `/jobs/${job.id}?tab=${tab}`;

  const scheduleForm = (
    <form action={updateJobScheduleFromForm} className="space-y-3">
      <input type="hidden" name="job_id" value={job.id} />
      <input type="hidden" name="return_to" value={`/jobs/${job.id}?tab=${tab}#mobile-when-panel`} />
      <input type="hidden" name="permit_number" value={job.permit_number ?? ""} />
      <input type="hidden" name="jurisdiction" value={(job as any).jurisdiction ?? ""} />
      <input type="hidden" name="permit_date" value={(job as any).permit_date ?? ""} />

      <div className="space-y-1">
        <label className="text-sm font-semibold text-slate-700">Scheduled Date</label>
        <input
          type="date"
          name="scheduled_date"
          defaultValue={displayDateLA(job.scheduled_date)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-slate-700">Window Start</label>
          <input
            type="time"
            name="window_start"
            defaultValue={timeToTimeInput(job.window_start)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-slate-700">Window End</label>
          <input
            type="time"
            name="window_end"
            defaultValue={timeToTimeInput(job.window_end)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <SubmitButton
          loadingText="Saving..."
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-base font-semibold text-white"
        >
          Save Scheduling
        </SubmitButton>

        {job.scheduled_date || job.window_start || job.window_end ? (
          <UnscheduleButton className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800" />
        ) : null}

        {presentation === "v2TargetPanel" ? (
          <a
            href={closeHref}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800"
          >
            Close
          </a>
        ) : (
          <Link
            href={closeHref}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800"
          >
            Close
          </Link>
        )}
      </div>
    </form>
  );

  if (presentation === "v2TargetPanel") {
    return (
      <section
        id="mobile-when-panel"
        className="relative mt-3 hidden scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.34)] ring-1 ring-slate-200/70 target:block"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-blue-900/70">
              <ClockIcon className="h-4 w-4" />
              <span>Schedule</span>
            </div>
            <div className="mt-1 break-words text-lg font-semibold leading-tight text-[#0f1f35]">{appointmentDateLabel}</div>
            {mobileAppointmentTimeLabel ? (
              <div className="mt-1 text-sm font-semibold text-blue-900">{mobileAppointmentTimeLabel}</div>
            ) : null}
          </div>
          <a
            href={closeHref}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            Close
          </a>
        </div>
        {scheduleForm}
      </section>
    );
  }

  return (
    <div className="relative mt-3.5 overflow-visible border-t border-slate-200 pt-3">
      <details id="mobile-when-panel" className="group relative overflow-visible rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.24)]">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-600/70" />
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-blue-900/70">
                <ClockIcon className="h-4 w-4" />
                <span>Schedule</span>
              </div>
              <div className="mt-2 break-words text-xl font-semibold leading-tight text-[#0f1f35]">{appointmentDateLabel}</div>
              {mobileAppointmentTimeLabel ? (
                <div className="mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-900">
                  {mobileAppointmentTimeLabel}
                </div>
              ) : null}
            </div>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200/70 text-slate-600 transition-transform group-open:rotate-90">
              <ChevronRightIcon className="h-4 w-4" />
            </span>
          </div>
        </summary>

        <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-full max-w-[calc(100vw-1.5rem)] group-open:block">
          <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_44px_-28px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/70">
            {scheduleForm}
          </div>
        </div>
      </details>
    </div>
  );
}
