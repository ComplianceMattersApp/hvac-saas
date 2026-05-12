export default function CallListLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-6 w-28 animate-pulse rounded-full bg-slate-100" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-l-4 border-slate-200 border-l-blue-900/20 bg-white p-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)] sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1.05fr)_minmax(14rem,0.72fr)_minmax(18rem,0.9fr)]">
            <div className="space-y-2">
              <div className="h-4 w-56 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-64 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-36 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
              <div className="h-7 w-44 max-w-full animate-pulse rounded bg-slate-100" />
              <div className="h-6 w-32 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
              <div className="h-8 w-72 max-w-full animate-pulse rounded bg-slate-100" />
              <div className="h-8 w-44 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
