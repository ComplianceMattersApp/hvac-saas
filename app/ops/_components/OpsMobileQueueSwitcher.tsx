"use client";

import * as React from "react";
import Link from "next/link";

export type OpsMobileQueueLink = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

type Props = {
  queues: OpsMobileQueueLink[];
};

function queueTickClass(queue: OpsMobileQueueLink) {
  if (queue.active) return "bg-blue-600";
  if (queue.key === "exceptions") return "bg-rose-600";
  if (queue.key === "waiting") return "bg-amber-500";
  return "bg-slate-200";
}

export default function OpsMobileQueueSwitcher({ queues }: Props) {
  const [open, setOpen] = React.useState(false);
  const activeQueue = queues.find((queue) => queue.active) ?? queues[0];
  const populatedQueues = queues.filter((queue) => queue.count > 0);
  const emptyQueues = queues.filter((queue) => queue.count === 0);
  const alsoOpen = populatedQueues.filter((queue) => !queue.active).slice(0, 2);

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!activeQueue) return null;

  function queueRow(queue: OpsMobileQueueLink) {
    return (
      <Link
        key={queue.key}
        href={queue.href}
        aria-current={queue.active ? "page" : undefined}
        onClick={() => setOpen(false)}
        className={[
          "grid min-h-12 grid-cols-[2px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors",
          queue.active ? "bg-blue-50" : "hover:bg-slate-50 focus-visible:bg-slate-50",
          queue.count === 0 ? "text-slate-400" : "text-slate-700",
        ].join(" ")}
      >
        <span className={`h-4 w-0.5 rounded-sm ${queueTickClass(queue)}`} aria-hidden="true" />
        <span className={`text-[15px] ${queue.active ? "font-bold text-navy" : "font-medium"}`}>
          {queue.label}
        </span>
        <span
          className={[
            "min-w-7 rounded-full px-2 py-0.5 text-center font-mono text-xs font-semibold tabular-nums",
            queue.active ? "bg-blue-600 text-white" : "",
          ].join(" ")}
        >
          {queue.count}
        </span>
      </Link>
    );
  }

  return (
    <div className="xl:hidden">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Operations workspace
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-mx-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <span className="min-w-0 truncate text-[23px] font-bold leading-tight tracking-[-0.02em] text-navy">
          {activeQueue.label}
        </span>
        <span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-white">
          {activeQueue.count}
        </span>
        <span className="text-lg text-slate-600" aria-hidden="true">▾</span>
        <span className="sr-only">Switch queue</span>
      </button>
      {alsoOpen.length > 0 ? (
        <div className="truncate text-[12px] leading-5 text-slate-500">
          <span className="mr-2 text-slate-400">Also open</span>
          {alsoOpen.map((queue, index) => (
            <React.Fragment key={queue.key}>
              {index > 0 ? <span className="mx-2 text-slate-300">·</span> : null}
              <span>{queue.label} <span className="font-mono tabular-nums text-navy">{queue.count}</span></span>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-label="Switch queue"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
            aria-label="Close queue switcher"
          />
          <section className="relative z-10 max-h-[min(86dvh,760px)] w-full overflow-hidden rounded-t-[18px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex justify-center py-2" aria-hidden="true">
              <span className="h-1 w-12 rounded-full bg-slate-200" />
            </div>
            <div className="flex min-h-14 items-center justify-between px-4 pb-1">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Switch queue
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                Done
              </button>
            </div>
            <div className="max-h-[calc(min(86dvh,760px)-5rem)] overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="divide-y divide-slate-200">
                {populatedQueues.map(queueRow)}
              </div>
              {emptyQueues.length > 0 ? (
                <>
                  <div className="px-4 pb-1 pt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Clear
                  </div>
                  <div className="divide-y divide-slate-200">
                    {emptyQueues.map(queueRow)}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
