"use client";

import { useEffect, useMemo, useState } from "react";
import {
  VISIT_SCOPE_ITEM_LIMIT,
  formatVisitScopeItemKindLabel,
  type VisitScopeItem,
  type VisitScopeItemKind,
} from "@/lib/jobs/visit-scope";

export type VisitScopeDraftItem = Omit<VisitScopeItem, "details"> & {
  id: string;
  details: string;
};

type Props = {
  initialSummary?: string | null;
  initialItems?: VisitScopeItem[];
  jobType: "ecc" | "service";
  summaryName?: string;
  itemsName?: string;
  resetKey?: string | number;
  onSummaryChange?: (value: string) => void;
  onItemsChange?: (items: VisitScopeDraftItem[]) => void;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function toDraftItems(
  items: VisitScopeItem[] | null | undefined,
  jobType: "ecc" | "service",
): VisitScopeDraftItem[] {
  const normalized: VisitScopeDraftItem[] = Array.isArray(items)
    ? items.map((item) => ({
        id: uid(),
        title: String(item.title ?? ""),
        details: String(item.details ?? ""),
        kind:
          jobType === "ecc" && item.kind === "companion_service"
            ? "companion_service"
            : "primary",
        promoted_service_job_id: String(item.promoted_service_job_id ?? "").trim() || null,
        promoted_at: String(item.promoted_at ?? "").trim() || null,
        promoted_by_user_id: String(item.promoted_by_user_id ?? "").trim() || null,
      }))
    : [];

  if (normalized.length > 0) return normalized;

  return [
    {
      id: uid(),
      title: "",
      details: "",
      kind: "primary",
    },
  ];
}

export default function VisitScopeBuilder({
  initialSummary = "",
  initialItems = [],
  jobType,
  summaryName = "visit_scope_summary",
  itemsName = "visit_scope_items_json",
  resetKey,
  onSummaryChange,
  onItemsChange,
}: Props) {
  const [summary, setSummary] = useState(String(initialSummary ?? ""));
  const [items, setItems] = useState<VisitScopeDraftItem[]>(() => toDraftItems(initialItems, jobType));

  useEffect(() => {
    setSummary(String(initialSummary ?? ""));
    setItems(toDraftItems(initialItems, jobType));
  }, [jobType, resetKey]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [onSummaryChange, summary]);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // TITLE FALLBACK VISIBILITY:
  // When title is blank and exactly one scope item exists, show a live preview
  // so the operator understands the first scope item will become the title on create.
  const titleIsBlank = summary.trim() === "";
  const nonEmptyScopeItems = items.filter(
    (item) => item.title.trim() || item.details.trim()
  );
  const hasExactlyOneItem = nonEmptyScopeItems.length === 1;
  const shouldShowFallbackPreview =
    jobType === "service" && titleIsBlank && hasExactlyOneItem;
  const fallbackPreviewTitle = shouldShowFallbackPreview
    ? nonEmptyScopeItems[0]?.title.trim()
    : null;

  const serializedItems = useMemo(() => {
    const payload = items
      .map((item) => ({
        title: item.title.trim(),
        details: item.details.trim(),
        kind: jobType === "ecc" ? item.kind : "primary",
        promoted_service_job_id: String(item.promoted_service_job_id ?? "").trim() || null,
        promoted_at: String(item.promoted_at ?? "").trim() || null,
        promoted_by_user_id: String(item.promoted_by_user_id ?? "").trim() || null,
      }))
      .filter((item) => item.title || item.details);

    return JSON.stringify(payload);
  }, [items, jobType]);

  function addItem() {
    if (items.length >= VISIT_SCOPE_ITEM_LIMIT) return;
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        title: "",
        details: "",
        kind: "primary",
      },
    ]);
  }

  function patchItem(itemId: string, patch: Partial<VisitScopeDraftItem>) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    setItems((prev) => {
      if (prev.length <= 1) {
        return prev.map((item) =>
          item.id === itemId
            ? { ...item, title: "", details: "", kind: "primary" }
            : item,
        );
      }
      return prev.filter((item) => item.id !== itemId);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-900">
          {jobType === "service" ? "Job Title" : "Known trip context"}
        </label>
        <textarea
          name={summaryName}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={2}
          maxLength={600}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
          placeholder={jobType === "service" ? "The headline for this visit (e.g., 'Diagnose no cooling in upstairs system' or 'Replace refrigerant leak')" : "Optional: add any known context for this ECC trip."}
        />
        <p className="text-xs text-slate-500">
          {jobType === "service"
            ? "Enter a job title, or leave it blank to use the first work item below."
            : "Optional. Use this for helpful field context, not to replace the inspection or test type."}
        </p>
        {shouldShowFallbackPreview && fallbackPreviewTitle ? (
          <p className="mt-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 border border-emerald-200">
            <span className="font-medium">Title will use:</span> {fallbackPreviewTitle}
          </p>
        ) : null}
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-slate-900">
              {jobType === "service" ? "Scope for this trip" : "Optional trip notes"}
            </div>
            <div className="text-xs text-slate-500">
              {jobType === "service"
                ? "What belongs to this visit and what should be finished before leaving."
                : "Use when you know companion work, field expectations, or a note worth carrying into dispatch."}
            </div>
          </div>
          <button
            type="button"
            onClick={addItem}
            disabled={items.length >= VISIT_SCOPE_ITEM_LIMIT}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Scope Item
          </button>
        </div>

        {items.map((item, index) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.35)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Item {index + 1}
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="text-xs font-semibold text-rose-700 transition-colors hover:text-rose-800"
              >
                Remove
              </button>
            </div>

            <div className={jobType === "ecc" ? "grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-start" : "space-y-2.5"}>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Work Item
                </label>
                <input
                  type="text"
                  value={item.title}
                  onChange={(event) => patchItem(item.id, { title: event.target.value })}
                  maxLength={160}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                  placeholder={jobType === "service" ? "Diagnose intermittent cooling issue" : "Optional: note companion work or field context"}
                />
              </div>

              {jobType === "ecc" ? (
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Type
                  </label>
                  <select
                    value={item.kind}
                    onChange={(event) =>
                      patchItem(item.id, {
                        kind: event.target.value === "companion_service" ? "companion_service" : "primary",
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                  >
                    <option value="primary">Primary</option>
                    <option value="companion_service">Companion Service</option>
                  </select>
                </div>
              ) : null}
            </div>

            <div className="mt-2.5 space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Work Description</label>
              <textarea
                value={item.details}
                onChange={(event) => patchItem(item.id, { details: event.target.value })}
                rows={2}
                maxLength={500}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                placeholder={jobType === "service" ? "What should the tech complete or verify before leaving?" : "Optional field note for the ECC trip"}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {jobType === "ecc" && item.kind === "companion_service"
                  ? "Same-trip service item under ECC."
                  : jobType === "service"
                  ? "For this trip."
                  : "Optional trip note."}
              </div>
            </div>
          </div>
        ))}
      </div>

      <input type="hidden" name={itemsName} value={serializedItems} />
    </div>
  );
}