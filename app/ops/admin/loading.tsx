export default function OpsAdminLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-7 w-80 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-96 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-6 w-20 animate-pulse rounded-lg bg-slate-100" />
          </div>
          <div className="h-10 w-44 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="px-2 pb-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-8 animate-pulse rounded-lg bg-slate-50" />
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-5 w-44 animate-pulse rounded bg-slate-200" />
                <div className="mt-1 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                <div className="h-6 w-12 animate-pulse rounded bg-slate-200" />
                <div className="mt-1 h-3 w-20 animate-pulse rounded bg-slate-100" />
              </div>
            </div>

            <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-slate-100" />

            <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/60 p-4">
              <div className="h-3 w-40 animate-pulse rounded bg-sky-100" />
              <div className="mt-2 h-3 w-full max-w-md animate-pulse rounded bg-sky-100" />
              <div className="mt-2 flex gap-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-6 w-32 animate-pulse rounded-md bg-white" />
                ))}
              </div>
            </div>

            <div className="mt-5 h-16 animate-pulse rounded-lg bg-amber-50" />
          </section>

          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <section key={sectionIndex} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="mt-1 h-5 w-52 animate-pulse rounded bg-slate-200" />
              <div className="mt-1 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, cardIndex) => (
                  <div key={cardIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="mt-1 h-3 w-full max-w-xs animate-pulse rounded bg-slate-100" />
                    <div className="mt-4 h-9 w-28 animate-pulse rounded-lg bg-white" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
