"use client";

import * as React from "react";
import Link from "next/link";
import {
  OPS_BOARD_SORT_OPTIONS,
  sortOpsBoardRows,
  type OpsBoardSortKey,
} from "@/lib/ops/ops-board-sorting";
import OpsQueueRowCard, { type FieldPaymentReviewRowView, type OpsQueueRowView } from "./OpsQueueRowCard";

export type OpsBoardActiveQueueRow = {
  id: string;
  reasonKey: string | null;
  sortable: {
    created_at: string | null;
    scheduled_date: string | null;
    window_start: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    contractors: { name: string | null } | null;
  };
  view: OpsQueueRowView;
};

type ReasonOption = { key: string; label: string };

export type OpsBoardPanelData = {
  queueLabel: string;
  itemNoun: string;
  reasonOptions: ReasonOption[];
  rows: OpsBoardActiveQueueRow[];
  pinnedViews: FieldPaymentReviewRowView[];
  canExportContractorSafeCsv: boolean;
};

export type OpsBoardChip =
  | { kind: "switchable"; key: string; bucket: string; label: string; mobileLabel: string; count: number }
  | { kind: "link"; key: string; href: string; label: string; mobileLabel: string; count: number; active?: boolean };

export type OpsBoardHiddenChip = {
  key: string;
  label: string;
  count: number;
  href: string;
};

type Props = {
  chips: OpsBoardChip[];
  hiddenTodayChips: OpsBoardHiddenChip[];
  contractorFocusSelector?: React.ReactNode;
  initialBucket: string;
  initialPanel: OpsBoardPanelData;
  bucketPreviewLimits: Record<string, number>;
  contractorParam: string;
  hasContractorFilter: boolean;
  clearContractorHref: string;
  headerRightActionByBucket: Partial<Record<string, { label: string; href: string }>>;
};

function buildQueryString(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim() !== "") sp.set(key, String(value));
  }
  const query = sp.toString();
  return query ? `?${query}` : "";
}

export default function OpsBoardActiveQueuePanel({
  chips,
  hiddenTodayChips,
  contractorFocusSelector,
  initialBucket,
  initialPanel,
  bucketPreviewLimits,
  contractorParam,
  hasContractorFilter,
  clearContractorHref,
  headerRightActionByBucket,
}: Props) {
  const [activeBucket, setActiveBucket] = React.useState(initialBucket);
  const [panelCache, setPanelCache] = React.useState<Record<string, OpsBoardPanelData>>({
    [initialBucket]: initialPanel,
  });
  const [loadingBucket, setLoadingBucket] = React.useState<string | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [reasonKey, setReasonKey] = React.useState("");
  const [sort, setSort] = React.useState<OpsBoardSortKey>("oldest");

  async function selectBucket(bucket: string) {
    if (bucket === activeBucket) return;
    setActiveBucket(bucket);
    setReasonKey("");
    setSort("oldest");
    setFetchError(null);

    const url = new URL(window.location.href);
    url.searchParams.set("bucket", bucket);
    window.history.replaceState(null, "", `${url.pathname}${url.search}#ops-workspace`);

    if (panelCache[bucket]) return;

    setLoadingBucket(bucket);
    try {
      const query = buildQueryString({
        bucket,
        contractor: contractorParam,
        previewLimit: String(bucketPreviewLimits[bucket] ?? 10),
      });
      const res = await fetch(`/ops/queue-panel${query}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: OpsBoardPanelData = await res.json();
      setPanelCache((prev) => ({ ...prev, [bucket]: data }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Could not load this queue.");
    } finally {
      setLoadingBucket(null);
    }
  }

  const panel = panelCache[activeBucket];
  const isLoadingActive = loadingBucket === activeBucket && !panel;

  const visibleRows = React.useMemo(() => {
    if (!panel) return [];
    const filtered = reasonKey ? panel.rows.filter((row) => row.reasonKey === reasonKey) : panel.rows;
    return sortOpsBoardRows(
      filtered.map((row) => ({ ...row.sortable, __row: row })),
      sort
    ).map((entry: any) => entry.__row as OpsBoardActiveQueueRow);
  }, [panel, reasonKey, sort]);

  const hasActiveFilters = hasContractorFilter || Boolean(reasonKey);

  function clearFilters() {
    setReasonKey("");
    if (hasContractorFilter) window.location.assign(clearContractorHref);
  }

  const canShowExport = panel ? panel.rows.length >= 0 : false;
  const internalExportHref = `/ops/export${buildQueryString({
    queue: activeBucket,
    bucket: activeBucket,
    contractor: contractorParam,
    reason: reasonKey,
    sort: sort === "oldest" ? "" : sort,
    mode: "internal",
  })}`;
  const contractorSafeExportHref = `/ops/export${buildQueryString({
    queue: activeBucket,
    bucket: activeBucket,
    contractor: contractorParam,
    reason: reasonKey,
    sort: sort === "oldest" ? "" : sort,
    mode: "contractor_safe",
  })}`;

  const countText = panel
    ? visibleRows.length === panel.rows.length
      ? `${panel.rows.length} ${panel.itemNoun}`
      : `Showing ${visibleRows.length} of ${panel.rows.length} ${panel.itemNoun}`
    : "";

  const headerRightAction = headerRightActionByBucket[activeBucket];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Operations queue selector">
        {chips.map((chip) => {
          if (chip.kind === "link") {
            return (
              <Link
                key={chip.key}
                href={chip.href}
                aria-current={chip.active ? "page" : undefined}
                className={`inline-flex min-h-10 flex-[1_1_calc(50%-0.5rem)] items-center justify-center rounded-full border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-9 sm:flex-none sm:px-3 sm:text-xs ${
                  chip.active
                    ? "border-navy bg-navy text-white"
                    : chip.count === 0
                    ? "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="sm:hidden">{chip.mobileLabel} · {chip.count}</span>
                <span className="hidden sm:inline">{chip.label} · {chip.count}</span>
              </Link>
            );
          }

          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => selectBucket(chip.bucket)}
              aria-current={chip.bucket === activeBucket ? "page" : undefined}
              className={`inline-flex min-h-10 flex-[1_1_calc(50%-0.5rem)] items-center justify-center rounded-full border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-9 sm:flex-none sm:px-3 sm:text-xs ${
                chip.bucket === activeBucket
                  ? "border-navy bg-navy text-white"
                  : chip.count === 0
                  ? "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="sm:hidden">
                {chip.mobileLabel} · {chip.count}
                {loadingBucket === chip.bucket ? " …" : ""}
              </span>
              <span className="hidden sm:inline">
                {chip.label} · {chip.count}
                {loadingBucket === chip.bucket ? " …" : ""}
              </span>
            </button>
          );
        })}
        {hiddenTodayChips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`inline-flex min-h-10 flex-[1_1_calc(50%-0.5rem)] items-center justify-center rounded-full border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-9 sm:flex-none sm:px-3 sm:text-xs ${
              chip.count === 0
                ? "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>{chip.label} · {chip.count}</span>
          </Link>
        ))}
      </div>

      {contractorFocusSelector}

      <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Reason</span>
          <select
            value={reasonKey}
            onChange={(event) => setReasonKey(event.target.value)}
            disabled={!panel}
            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            <option value="">All reasons</option>
            {(panel?.reasonOptions ?? []).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as OpsBoardSortKey)}
            disabled={!panel}
            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            {OPS_BOARD_SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {canShowExport ? (
        <div className="mb-3 flex justify-end">
          <details className="group relative">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 [&::-webkit-details-marker]:hidden">
              Export
              <span className="text-[10px] transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_38px_-20px_rgba(15,23,42,0.35)]">
              <div className="mb-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Exports the current queue and filters.</div>
                <div>Contractor-safe CSV excludes internal notes, billing, and payment details.</div>
                {!panel?.canExportContractorSafeCsv ? (
                  <div className="mt-1 font-semibold text-amber-700">Choose a contractor to create a contractor-safe CSV.</div>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Link
                  href={internalExportHref}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Internal CSV
                </Link>
                {panel?.canExportContractorSafeCsv ? (
                  <Link
                    href={contractorSafeExportHref}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Contractor-Safe CSV
                  </Link>
                ) : (
                  <span className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-400">
                    Contractor-Safe CSV
                  </span>
                )}
              </div>
            </div>
          </details>
        </div>
      ) : null}

      <article className="rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] ring-1 ring-slate-200/70 sm:p-3.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Queue</div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">{panel?.queueLabel ?? ""}</div>
            <div className="text-xs text-slate-600">{countText}</div>
          </div>
          {headerRightAction ? (
            <Link
              href={headerRightAction.href}
              className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50/80 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
            >
              {headerRightAction.label}
            </Link>
          ) : null}
        </div>

        {isLoadingActive ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : fetchError && !panel ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">{fetchError}</div>
        ) : !panel || (panel.pinnedViews.length === 0 && visibleRows.length === 0) ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <div>{hasActiveFilters ? "No jobs match these filters." : "No jobs in this queue right now."}</div>
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="mt-2 inline-flex font-semibold text-blue-700 underline-offset-2 hover:underline">
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {panel.pinnedViews.map((view) => (
              <OpsQueueRowCard key={`field-payment-${view.reportId}`} view={view} />
            ))}
            {visibleRows.map((row) => (
              <OpsQueueRowCard key={row.id} view={row.view} />
            ))}
          </div>
        )}
      </article>
    </>
  );
}
