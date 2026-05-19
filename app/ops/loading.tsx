export default function OpsLoading() {
  return (
    <div className="mx-auto max-w-[92rem] space-y-4 p-4 sm:p-5 lg:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)] lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-10 w-80 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-9 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.75fr)]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-5 w-28 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="mt-3 h-3 animate-pulse rounded-full bg-slate-100" />
            <div className="mt-1 grid gap-px overflow-hidden rounded-2xl border border-slate-100 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse bg-slate-50" />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
              <div className="h-7 w-28 animate-pulse rounded-full bg-white" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
            <div className="mt-3 h-20 animate-pulse rounded-xl bg-white" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-5 w-24 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-8 w-36 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <div key={sectionIndex} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
              <div className="h-7 w-20 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <div key={rowIndex} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-52 max-w-full animate-pulse rounded bg-slate-100" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-6 w-24 animate-pulse rounded-full bg-white" />
                    <div className="h-6 w-28 animate-pulse rounded-full bg-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-36 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="grid gap-3 sm:grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.25fr)]">
                <div>
                  <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-52 max-w-full animate-pulse rounded bg-slate-100" />
                </div>
                <div className="space-y-2">
                  <div className="h-8 animate-pulse rounded-lg bg-white" />
                  <div className="flex gap-2">
                    <div className="h-6 w-24 animate-pulse rounded-full bg-white" />
                    <div className="h-6 w-28 animate-pulse rounded-full bg-white" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
