export default function JobDetailLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-5 lg:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-8 w-72 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-6 w-52 max-w-full animate-pulse rounded-full border border-slate-200 bg-slate-50" />
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-9 w-28 animate-pulse rounded-full border border-slate-200 bg-slate-50" />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,auto)] lg:items-center">
          <div>
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-6 w-72 max-w-full animate-pulse rounded bg-slate-200" />
          </div>
          <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[28rem]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.94fr)_minmax(420px,1.22fr)_minmax(250px,0.74fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-7 w-56 max-w-full animate-pulse rounded bg-slate-200" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 pt-10 shadow-sm shadow-slate-950/5">
            <div className="aspect-[16/9] animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-between">
              <div className="flex gap-2">
                <div className="h-10 w-24 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" />
              </div>
              <div className="h-14 w-full animate-pulse rounded-lg bg-slate-100 sm:w-56" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
              <div className="h-7 w-24 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-10 w-36 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
              ))}
            </div>
            <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-slate-100" />
          </div>
        </div>

        <aside className="space-y-3">
          {Array.from({ length: 2 }).map((_, cardIndex) => (
            <div key={cardIndex} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: cardIndex === 0 ? 3 : 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-10 animate-pulse rounded-lg border border-slate-100 bg-slate-50"
                  />
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
