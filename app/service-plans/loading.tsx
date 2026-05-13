export default function ServicePlansLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
    </div>
  );
}
