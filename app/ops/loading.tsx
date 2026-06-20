export default function OpsLoading() {
  return (
    <div className="mx-auto max-w-[92rem] space-y-3 p-2.5 sm:space-y-4 sm:p-4 xl:px-6" aria-busy="true" aria-live="polite">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-8 w-64 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-96 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-8 w-28 animate-pulse rounded-lg bg-slate-100" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-950/5 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-5 w-40 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>

        <div className="mb-3 flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="h-9 flex-[1_1_calc(50%-0.5rem)] animate-pulse rounded-full bg-slate-100 sm:flex-none sm:w-32"
            />
          ))}
        </div>

        <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="grid gap-1">
              <div className="h-2.5 w-16 animate-pulse rounded bg-slate-100" />
              <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              <div className="mt-1 h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5 sm:p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
              <div className="mt-1.5 h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-1 h-3 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="h-4 w-48 max-w-full animate-pulse rounded bg-slate-200" />
                    <div className="mt-1.5 h-3 w-56 max-w-full animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="h-6 w-20 animate-pulse rounded-md bg-slate-100" />
                </div>
                <div className="mt-2 grid gap-1.5">
                  <div className="h-3 w-40 max-w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
