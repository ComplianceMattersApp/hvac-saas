"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

type Props = {
  leftPanel: ReactNode;
  mainContent: ReactNode;
  rightPanel: ReactNode;
  showRightPanel: boolean;
};

export default function CalendarLayoutShell({ leftPanel, mainContent, rightPanel, showRightPanel }: Props) {
  const [leftOpen, setLeftOpen] = useState(false);

  const desktopGridColsClass = showRightPanel
    ? leftOpen
      ? "xl:grid-cols-[280px_minmax(0,1fr)_360px]"
      : "xl:grid-cols-[minmax(0,1fr)_360px]"
    : leftOpen
    ? "xl:grid-cols-[280px_minmax(0,1fr)]"
    : "xl:grid-cols-[minmax(0,1fr)]";

  return (
    <div className="space-y-3">
      <div className="hidden xl:flex xl:justify-start">
        <button
          type="button"
          onClick={() => setLeftOpen((open) => !open)}
          aria-expanded={leftOpen}
          aria-controls="calendar-left-queue-panel"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-slate-50"
        >
          {leftOpen ? <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />}
          {leftOpen ? "Hide queue" : "Show queue"}
        </button>
      </div>

      <div className={`grid gap-5 ${desktopGridColsClass}`}>
        <aside
          id="calendar-left-queue-panel"
          className={`order-2 space-y-4 xl:sticky xl:top-24 xl:order-1 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 ${leftOpen ? "xl:block" : "xl:hidden"}`}
        >
          {leftPanel}
        </aside>

        <main className="order-1 min-w-0 space-y-4 xl:order-2">{mainContent}</main>

        {showRightPanel ? <aside className="order-3 hidden xl:block">{rightPanel}</aside> : null}
      </div>
    </div>
  );
}
