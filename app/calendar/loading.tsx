export default function CalendarLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-8 w-52 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
