export default function CustomersLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 bg-slate-50 p-3 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-6 w-28 animate-pulse rounded-full bg-slate-100" />
        </div>

        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-blue-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
