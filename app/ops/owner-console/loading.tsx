export default function OwnerConsoleLoading() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-7 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-7 w-28 animate-pulse rounded-full bg-slate-100" />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_170px_170px_auto] xl:items-end">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="mt-1 h-9 w-full animate-pulse rounded-xl bg-slate-100" />
            </div>
          ))}
          <div className="h-9 w-24 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </section>

      <section>
        <div className="mb-2.5 h-3 w-32 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-6 w-10 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2.5 h-3 w-24 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
              <div className="h-3 w-12 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-6 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2.5 h-3 w-20 animate-pulse rounded bg-slate-100" />
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-3 w-16 animate-pulse rounded bg-slate-200" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 8 }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-7 gap-3 px-4 py-3">
                {Array.from({ length: 7 }).map((_, colIndex) => (
                  <div key={colIndex} className="h-3 w-full max-w-[6rem] animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
