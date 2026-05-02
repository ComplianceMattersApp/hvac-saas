export default function JobDetailLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <section className="space-y-4">
          <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
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
        </aside>
      </div>
    </div>
  );
}
