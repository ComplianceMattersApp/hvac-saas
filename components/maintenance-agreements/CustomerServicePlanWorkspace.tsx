"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CustomerServicePlanNavItem = {
  id: string;
  name: string;
  status: string;
  frequency: string;
  nextDueDate: string | null;
  dueState: "overdue" | "due_today" | "upcoming" | "not_scheduled" | "inactive";
};

const SelectedPlanContext = createContext<string>("");

export function CustomerServicePlanWorkspace({
  plans,
  initialSelectedId,
  children,
}: {
  plans: CustomerServicePlanNavItem[];
  initialSelectedId?: string | null;
  children: ReactNode;
}) {
  const firstId = plans[0]?.id ?? "";
  const validInitialId = plans.some((plan) => plan.id === initialSelectedId)
    ? String(initialSelectedId)
    : firstId;
  const [selectedId, setSelectedId] = useState(validInitialId);
  useEffect(() => {
    setSelectedId(validInitialId);
  }, [validInitialId]);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? plans[0] ?? null,
    [plans, selectedId],
  );

  const selectPlan = (id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "service-plans");
    url.searchParams.set("maFocus", id);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="grid min-w-0 max-w-full gap-4 overflow-hidden lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50 p-2 lg:sticky lg:top-24">
        <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Customer plans
        </div>

        <label className="block lg:hidden">
          <span className="sr-only">Selected service plan</span>
          <select
            value={selectedPlan?.id ?? ""}
            onChange={(event) => selectPlan(event.target.value)}
            className="min-h-11 w-full max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {formatToken(plan.status)}{plan.nextDueDate ? ` — Due ${formatDate(plan.nextDueDate)}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="hidden lg:block lg:space-y-1">
          {plans.map((plan) => {
            const selected = plan.id === selectedPlan?.id;
            const needsAttention = plan.dueState === "overdue" || plan.dueState === "due_today";
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => selectPlan(plan.id)}
                aria-pressed={selected}
                className={`w-full min-w-0 rounded-lg border px-3 py-3 text-left transition ${
                  selected
                    ? "border-blue-300 bg-white shadow-sm ring-1 ring-blue-100"
                    : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-slate-900">{plan.name}</span>
                  {needsAttention ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" /> : null}
                </div>
                <div className="mt-1 truncate text-xs text-slate-600">
                  {formatToken(plan.status)} · {formatToken(plan.frequency)}
                </div>
                <div className={`mt-1 text-xs font-medium ${needsAttention ? "text-amber-700" : "text-slate-500"}`}>
                  {plan.nextDueDate ? `Due ${formatDate(plan.nextDueDate)}` : "No due date"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <SelectedPlanContext.Provider value={selectedPlan?.id ?? ""}>
        <div className="min-w-0">{children}</div>
      </SelectedPlanContext.Provider>
    </div>
  );
}

export function CustomerServicePlanDetail({ id, children }: { id: string; children: ReactNode }) {
  const selectedId = useContext(SelectedPlanContext);
  return <div className="min-w-0 max-w-full overflow-hidden" hidden={selectedId !== id}>{children}</div>;
}

function formatToken(value: string) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}
