export default function InternalInvoiceWorkspaceLoading() {
  return (
    <div className="mx-auto max-w-[92rem] space-y-5 bg-slate-50/45 p-4 sm:p-5 lg:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="h-6 w-40 animate-pulse rounded-full bg-blue-50" />
            <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-4 flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-7 w-24 animate-pulse rounded-full bg-slate-100" />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.32fr)_minmax(22rem,0.68fr)]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
            <div className="h-4 w-32 animate-pulse rounded bg-blue-100" />
            <div className="mt-2 h-7 w-64 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
            <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-50" />
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: index === 0 ? 4 : 3 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="h-14 animate-pulse rounded-xl bg-slate-50" />
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
