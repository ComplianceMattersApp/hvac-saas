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
    queue_entered_at: string | null;
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

type Props = {
  contractorFocusSelector?: React.ReactNode;
  initialBucket: string;
  initialSort: OpsBoardSortKey;
  initialPanel: OpsBoardPanelData;
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
  contractorFocusSelector,
  initialBucket,
  initialSort,
  initialPanel,
  contractorParam,
  hasContractorFilter,
  clearContractorHref,
  headerRightActionByBucket,
}: Props) {
  // Bucket switching is a server navigation (the chips are links), so this
  // panel is remounted with fresh props for each bucket — it renders the
  // server-provided panel directly. Reason/Sort stay client-side within the
  // current bucket.
  const [reasonKey, setReasonKey] = React.useState("");
  const [sort, setSort] = React.useState<OpsBoardSortKey>(initialSort);

  const panel = initialPanel;

  const visibleRows = React.useMemo(() => {
    const filtered = reasonKey ? panel.rows.filter((row) => row.reasonKey === reasonKey) : panel.rows;
    return sortOpsBoardRows(
      filtered.map((row) => ({ ...row.sortable, __row: row })),
      sort,
      { queueEnteredAt: (row) => row.queue_entered_at },
    ).map((entry: any) => entry.__row as OpsBoardActiveQueueRow);
  }, [panel, reasonKey, sort]);

  const hasActiveFilters = hasContractorFilter || Boolean(reasonKey);

  function clearFilters() {
    setReasonKey("");
    if (hasContractorFilter) window.location.assign(clearContractorHref);
  }

  const canShowExport = true;
  const internalExportHref = `/ops/export${buildQueryString({
    queue: initialBucket,
    bucket: initialBucket,
    contractor: contractorParam,
    reason: reasonKey,
    sort: sort === "oldest" ? "" : sort,
    mode: "internal",
  })}`;
  const contractorSafeExportHref = `/ops/export${buildQueryString({
    queue: initialBucket,
    bucket: initialBucket,
    contractor: contractorParam,
    reason: reasonKey,
    sort: sort === "oldest" ? "" : sort,
    mode: "contractor_safe",
  })}`;

  const countText =
    visibleRows.length === panel.rows.length
      ? `${panel.rows.length} ${panel.itemNoun}`
      : `Showing ${visibleRows.length} of ${panel.rows.length} ${panel.itemNoun}`;

  const headerRightAction = headerRightActionByBucket[initialBucket];

  return (
    <>
      {contractorFocusSelector}

      <div className="mb-3 hidden gap-2 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:items-end">
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">Reason</span>
          <select
            value={reasonKey}
            onChange={(event) => setReasonKey(event.target.value)}
            disabled={!panel}
            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
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
            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            {OPS_BOARD_SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {canShowExport ? (
          <details id="ops-export-menu" className="group relative">
            <summary className="inline-flex min-h-[42px] cursor-pointer list-none items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 [&::-webkit-details-marker]:hidden">
              Export
              <span className="text-[10px] transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_38px_-20px_rgba(15,23,42,0.35)]">
              <div className="mb-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Exports the current queue and filters.</div>
                <div>Contractor-safe CSV excludes internal notes, billing, and payment details.</div>
                {!panel?.canExportContractorSafeCsv ? (
                  <div className="mt-1 font-semibold text-amber-700">Choose a contractor to create a contractor-safe CSV.</div>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Link href={internalExportHref} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
                  Internal CSV
                </Link>
                {panel?.canExportContractorSafeCsv ? (
                  <Link href={contractorSafeExportHref} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                    Contractor-Safe CSV
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-500">
                    Contractor-Safe CSV
                  </span>
                )}
              </div>
            </div>
          </details>
        ) : null}
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

      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 xl:hidden">
        <label className="min-w-0">
          <span className="sr-only">Reason</span>
          <select
            aria-label="Reason"
            value={reasonKey}
            onChange={(event) => setReasonKey(event.target.value)}
            disabled={!panel}
            className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2.5 text-[13px] font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            <option value="">All reasons</option>
            {(panel?.reasonOptions ?? []).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Sort</span>
          <select
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as OpsBoardSortKey)}
            disabled={!panel}
            className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2.5 text-[13px] font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            {OPS_BOARD_SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {canShowExport ? (
          <details id="ops-export-menu-mobile" className="group relative">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 [&::-webkit-details-marker]:hidden">
              Export
              <span className="text-[10px] transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_38px_-20px_rgba(15,23,42,0.35)]">
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
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Internal CSV
                </Link>
                {panel?.canExportContractorSafeCsv ? (
                  <Link
                    href={contractorSafeExportHref}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Contractor-Safe CSV
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-400">
                    Contractor-Safe CSV
                  </span>
                )}
              </div>
            </div>
          </details>
        ) : null}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="col-span-full inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <article className="border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-2xl xl:border xl:border-slate-300/80 xl:bg-white xl:p-3.5 xl:shadow-[0_18px_38px_-30px_rgba(15,23,42,0.36)] xl:ring-1 xl:ring-slate-200/70">
        <div className="mb-2 hidden flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 xl:flex">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Queue</div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-950">{panel?.queueLabel ?? ""}</div>
            <div className="text-xs text-slate-600">{countText}</div>
          </div>
          {headerRightAction ? (
            <Link
              href={headerRightAction.href}
              className="inline-flex items-center rounded-md border border-slate-200/90 bg-slate-50 px-2 py-1 text-[13px] font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform,color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_16px_-16px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
            >
              {headerRightAction.label}
            </Link>
          ) : null}
        </div>

        {headerRightAction ? (
          <div className="mb-3 flex xl:hidden">
            <Link
              href={headerRightAction.href}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              {headerRightAction.label}
            </Link>
          </div>
        ) : null}

        {panel.pinnedViews.length === 0 && visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            <div>{hasActiveFilters ? "No jobs match these filters." : "No jobs in this queue right now."}</div>
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="mt-2 inline-flex font-semibold text-blue-700 underline-offset-2 hover:underline">
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {panel.pinnedViews.length ? (
              <div className="space-y-2">
                {panel.pinnedViews.map((view) => (
                  <OpsQueueRowCard key={`field-payment-${view.reportId}`} view={view} />
                ))}
              </div>
            ) : null}

            {visibleRows.length ? (
              // The shared white sheet is desktop-only. Mobile renders discrete
              // gapped cards, and an unprefixed sheet would merge them back
              // into one continuous surface.
              <div className="xl:overflow-hidden xl:rounded-xl xl:border xl:border-slate-200 xl:bg-white">
                <div className="hidden grid-cols-[3px_minmax(190px,1fr)_140px_62px_130px_130px_110px] border-b border-slate-200 bg-slate-50 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 xl:grid 2xl:grid-cols-[3px_minmax(220px,1fr)_168px_72px_158px_158px_132px]">
                  <div />
                  <div className="px-4 py-2.5">Customer / Job</div>
                  <div className="border-l border-slate-200 px-4 py-2.5">Contractor</div>
                  <div className="border-l border-slate-200 px-3 py-2.5">Age</div>
                  <div className="border-l border-slate-200 px-3 py-2.5">Last Action</div>
                  <div className="border-l border-slate-200 px-3 py-2.5">Last Attempt</div>
                  <div className="border-l border-slate-200 px-3 py-2.5 text-center">Actions</div>
                </div>
                <div className="space-y-3 xl:space-y-0">
                  {visibleRows.map((row) => (
                    <OpsQueueRowCard key={row.id} view={row.view} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </article>
    </>
  );
}
