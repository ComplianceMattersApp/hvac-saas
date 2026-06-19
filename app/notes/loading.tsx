export default function NotesLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
            <div className="mt-1 h-7 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="h-6 w-8 animate-pulse rounded bg-slate-200" />
                <div className="mt-1 h-3 w-20 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3">
                <div className="h-6 w-8 animate-pulse rounded bg-slate-200" />
                <div className="mt-1 h-3 w-14 animate-pulse rounded bg-amber-100" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-28 w-full animate-pulse rounded-lg bg-white" />
            <div className="mt-3 flex justify-end">
              <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-200" />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                  <div className="mt-3 space-y-1.5">
                    <div className="h-3 w-full max-w-md animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-2/3 max-w-md animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="h-9 w-16 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-9 w-16 animate-pulse rounded-lg bg-slate-100" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
