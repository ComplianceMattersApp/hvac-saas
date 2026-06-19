import { portalPageClass, portalPanelClass } from "@/components/portal/PortalChrome";

function PortalJobRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="h-4 w-48 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-36 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="shrink-0 text-right">
        <div className="h-5 w-24 animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

function PortalJobSectionSkeleton({ rows }: { rows: number }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
          <div className="mt-1 h-5 w-40 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="h-3 w-56 max-w-full animate-pulse rounded bg-slate-100 sm:text-right" />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="divide-y divide-slate-200">
          {Array.from({ length: rows }).map((_, index) => (
            <PortalJobRowSkeleton key={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PortalAllJobsLoading() {
  return (
    <div className={portalPageClass} aria-busy="true" aria-live="polite">
      <div className={portalPanelClass}>
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-5">
          <div className="max-w-2xl">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-6 w-28 animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-3 h-3 w-28 animate-pulse rounded bg-slate-100" />
            <div className="mt-1 h-7 w-48 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-[240px] lg:justify-end">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-7 w-20 animate-pulse rounded-full bg-slate-100" />
            ))}
          </div>
        </div>
      </div>

      <PortalJobSectionSkeleton rows={2} />
      <PortalJobSectionSkeleton rows={2} />
      <PortalJobSectionSkeleton rows={3} />
      <PortalJobSectionSkeleton rows={2} />
      <PortalJobSectionSkeleton rows={2} />
    </div>
  );
}
