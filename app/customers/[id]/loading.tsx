export default function CustomerDetailLoading() {
  return (
    <div className="min-h-screen bg-slate-50" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-7xl space-y-7 p-4 md:space-y-8 md:p-6">
        <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/40 p-5 shadow-sm md:flex-row md:items-start md:justify-between md:p-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-64 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="space-y-1.5">
              <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-6 w-24 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-200 bg-white/85 p-3 md:items-end md:w-64">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-8 w-28 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-slate-200" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-slate-100" />
            ))}
          </div>
        </div>

        <div className="space-y-6 md:space-y-7">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-100" />
                  <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
            <div className="mb-2 h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 w-20 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 h-4 w-36 animate-pulse rounded bg-slate-200" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-4 w-20 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
                  <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
