export default function CloseoutQueueLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-violet-50" />
          </div>
          <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/85 px-3 py-2">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-6 w-8 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-7 w-32 animate-pulse rounded-full bg-slate-100" />
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <article
            key={index}
            className="rounded-xl border border-l-4 border-slate-200 border-l-violet-900/15 bg-white px-4 py-4 shadow-sm sm:px-5"
          >
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(16rem,1.05fr)_minmax(15rem,0.76fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-14 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
                <div className="mt-2 space-y-1.5">
                  <div className="h-3 w-44 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-36 animate-pulse rounded bg-slate-100" />
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                {Array.from({ length: 3 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="grid gap-1.5">
                    <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
                    <div className="h-5 w-28 animate-pulse rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-48 max-w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-1 flex gap-1.5">
                  <div className="h-7 w-20 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
