export default function ReportsDashboardLoading() {
  return (
    <div className="mx-auto max-w-[1680px] space-y-5 px-2 py-3" aria-busy="true" aria-live="polite">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-72 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-11 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
