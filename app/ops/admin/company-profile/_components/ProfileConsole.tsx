"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Sectioned settings console shell (design turns 14a/14b/14d).
 * Desktop: a left rail of sections showing one panel at a time.
 * Mobile: the rail becomes an accordion, exactly one section open at a time.
 *
 * The active section is mirrored to the URL hash so sections are linkable and
 * back-button friendly. A direct load of #billing opens Billing; an unknown or
 * empty hash falls back to the first section (Overview).
 */
export type ConsoleSectionState =
  | { kind: "complete" }
  | { kind: "count"; count: number }
  | { kind: "attention"; count?: number };

export type ConsoleSection = {
  id: string;
  label: string;
  state?: ConsoleSectionState;
  content: ReactNode;
};

function StateBadge({ state }: { state?: ConsoleSectionState }) {
  if (!state) return null;
  if (state.kind === "complete") {
    return (
      <span
        aria-label="Complete"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
      />
    );
  }
  if (state.kind === "attention") {
    return (
      <span className="inline-flex items-center gap-1.5">
        {typeof state.count === "number" && state.count > 0 ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">
            {state.count}
          </span>
        ) : null}
        <span aria-label="Needs attention" className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      </span>
    );
  }
  // count
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
      {state.count}
    </span>
  );
}

function AccordionChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ProfileConsole({
  sections,
  defaultSectionId,
}: {
  sections: ConsoleSection[];
  defaultSectionId?: string;
}) {
  const ids = useMemo(() => sections.map((section) => section.id), [sections]);
  const fallback = defaultSectionId && ids.includes(defaultSectionId) ? defaultSectionId : ids[0];
  const [active, setActive] = useState<string>(fallback);

  useEffect(() => {
    function fromHash() {
      const raw = window.location.hash.replace(/^#/, "").trim();
      setActive(raw && ids.includes(raw) ? raw : fallback);
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [ids, fallback]);

  function select(id: string) {
    setActive(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  const activeSection = sections.find((section) => section.id === active) ?? sections[0];

  // Desktop "show the active panel" and mobile "show the open section" are the
  // same condition (id === active), so each section's content renders exactly
  // once — no duplicate DOM / duplicate form field ids across the two layouts.
  return (
    <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-5">
      {/* Rail — desktop only */}
      <nav
        aria-label="Company profile sections"
        className="hidden self-start lg:sticky lg:top-6 lg:block"
      >
        <ul className="space-y-1 rounded-[20px] border border-slate-200/80 bg-white p-2 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)]">
          {sections.map((section) => {
            const isActive = section.id === activeSection.id;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => select(section.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                    isActive ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{section.label}</span>
                  <StateBadge state={section.state} />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sections — accordion on mobile, single active panel on desktop */}
      <div className="space-y-3 lg:space-y-0">
        {sections.map((section) => {
          const isActive = section.id === activeSection.id;
          const panelId = `section-panel-${section.id}`;
          return (
            <div
              key={section.id}
              className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.24)] lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
            >
              {/* Accordion header — mobile only */}
              <button
                type="button"
                onClick={() => select(section.id)}
                aria-expanded={isActive}
                aria-controls={panelId}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left lg:hidden"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[#0f1f35]">
                  {section.label}
                  <StateBadge state={section.state} />
                </span>
                <AccordionChevron open={isActive} />
              </button>
              {isActive ? (
                <div id={panelId} className="border-t border-slate-100 p-3 lg:border-t-0 lg:p-0">
                  {section.content}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
