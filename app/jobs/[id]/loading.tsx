export default function JobDetailLoading() {
  return (
    <div className="mx-auto max-w-[92rem] space-y-4 bg-slate-50/45 p-4 sm:p-5 lg:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-6 w-40 animate-pulse rounded-full bg-blue-50" />
            <div className="mt-3 h-8 w-72 max-w-full animate-pulse rounded bg-slate-200" />
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
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(34rem,0.95fr)] xl:items-center">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-5 w-44 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-7 w-44 animate-pulse rounded-full border border-slate-100 bg-white" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.92fr)_minmax(420px,1.25fr)_minmax(260px,0.83fr)]">
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

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="h-3 w-32 animate-pulse rounded bg-blue-100" />
            <div className="mt-2 h-6 w-40 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="mb-4 flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-6 w-64 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-7 w-20 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
