export default function NotificationsLoading() {
  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-5" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-slate-100" />
              <div className="min-w-0 flex-1">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-7 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-100" />
          </div>

          <div className="mt-5">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-3">
              <div className="h-3 w-12 animate-pulse rounded bg-blue-100" />
              <div className="mt-2 h-6 w-8 animate-pulse rounded bg-slate-200" />
              <div className="mt-1 h-3 w-44 animate-pulse rounded bg-blue-100" />
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-8 w-32 animate-pulse rounded-full bg-slate-100" />
              ))}
            </div>
            <div className="mt-3 h-3 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100" />
        </section>

        <section className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-56 max-w-full animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-200" />
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
