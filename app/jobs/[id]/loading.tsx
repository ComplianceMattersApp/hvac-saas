export default function JobDetailLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-5 lg:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-72 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-9 w-28 animate-pulse rounded-full border border-slate-200 bg-slate-50" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
              <div className="h-8 w-28 animate-pulse rounded-lg bg-slate-100" />
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-10 animate-pulse rounded-lg border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
          </div>
        </aside>
      </div>
    </div>
  );
}
