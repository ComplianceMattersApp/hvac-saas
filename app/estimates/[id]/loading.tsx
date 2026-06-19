export default function EstimateDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-[28px] border border-slate-200/85 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-5 w-32 animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 flex items-center gap-2">
              <div className="h-5 w-20 animate-pulse rounded bg-slate-100" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="mt-2 h-7 w-64 max-w-full animate-pulse rounded bg-slate-200" />
          </div>

          <div className="shrink-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-1 h-7 w-24 animate-pulse rounded bg-slate-200" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-3 w-44 animate-pulse rounded bg-slate-100" />
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200/85 bg-slate-50/85 px-4 py-3">
          <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200/85 bg-white shadow-sm">
        <div className="border-b border-slate-200/85 bg-slate-50/80 px-5 py-4">
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-5 w-28 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="bg-slate-50/45 px-5 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(15rem,0.9fr)] lg:items-start">
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-9 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-9 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[minmax(14rem,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]"
            >
              <div className="h-4 w-full max-w-xs animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
