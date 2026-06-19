export default function EstimatesLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="h-5 w-40 animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-8 w-44 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-10 w-36 shrink-0 animate-pulse rounded-lg bg-slate-200" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="h-8 w-8 animate-pulse rounded-xl bg-white" />
              <div className="mt-2 h-6 w-10 animate-pulse rounded bg-slate-200" />
              <div className="mt-1 h-3 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200/85 bg-slate-50/85 px-4 py-3">
          <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-1 h-5 w-32 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/85 bg-white p-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-200">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                  <div className="h-5 w-16 animate-pulse rounded-lg bg-slate-100" />
                </div>
                <div className="mt-2 h-4 w-56 max-w-full animate-pulse rounded bg-slate-200" />
                <div className="mt-1 flex gap-3">
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
                <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
