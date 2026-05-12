"use client";

import { useEffect, useMemo, useState } from "react";
import {
  VISIT_SCOPE_ITEM_LIMIT,
  createVisitScopeItemId,
  formatVisitScopeItemKindLabel,
  sanitizeVisitScopeItemId,
  type VisitScopeItem,
  type VisitScopeItemKind,
} from "@/lib/jobs/visit-scope";

export type VisitScopeDraftItem = Omit<VisitScopeItem, "details"> & {
  id: string;
  details: string;
};

export type VisitScopePricebookTemplateItem = {
  id: string;
  item_name: string;
  item_type?: string | null;
  category?: string | null;
  default_description: string | null;
  default_unit_price?: number | null;
  unit_label?: string | null;
};

type Props = {
  initialSummary?: string | null;
  initialItems?: VisitScopeItem[];
  jobType: "ecc" | "service";
  pricebookTemplateItems?: VisitScopePricebookTemplateItem[];
  summaryName?: string;
  itemsName?: string;
  resetKey?: string | number;
  onSummaryChange?: (value: string) => void;
  onItemsChange?: (items: VisitScopeDraftItem[]) => void;
};

function toDraftItems(
  items: VisitScopeItem[] | null | undefined,
  jobType: "ecc" | "service",
): VisitScopeDraftItem[] {
  const normalized: VisitScopeDraftItem[] = Array.isArray(items)
    ? items.map((item) => ({
        id: sanitizeVisitScopeItemId(item.id) ?? createVisitScopeItemId(),
        title: String(item.title ?? ""),
        details: String(item.details ?? ""),
        kind:
          jobType === "ecc" && item.kind === "companion_service"
            ? "companion_service"
            : "primary",
        source_pricebook_item_id:
          sanitizeVisitScopeItemId(item.source_pricebook_item_id) ?? null,
        expected_unit_price:
          item.expected_unit_price === null || item.expected_unit_price === undefined
            ? null
            : Number.isFinite(Number(item.expected_unit_price))
              ? Math.max(0, Number(item.expected_unit_price))
              : null,
        unit_label: String(item.unit_label ?? "").trim() || null,
        item_type: String(item.item_type ?? "").trim() || null,
        category: String(item.category ?? "").trim() || null,
        promoted_service_job_id: String(item.promoted_service_job_id ?? "").trim() || null,
        promoted_at: String(item.promoted_at ?? "").trim() || null,
        promoted_by_user_id: String(item.promoted_by_user_id ?? "").trim() || null,
      }))
    : [];

  if (normalized.length > 0) return normalized;

  if (jobType === "ecc") {
    return [];
  }

  return [
    {
      id: createVisitScopeItemId(),
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
  pricebookTemplateItems = [],
  summaryName = "visit_scope_summary",
  itemsName = "visit_scope_items_json",
  resetKey,
  onSummaryChange,
  onItemsChange,
}: Props) {
  const [summary, setSummary] = useState(String(initialSummary ?? ""));
  const [items, setItems] = useState<VisitScopeDraftItem[]>(() => toDraftItems(initialItems, jobType));
  const [quickEntryValue, setQuickEntryValue] = useState("");
  const [showEccOptionalScope, setShowEccOptionalScope] = useState(() => {
    const seededItems = toDraftItems(initialItems, jobType);
    const hasSummary = String(initialSummary ?? "").trim().length > 0;
    return jobType === "service" || hasSummary || seededItems.length > 0;
  });

  const availablePricebookTemplates = useMemo(
    () =>
      (Array.isArray(pricebookTemplateItems) ? pricebookTemplateItems : [])
        .map((item) => ({
          id: String(item.id ?? "").trim(),
          item_name: String(item.item_name ?? "").trim(),
          item_type: String(item.item_type ?? "").trim() || null,
          category: String(item.category ?? "").trim() || null,
          default_description: String(item.default_description ?? "").trim() || null,
          default_unit_price:
            item.default_unit_price === null || item.default_unit_price === undefined
              ? null
              : Number(item.default_unit_price) >= 0
                ? Number(item.default_unit_price)
                : null,
          unit_label: String(item.unit_label ?? "").trim() || null,
        }))
        .filter((item) => item.id && item.item_name),
    [pricebookTemplateItems],
  );

  const filteredPricebookTemplates = useMemo(() => {
    const query = quickEntryValue.trim().toLowerCase();
    if (!query) return availablePricebookTemplates.slice(0, 6);
    return availablePricebookTemplates
      .filter((item) => {
        const searchCorpus = [item.item_name, item.default_description, item.item_type, item.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchCorpus.includes(query);
      })
      .slice(0, 8);
  }, [availablePricebookTemplates, quickEntryValue]);

  useEffect(() => {
    const seededItems = toDraftItems(initialItems, jobType);
    const hasSummary = String(initialSummary ?? "").trim().length > 0;
    setSummary(String(initialSummary ?? ""));
    setItems(seededItems);
    setQuickEntryValue("");
    setShowEccOptionalScope(jobType === "service" || hasSummary || seededItems.length > 0);
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
        id: item.id,
        title: item.title.trim(),
        details: item.details.trim(),
        kind: jobType === "ecc" ? item.kind : "primary",
        source_pricebook_item_id: sanitizeVisitScopeItemId(item.source_pricebook_item_id),
        expected_unit_price:
          item.expected_unit_price === null || item.expected_unit_price === undefined || Number.isNaN(Number(item.expected_unit_price))
            ? null
            : Math.max(0, Number(item.expected_unit_price)),
        unit_label: String(item.unit_label ?? "").trim() || null,
        item_type: String(item.item_type ?? "").trim() || null,
        category: String(item.category ?? "").trim() || null,
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
        id: createVisitScopeItemId(),
        title: "",
        details: "",
        kind: "primary",
        source_pricebook_item_id: null,
        expected_unit_price: null,
        unit_label: null,
        item_type: null,
        category: null,
      },
    ]);
  }

  function addManualItemFromQuickEntry() {
    const title = quickEntryValue.trim();
    if (!title) {
      addItem();
      return;
    }

    setItems((prev) => {
      const targetIndex = prev.findIndex(
        (item) => item.title.trim().length === 0 && item.details.trim().length === 0,
      );

      if (targetIndex >= 0) {
        return prev.map((item, index) =>
          index === targetIndex
            ? {
                ...item,
                title,
                source_pricebook_item_id: null,
              }
            : item,
        );
      }

      if (prev.length >= VISIT_SCOPE_ITEM_LIMIT) {
        return prev;
      }

      return [
        ...prev,
        {
          id: createVisitScopeItemId(),
          title,
          details: "",
          kind: "primary",
          source_pricebook_item_id: null,
          expected_unit_price: null,
          unit_label: null,
          item_type: null,
          category: null,
        },
      ];
    });

    setQuickEntryValue("");
  }

  function patchItem(itemId: string, patch: Partial<VisitScopeDraftItem>) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    setItems((prev) => {
      if (prev.length <= 1) {
        if (jobType === "ecc") {
          return [];
        }
        return prev.map((item) =>
          item.id === itemId
            ? { ...item, title: "", details: "", kind: "primary" }
            : item,
        );
      }
      return prev.filter((item) => item.id !== itemId);
    });
  }

  function applyPricebookTemplate(selectedTemplate: VisitScopePricebookTemplateItem) {
    if (!selectedTemplate?.id) return;

    setItems((prev) => {
      const targetIndex = prev.findIndex(
        (item) => item.title.trim().length === 0 && item.details.trim().length === 0,
      );

      if (targetIndex >= 0) {
        return prev.map((item, index) =>
          index === targetIndex
            ? {
                ...item,
                title: selectedTemplate.item_name,
                details: selectedTemplate.default_description ?? "",
                source_pricebook_item_id: selectedTemplate.id,
                expected_unit_price:
                  selectedTemplate.default_unit_price === null || selectedTemplate.default_unit_price === undefined
                    ? null
                    : Math.max(0, Number(selectedTemplate.default_unit_price)),
                unit_label: selectedTemplate.unit_label ?? null,
                item_type: selectedTemplate.item_type ?? null,
                category: selectedTemplate.category ?? null,
              }
            : item,
        );
      }

      if (prev.length >= VISIT_SCOPE_ITEM_LIMIT) {
        return prev;
      }

      return [
        ...prev,
        {
          id: createVisitScopeItemId(),
          title: selectedTemplate.item_name,
          details: selectedTemplate.default_description ?? "",
          kind: "primary",
          source_pricebook_item_id: selectedTemplate.id,
          expected_unit_price:
            selectedTemplate.default_unit_price === null || selectedTemplate.default_unit_price === undefined
              ? null
              : Math.max(0, Number(selectedTemplate.default_unit_price)),
          unit_label: selectedTemplate.unit_label ?? null,
          item_type: selectedTemplate.item_type ?? null,
          category: selectedTemplate.category ?? null,
        },
      ];
    });

    setQuickEntryValue("");
  }

  return (
    <div className="space-y-3">
      {jobType === "ecc" && !showEccOptionalScope ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3">
          <p className="text-sm text-slate-700">
            Optional: add companion service work or extra visit notes if this ECC visit also includes service work.
          </p>
          <button
            type="button"
            onClick={() => setShowEccOptionalScope(true)}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Add Optional Scope
          </button>
        </div>
      ) : null}

      {jobType === "service" || showEccOptionalScope ? (
      <>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-900">
          {jobType === "service" ? "Reason for Visit / Dispatch Notes" : "Known trip context"}
        </label>
        <textarea
          name={summaryName}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={2}
          maxLength={600}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
          placeholder={jobType === "service" ? "Why this visit exists and key dispatch context (e.g., 'No cooling upstairs - intermittent after 3pm')" : "Optional: add any known context for this ECC trip."}
        />
        <p className="text-xs text-slate-500">
          {jobType === "service"
            ? "Reason for Visit explains why this visit exists and gives dispatch context."
            : "Optional. Use this for helpful field context, not to replace the inspection or test type."}
        </p>
        {shouldShowFallbackPreview && fallbackPreviewTitle ? (
          <p className="mt-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 border border-emerald-200">
            <span className="font-medium">Title will use:</span> {fallbackPreviewTitle}
          </p>
        ) : null}
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-900">
            {jobType === "service" ? "Work Items" : "Optional trip notes"}
          </div>
          <div className="text-xs text-slate-500">
            {jobType === "service"
              ? "Work Items define what belongs to this visit. They can help build an invoice later, but they are not billing records."
              : "Use when you know companion work, field expectations, or a note worth carrying into dispatch."}
          </div>
          {availablePricebookTemplates.length > 0 ? (
            <div className="text-xs text-slate-500">
              Pricebook is a starting template. Work Item is the actual work for this visit. Invoice Charges are reviewed billed copies created later.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Work Item Entry
            </div>
            <input
              type="text"
              value={quickEntryValue}
              onChange={(event) => setQuickEntryValue(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
              placeholder={availablePricebookTemplates.length > 0 ? "Search Pricebook or type a manual Work Item" : "Type a Work Item"}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Pick a match below or add the typed item as a new visit line.
              </p>
              <button
                type="button"
                onClick={addManualItemFromQuickEntry}
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
              >
                Add Typed Item
              </button>
            </div>

            {availablePricebookTemplates.length > 0 && filteredPricebookTemplates.length > 0 ? (
              <div className="space-y-2 pt-1">
                {filteredPricebookTemplates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyPricebookTemplate(item)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{item.item_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {[item.item_type, item.category, item.unit_label].filter(Boolean).join(" · ") || "Pricebook match"}
                        </div>
                      </div>
                      {item.default_unit_price !== null && item.default_unit_price !== undefined ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          ${Number(item.default_unit_price).toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    {item.default_description ? (
                      <div className="mt-2 text-xs leading-5 text-slate-600">{item.default_description}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="pt-1">
              <button
                type="button"
                onClick={addItem}
                disabled={items.length >= VISIT_SCOPE_ITEM_LIMIT}
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add Work Item
              </button>
            </div>
          </div>
        </div>

        {items.map((item, index) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.35)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Item {index + 1}</div>
                <div className="text-sm font-semibold text-slate-900">
                  {item.title.trim() || "Untitled Work Item"}
                  {item.expected_unit_price !== null && item.expected_unit_price !== undefined ? ` — $${Number(item.expected_unit_price).toFixed(2)}` : ""}
                </div>
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

            <div className="mt-2.5 grid gap-2.5 md:grid-cols-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Expected Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.expected_unit_price ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (!raw) {
                      patchItem(item.id, { expected_unit_price: null });
                      return;
                    }

                    const parsed = Number.parseFloat(raw);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                      patchItem(item.id, { expected_unit_price: null });
                      return;
                    }

                    patchItem(item.id, { expected_unit_price: Number(parsed.toFixed(2)) });
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Unit Label</label>
                <input
                  type="text"
                  value={item.unit_label ?? ""}
                  onChange={(event) => patchItem(item.id, { unit_label: event.target.value || null })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                  placeholder="each"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Type</label>
                <input
                  type="text"
                  value={item.item_type ?? ""}
                  onChange={(event) => patchItem(item.id, { item_type: event.target.value || null })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                  placeholder="service"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Category</label>
                <input
                  type="text"
                  value={item.category ?? ""}
                  onChange={(event) => patchItem(item.id, { category: event.target.value || null })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                  placeholder="Diagnostic"
                />
              </div>
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
      </>
      ) : null}

      {jobType === "ecc" && !showEccOptionalScope ? (
        <input type="hidden" name={itemsName} value={serializedItems} />
      ) : null}
    </div>
  );
}