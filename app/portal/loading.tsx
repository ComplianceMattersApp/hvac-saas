export default function PortalLoading() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-4 px-4 py-6"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-7 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      {/* Job list skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-6 w-20 flex-shrink-0 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
