export default function OpsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-36 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, panelIndex) => (
          <div
            key={panelIndex}
            className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
          >
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((__, rowIndex) => (
                <div
                  key={rowIndex}
                  className="h-12 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
