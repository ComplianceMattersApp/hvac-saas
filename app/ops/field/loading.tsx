export default function OpsFieldLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 bg-slate-50 p-3 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-7 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-96 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-6 w-8 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <section key={sectionIndex} className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-slate-300" />
                <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="mt-1 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-6 w-8 animate-pulse rounded-full bg-slate-100" />
          </div>

          <div className="grid gap-3">
            {Array.from({ length: 2 }).map((_, cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-lg border border-l-4 border-l-slate-300 border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
                    <div className="space-y-1">
                      <div className="h-3 w-36 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-52 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-6 w-28 animate-pulse rounded-full bg-slate-100" />
                      <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                    </div>
                  </div>
                  <div className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
                  {Array.from({ length: 3 }).map((_, btnIndex) => (
                    <div key={btnIndex} className="h-10 animate-pulse rounded-lg bg-slate-100 sm:w-24" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
