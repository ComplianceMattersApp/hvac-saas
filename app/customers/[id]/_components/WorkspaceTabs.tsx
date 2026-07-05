"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type WorkspaceTabContextValue = {
  activeTab: string;
  setActiveTab: (id: string) => void;
};

const WorkspaceTabContext = createContext<WorkspaceTabContextValue | null>(null);

function useWorkspaceTabContext() {
  const ctx = useContext(WorkspaceTabContext);
  if (!ctx) throw new Error("WorkspaceTabPanel/WorkspaceTabsNav must be used inside WorkspaceTabsProvider");
  return ctx;
}

/**
 * Owns which workspace tab is active client-side so switching tabs doesn't
 * trigger a full page navigation. The URL's ?tab= param is kept in sync via
 * history.replaceState (not the Next.js router) so deep links/bookmarks
 * still work without forcing a server round-trip on every click.
 */
export function WorkspaceTabsProvider({
  initialTab,
  children,
}: {
  initialTab: string;
  children: ReactNode;
}) {
  const [activeTab, setActiveTabState] = useState(initialTab);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabState(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  return (
    <WorkspaceTabContext.Provider value={{ activeTab, setActiveTab }}>{children}</WorkspaceTabContext.Provider>
  );
}

export function WorkspaceTabsNav({ tabs }: { tabs: readonly { id: string; label: string }[] }) {
  const { activeTab, setActiveTab } = useWorkspaceTabContext();

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setActiveTab(item.id)}
          className={[
            "inline-flex shrink-0 items-center rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
            activeTab === item.id
              ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-1 ring-blue-600/30"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Wraps a tab's already server-rendered content. Uses `hidden` rather than
 * unmounting so in-progress form input and open/closed <details> state
 * inside a panel survives switching away and back.
 */
export function WorkspaceTabPanel({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab } = useWorkspaceTabContext();
  return <div hidden={activeTab !== id}>{children}</div>;
}

/** In-page "jump to tab X" link (e.g. "View all in Work →") that switches tabs client-side instead of navigating. */
export function WorkspaceTabJumpLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const { setActiveTab } = useWorkspaceTabContext();
  return (
    <button type="button" onClick={() => setActiveTab(id)} className={className}>
      {children}
    </button>
  );
}
