"use client";

import { useEffect, useMemo, useState } from "react";
import {
  VISIT_SCOPE_ITEM_LIMIT,
  createVisitScopeItemId,
  sanitizeVisitScopeItemId,
  type VisitScopeItem,
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

type ScopeCandidate = {
  title: string;
  details?: string;
  source_pricebook_item_id?: string | null;
  expected_unit_price?: number | null;
  unit_label?: string | null;
  item_type?: string | null;
  category?: string | null;
};

type ScopeFeedback = {
  message: string;
  tone: "added" | "duplicate" | "limit";
};

const QUICK_SCOPE_CHOICES = [
  {
    label: "Service Call",
    helper: "Start the visit",
  },
  {
    label: "Diagnostic",
    helper: "Find the issue",
  },
  {
    label: "Install",
    helper: "Install work",
  },
] as const;

function normalizeScopeComparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isBlankScopeItem(item: VisitScopeDraftItem) {
  return item.title.trim().length === 0 && item.details.trim().length === 0;
}

function findExistingScopeItem(items: VisitScopeDraftItem[], candidate: ScopeCandidate) {
  const candidateSourceId = sanitizeVisitScopeItemId(candidate.source_pricebook_item_id);
  const candidateTitle = normalizeScopeComparable(candidate.title);

  return items.find((item) => {
    if (isBlankScopeItem(item)) return false;
    const itemSourceId = sanitizeVisitScopeItemId(item.source_pricebook_item_id);
    if (candidateSourceId && itemSourceId && candidateSourceId === itemSourceId) return true;
    return candidateTitle.length > 0 && normalizeScopeComparable(item.title) === candidateTitle;
  });
}

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

  return [];
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
  const [scopeFeedback, setScopeFeedback] = useState<ScopeFeedback | null>(null);
  const [showSavedDefaults, setShowSavedDefaults] = useState(false);
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

  const searchQuery = quickEntryValue.trim();

  const filteredPricebookTemplates = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return availablePricebookTemplates.slice(0, 8);
    return availablePricebookTemplates
      .filter((item) => {
        const searchCorpus = [item.item_name, item.default_description, item.item_type, item.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchCorpus.includes(query);
      })
      .slice(0, 8);
  }, [availablePricebookTemplates, searchQuery]);

  const completedItems = useMemo(
    () => items.filter((item) => item.title.trim().length > 0 || item.details.trim().length > 0),
    [items],
  );

  const shouldShowSavedDefaults =
    availablePricebookTemplates.length > 0 && (showSavedDefaults || searchQuery.length > 0);

  const quickChoices = useMemo(
    () =>
      QUICK_SCOPE_CHOICES.map((choice) => {
        const matchingTemplate =
          availablePricebookTemplates.find(
            (item) => normalizeScopeComparable(item.item_name) === normalizeScopeComparable(choice.label),
          ) ?? null;
        const candidate: ScopeCandidate = matchingTemplate
          ? {
              title: matchingTemplate.item_name,
              details: matchingTemplate.default_description ?? "",
              source_pricebook_item_id: matchingTemplate.id,
              expected_unit_price: matchingTemplate.default_unit_price,
              unit_label: matchingTemplate.unit_label,
              item_type: matchingTemplate.item_type,
              category: matchingTemplate.category,
            }
          : { title: choice.label };

        return {
          ...choice,
          candidate,
          isAdded: Boolean(findExistingScopeItem(items, candidate)),
        };
      }),
    [availablePricebookTemplates, items],
  );

  useEffect(() => {
    const seededItems = toDraftItems(initialItems, jobType);
    const hasSummary = String(initialSummary ?? "").trim().length > 0;
    setSummary(String(initialSummary ?? ""));
    setItems(seededItems);
    setQuickEntryValue("");
    setScopeFeedback(null);
    setShowSavedDefaults(false);
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

  function addScopeCandidate(candidate: ScopeCandidate) {
    const title = candidate.title.trim();
    if (!title) return false;

    if (findExistingScopeItem(items, candidate)) {
      setScopeFeedback({
        tone: "duplicate",
        message: `Already in current job scope: ${title}`,
      });
      return false;
    }

    if (items.every((item) => !isBlankScopeItem(item)) && items.length >= VISIT_SCOPE_ITEM_LIMIT) {
      setScopeFeedback({
        tone: "limit",
        message: `Job scope is limited to ${VISIT_SCOPE_ITEM_LIMIT} items.`,
      });
      return false;
    }

    const nextItem: VisitScopeDraftItem = {
      id: createVisitScopeItemId(),
      title,
      details: String(candidate.details ?? ""),
      kind: "primary",
      source_pricebook_item_id: sanitizeVisitScopeItemId(candidate.source_pricebook_item_id),
      expected_unit_price:
        candidate.expected_unit_price === null ||
        candidate.expected_unit_price === undefined ||
        !Number.isFinite(Number(candidate.expected_unit_price))
          ? null
          : Math.max(0, Number(candidate.expected_unit_price)),
      unit_label: String(candidate.unit_label ?? "").trim() || null,
      item_type: String(candidate.item_type ?? "").trim() || null,
      category: String(candidate.category ?? "").trim() || null,
      promoted_service_job_id: null,
      promoted_at: null,
      promoted_by_user_id: null,
    };

    setItems((prev) => {
      if (findExistingScopeItem(prev, candidate)) return prev;

      const targetIndex = prev.findIndex(isBlankScopeItem);
      if (targetIndex >= 0) {
        return prev.map((item, index) =>
          index === targetIndex ? { ...nextItem, id: item.id } : item,
        );
      }

      if (prev.length >= VISIT_SCOPE_ITEM_LIMIT) return prev;
      return [...prev, nextItem];
    });

    setScopeFeedback({
      tone: "added",
      message: `Added to job scope: ${title}`,
    });
    return true;
  }

  function addManualItemFromQuickEntry() {
    const title = searchQuery;
    if (!title) return;

    const added = addScopeCandidate({
      title,
      source_pricebook_item_id: null,
      expected_unit_price: null,
      unit_label: null,
      item_type: null,
      category: null,
    });

    if (added) setQuickEntryValue("");
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

    const added = addScopeCandidate({
      title: selectedTemplate.item_name,
      details: selectedTemplate.default_description ?? "",
      source_pricebook_item_id: selectedTemplate.id,
      expected_unit_price: selectedTemplate.default_unit_price,
      unit_label: selectedTemplate.unit_label,
      item_type: selectedTemplate.item_type,
      category: selectedTemplate.category,
    });

    if (added) setQuickEntryValue("");
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
          {jobType === "service" ? "Reason for Visit / Visit Title" : "Known trip context"}
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
            ? "Reason for Visit sets the created visit title and gives dispatch context."
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
            {jobType === "service" ? "Work to perform" : "Optional job scope notes"}
          </div>
          <div className="text-xs text-slate-500">
            {jobType === "service"
              ? "Job scope items define what belongs to this visit. They stay operational and do not create invoice charges."
              : "Use when you know companion work, field expectations, or a note worth carrying into dispatch."}
          </div>
          {availablePricebookTemplates.length > 0 ? (
            <div className="text-xs text-slate-500">
              Pricebook is optional. Use Pricebook defaults as a quick starter for job scope.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Quick Add
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {quickChoices.map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    onClick={() => addScopeCandidate(choice.candidate)}
                    disabled={choice.isAdded}
                    aria-pressed={choice.isAdded}
                    className={[
                      "min-h-14 rounded-xl border px-3 py-2 text-left text-sm shadow-sm transition-colors",
                      choice.isAdded
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{choice.label}</span>
                      {choice.isAdded ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Added
                        </span>
                      ) : null}
                    </span>
                    <span className={choice.isAdded ? "mt-0.5 block text-xs text-emerald-800" : "mt-0.5 block text-xs text-slate-500"}>
                      {choice.helper}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Add Custom Work
              </div>
              <input
                type="text"
                value={quickEntryValue}
                onChange={(event) => {
                  setQuickEntryValue(event.target.value);
                  if (scopeFeedback?.tone !== "added") setScopeFeedback(null);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                placeholder={availablePricebookTemplates.length > 0 ? "Search saved work items or type custom work" : "Type custom work to perform"}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Add typed work now, or search saved defaults when you need one.
                </p>
                <button
                  type="button"
                  onClick={addManualItemFromQuickEntry}
                  disabled={!searchQuery}
                  className="min-h-9 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {searchQuery ? `Add "${searchQuery.slice(0, 36)}${searchQuery.length > 36 ? "..." : ""}"` : "Add custom scope"}
                </button>
              </div>
            </div>

            {scopeFeedback ? (
              <p
                className={[
                  "rounded-lg border px-3 py-2 text-xs font-semibold",
                  scopeFeedback.tone === "added"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700",
                ].join(" ")}
                aria-live="polite"
              >
                {scopeFeedback.message}
              </p>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Current Job Scope</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {completedItems.length > 0
                      ? "Add another item, expand Details if needed, then continue."
                      : jobType === "service"
                        ? "Choose a quick item or add custom work to continue."
                        : "Optional for ECC. Add scope only when useful."}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {completedItems.length} added
                </span>
              </div>
              {completedItems.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {completedItems.slice(0, 6).map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {item.title.trim() || "Untitled scope item"}
                    </span>
                  ))}
                  {completedItems.length > 6 ? (
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                      +{completedItems.length - 6} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {availablePricebookTemplates.length > 0 ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSavedDefaults((value) => !value)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  aria-expanded={showSavedDefaults}
                >
                  {showSavedDefaults ? "Hide saved work items" : "Browse saved work items"}
                </button>

                {shouldShowSavedDefaults && filteredPricebookTemplates.length > 0 ? (
                <div className="space-y-2 pt-1">
                {filteredPricebookTemplates.map((item) => {
                  const candidate: ScopeCandidate = {
                    title: item.item_name,
                    details: item.default_description ?? "",
                    source_pricebook_item_id: item.id,
                    expected_unit_price: item.default_unit_price,
                    unit_label: item.unit_label,
                    item_type: item.item_type,
                    category: item.category,
                  };
                  const isAdded = Boolean(findExistingScopeItem(items, candidate));

                  return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyPricebookTemplate(item)}
                    disabled={isAdded}
                    className={[
                      "w-full rounded-xl border px-3 py-3 text-left shadow-sm transition-colors",
                      isAdded
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{item.item_name}</div>
                        <div className={isAdded ? "mt-0.5 text-xs text-emerald-800" : "mt-0.5 text-xs text-slate-500"}>
                          {[item.item_type, item.category, item.unit_label].filter(Boolean).join(" / ") || "Default from Pricebook"}
                        </div>
                      </div>
                      {isAdded ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          Added
                        </span>
                      ) : null}
                    </div>
                    {item.default_description ? (
                      <div className={isAdded ? "mt-2 text-xs leading-5 text-emerald-800" : "mt-2 text-xs leading-5 text-slate-600"}>{item.default_description}</div>
                    ) : null}
                  </button>
                  );
                })}
              </div>
            ) : shouldShowSavedDefaults ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                No saved work items match this search. Add the typed custom work instead.
              </div>
            ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {items.map((item, index) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.35)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Scope Item {index + 1}</div>
                <div className="text-sm font-semibold text-slate-900">
                  {item.title.trim() || "Untitled scope item"}
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
                  Work To Perform
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

            <details className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                Details
              </summary>
              <div className="mt-2.5 space-y-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Description</label>
                  <textarea
                    value={item.details}
                    onChange={(event) => patchItem(item.id, { details: event.target.value })}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
                    placeholder={jobType === "service" ? "What should the tech complete or verify before leaving?" : "Optional field note for the ECC trip"}
                  />
                </div>

                <div className="grid gap-2.5 md:grid-cols-4">
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

                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Metadata:</span>{" "}
                  {item.source_pricebook_item_id
                    ? `Default from Pricebook (${item.source_pricebook_item_id}).`
                    : "Manual scope entry."}
                </div>
              </div>
            </details>

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
