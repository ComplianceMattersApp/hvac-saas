export default function JobDetailLoading() {
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-[104rem] space-y-5 overflow-x-hidden bg-slate-50/45 p-0 lg:p-6"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Mobile skeleton */}
      <div className="block min-h-screen bg-slate-50 px-3 py-3.5 lg:hidden">
        <div className="mx-auto max-w-lg space-y-4">
          {/* Job header card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-950/5">
            <div className="h-1 bg-slate-100" />
            <div className="px-4 py-3.5">
              <div className="h-5 w-32 animate-pulse rounded-full bg-blue-50" />
              <div className="mt-3 h-6 w-56 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="mt-2 flex flex-wrap gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="mt-3 h-4 w-40 max-w-full animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-10 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
                <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          </div>

          {/* Next field action card with full-width button */}
          <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm shadow-slate-950/5">
            <div className="h-[3px] bg-slate-100" />
            <div className="px-4 py-3.5">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 h-12 w-full animate-pulse rounded-xl bg-blue-50" />
            </div>
          </div>

          {/* Quick field actions grid (2x2) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm shadow-slate-950/5">
            <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>
          </div>

          {/* Field operations board */}
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm shadow-slate-950/5">
            <div className="h-5 w-52 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 space-y-3">
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>

          {/* Work & invoice */}
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm shadow-slate-950/5">
            <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 space-y-3">
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>

          {/* Notes & attachments */}
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm shadow-slate-950/5">
            <div className="flex items-center justify-between gap-3">
              <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
              <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-100" />
            </div>
            <div className="mt-3 grid gap-3">
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>

          {/* More details / tools */}
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm shadow-slate-950/5">
            <div className="flex items-center justify-between gap-3">
              <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-4 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop skeleton */}
      <div className="hidden space-y-5 lg:block">
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/5">
          <div className="absolute inset-x-0 top-0 h-1 bg-slate-100" />
          <div className="mb-3 grid gap-4 border-b border-slate-200/80 pb-4 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,0.38fr)] xl:items-start">
            {/* Job workbench header */}
            <div className="min-w-0">
              <div className="h-5 w-32 animate-pulse rounded-full bg-blue-50" />
              <div className="mt-3 h-7 w-72 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="mt-2 flex flex-wrap gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            {/* Primary next action, top-right */}
            <div className="relative flex w-full flex-col gap-2.5 overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-sm shadow-slate-950/5">
              <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-blue-50" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>

          {/* Schedule & workflow row (3 tiles) */}
          <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 grid gap-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl border border-slate-200/80 bg-white" />
              ))}
            </div>
          </div>

          {/* Field operations board (3 columns: customer / location / notes) */}
          <div className="mb-4 grid items-start gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/55 p-3 xl:grid-cols-[minmax(300px,0.9fr)_minmax(420px,1.04fr)_minmax(360px,1.16fr)]">
            <div className="rounded-xl border border-slate-200/70 bg-white p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-6 w-40 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="mt-4 space-y-2">
                <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white p-4">
              <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 aspect-[16/9] animate-pulse rounded-lg bg-slate-100" />
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200/70 bg-white p-4">
                <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100" />
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white p-4">
                <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>
          </div>

          {/* Work items & invoice panel */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 px-3.5 py-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.45fr)_auto] lg:items-center">
              <div>
                <div className="h-3 w-44 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-16 animate-pulse rounded-xl bg-white" />
              <div className="h-9 w-32 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>
        </section>

        {/* Job records expandable cards grid (2x4) */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
          <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
            <div className="h-6 w-56 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
