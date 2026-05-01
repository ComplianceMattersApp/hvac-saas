export default function NewJobLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
              <div className="h-11 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
            </div>
          ))}
        </div>

        <div className="mt-5 h-11 w-36 animate-pulse rounded-xl bg-blue-100" />
      </div>
    </div>
  );
}
