export default function OpsLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-5 lg:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[28rem]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="h-9 w-32 animate-pulse rounded-full border border-slate-200 bg-slate-50" />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-36 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, rowIndex) => (
            <div key={rowIndex} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="grid gap-3 sm:grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.25fr)]">
                <div>
                  <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-52 max-w-full animate-pulse rounded bg-slate-100" />
                </div>
                <div className="space-y-2">
                  <div className="h-8 animate-pulse rounded-lg bg-white" />
                  <div className="flex gap-2">
                    <div className="h-6 w-24 animate-pulse rounded-full bg-white" />
                    <div className="h-6 w-28 animate-pulse rounded-full bg-white" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
