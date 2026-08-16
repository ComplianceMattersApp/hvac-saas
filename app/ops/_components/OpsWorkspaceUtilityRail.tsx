import Link from "next/link";

export type OpsUtilityRailQueue = {
  active: boolean;
  count: number;
  href: string;
  key: string;
  label: string;
};

export type OpsUtilityRailHealth = {
  agingOver30: number;
  breakdown: Array<{
    count: number;
    label: string;
  }>;
  unassigned: number;
};

export type OpsUtilityRailTeamClockRow = {
  displayName: string;
  elapsed: string;
  internalUserId: string;
  sinceAt: string;
  statusLabel: string;
};

export type OpsWorkspaceUtilityRailProps = {
  canExportQueue: boolean;
  hasIncomingWorkshare: boolean;
  queueHealth: OpsUtilityRailHealth;
  queues: OpsUtilityRailQueue[];
  returnedWorkshareCount: number;
  showTeamClock: boolean;
  teamClockRows: OpsUtilityRailTeamClockRow[];
};

function QueueIndex({ queues }: { queues: OpsUtilityRailQueue[] }) {
  return (
    <section
      className="hidden rounded-xl border border-slate-200 bg-white px-4 py-3 xl:block"
      aria-label="Operations queue index"
    >
      <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">
        Queues
      </div>
      <nav className="space-y-0.5">
        {queues.map((queue) => {
          const isException = queue.key === "exceptions";
          const isWaiting = queue.key === "waiting";
          const tickClass = queue.active
            ? "bg-blue-600"
            : isException
              ? "bg-rose-600"
              : isWaiting
                ? "bg-amber-500"
                : "bg-[#cfd2cd]";
          const countClass = queue.active
            ? "bg-blue-600 px-2 py-0.5 text-white"
            : isException
              ? "text-rose-700"
              : isWaiting
                ? "text-amber-700"
                : "text-slate-500";

          return (
            <Link
              key={queue.key}
              href={queue.href}
              aria-current={queue.active ? "page" : undefined}
              className={`grid min-h-10 grid-cols-[2px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                queue.count === 0 ? "opacity-40" : ""
              }`}
            >
              <span className={`h-3.5 w-0.5 rounded-sm ${tickClass}`} aria-hidden="true" />
              <span className={`min-w-0 text-[13.5px] ${queue.active ? "font-bold text-navy" : "font-medium text-slate-700"}`}>
                {queue.label}
              </span>
              <span className={`rounded-full font-mono text-[12px] font-semibold tabular-nums ${countClass}`}>
                {queue.count}
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

function QueueHealth({
  queueHealth,
  showTeamClock,
  teamClockRows,
}: Pick<OpsWorkspaceUtilityRailProps, "queueHealth" | "showTeamClock" | "teamClockRows">) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">
        Queue Health
      </div>
      <div className="space-y-2 text-[13.5px] text-slate-700">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${queueHealth.agingOver30 > 0 ? "bg-amber-500" : "bg-[#cfd2cd]"}`} aria-hidden="true" />
          <span><strong className="font-mono font-semibold tabular-nums text-navy">{queueHealth.agingOver30}</strong> aging over 30 days</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${queueHealth.unassigned > 0 ? "bg-amber-500" : "bg-[#cfd2cd]"}`} aria-hidden="true" />
          <span><strong className="font-mono font-semibold tabular-nums text-navy">{queueHealth.unassigned}</strong> unassigned</span>
        </div>
        {showTeamClock ? (
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${teamClockRows.length === 0 ? "bg-amber-500" : "bg-[#cfd2cd]"}`} aria-hidden="true" />
            <span>
              {teamClockRows.length === 0
                ? "No team members clocked in"
                : `${teamClockRows.length} team member${teamClockRows.length === 1 ? "" : "s"} clocked in`}
            </span>
          </div>
        ) : null}
      </div>
      {queueHealth.breakdown.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
          {queueHealth.breakdown.map((entry) => (
            <div key={entry.label} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-600">{entry.label}</span>
              <span className="font-mono font-semibold tabular-nums text-navy">{entry.count}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function WorkshareLinks({
  hasIncomingWorkshare,
  returnedWorkshareCount,
}: Pick<OpsWorkspaceUtilityRailProps, "hasIncomingWorkshare" | "returnedWorkshareCount">) {
  if (returnedWorkshareCount === 0 && !hasIncomingWorkshare) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">
        Workshare
      </div>
      <div className="space-y-2 text-[13.5px]">
        {returnedWorkshareCount > 0 ? (
          <Link href="/ops/workshare/returned" className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline xl:min-h-0 xl:rounded-none xl:text-[12.5px] xl:font-normal">
            <span>{returnedWorkshareCount} returned · needs action</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : null}
        {hasIncomingWorkshare ? (
          <Link href="/ops/workshare/incoming" className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline xl:min-h-0 xl:rounded-none xl:text-[12.5px] xl:font-normal">
            <span>Incoming ECC/HERS requests</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function QuickLinks({
  canExportQueue,
  showTeamClock,
  teamClockRows,
}: Pick<OpsWorkspaceUtilityRailProps, "canExportQueue" | "showTeamClock" | "teamClockRows">) {
  if (!canExportQueue && !showTeamClock) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-600">
        Quick Links
      </div>
      <div className="space-y-2 text-[13.5px]">
        {showTeamClock ? (
          <Link href="/time-clock" className="flex min-h-11 items-center text-sm font-medium text-blue-700 hover:underline xl:min-h-0 xl:text-[12.5px] xl:font-normal">
            Open time clock
          </Link>
        ) : null}
        {canExportQueue ? (
          <>
            <a href="#ops-export-menu-mobile" className="flex min-h-11 items-center text-sm font-medium text-blue-700 hover:underline xl:hidden">Export this queue</a>
            <a href="#ops-export-menu" className="hidden text-blue-700 hover:underline xl:block">Export this queue</a>
          </>
        ) : null}
      </div>

      {showTeamClock && teamClockRows.length > 0 ? (
        <details className="mt-3 border-t border-slate-200 pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-slate-700 hover:text-navy xl:min-h-0 xl:text-[11.5px] [&::-webkit-details-marker]:hidden">
            Clocked-in team · {teamClockRows.length}
          </summary>
          <div className="mt-2 space-y-1.5">
            {teamClockRows.slice(0, 8).map((row) => (
              <div key={row.internalUserId} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-900">{row.displayName}</div>
                  <div className="text-[11px] text-slate-600">Since {row.sinceAt}</div>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-slate-700">{row.statusLabel} · {row.elapsed}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default function OpsWorkspaceUtilityRail(props: OpsWorkspaceUtilityRailProps) {
  return (
    <aside className="space-y-3 sm:space-y-4 xl:sticky xl:top-44 xl:self-start">
      <QueueIndex queues={props.queues} />
      <QueueHealth
        queueHealth={props.queueHealth}
        showTeamClock={props.showTeamClock}
        teamClockRows={props.teamClockRows}
      />
      <WorkshareLinks
        hasIncomingWorkshare={props.hasIncomingWorkshare}
        returnedWorkshareCount={props.returnedWorkshareCount}
      />
      <QuickLinks
        canExportQueue={props.canExportQueue}
        showTeamClock={props.showTeamClock}
        teamClockRows={props.teamClockRows}
      />
    </aside>
  );
}
