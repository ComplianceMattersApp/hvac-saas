"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ContractorFocusOption = {
  id: string;
  name: string;
  count: number;
};

type Props = {
  allCount: number;
  internalWorkCount: number;
  internalWorkId: string;
  options: ContractorFocusOption[];
  selectedIds: string[];
};

function optionMatchesSearch(option: ContractorFocusOption, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  return option.name.toLowerCase().includes(normalized);
}

export default function ContractorFocusSelector({
  allCount,
  internalWorkCount,
  internalWorkId,
  options,
  selectedIds,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [draftIds, setDraftIds] = React.useState<string[]>(selectedIds);

  React.useEffect(() => {
    if (open) setDraftIds(selectedIds);
  }, [open, selectedIds]);

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const draftSet = React.useMemo(() => new Set(draftIds), [draftIds]);

  const orderedOptions = React.useMemo(() => {
    return [...options].sort((a, b) => {
      const aSelected = draftSet.has(a.id);
      const bSelected = draftSet.has(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [draftSet, options]);

  const filteredOptions = orderedOptions.filter((option) => optionMatchesSearch(option, search));
  const selectedContractors = options.filter((option) => selectedSet.has(option.id));
  const hasInternalWork = selectedSet.has(internalWorkId);
  const selectedCount = selectedIds.length;
  const summary =
    selectedCount === 0
      ? `All Contractors · ${allCount}`
      : [
          hasInternalWork ? "Internal Work" : "",
          ...selectedContractors.slice(0, 2).map((option) => option.name),
        ].filter(Boolean).join(", ") + (selectedCount > (hasInternalWork ? 3 : 2) ? ` +${selectedCount - (hasInternalWork ? 3 : 2)}` : "");

  function setDraftValue(id: string, checked: boolean) {
    setDraftIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return Array.from(next);
    });
  }

  function apply(nextIds = draftIds) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextIds.length > 0) params.set("contractor", nextIds.join(","));
    else params.delete("contractor");

    const query = params.toString();
    router.push(`/ops${query ? `?${query}` : ""}#ops-workspace`);
    setOpen(false);
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
      >
        <span className="truncate">{summary || `All Contractors · ${allCount}`}</span>
        <span className="text-[10px] text-slate-500" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 p-3 sm:flex sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Contractor Focus selector">
          <div className="ml-auto flex h-full max-h-[calc(100vh-1.5rem)] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl sm:h-auto sm:max-h-[78vh]">
            <div className="border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                    <span className="inline-block h-[13px] w-[3px] rounded-full bg-blue-600" aria-hidden="true" />
                    Contractor Focus
                  </div>
                  <div className="text-sm font-semibold text-slate-950">{draftIds.length || "All"} selected</div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                  Close
                </button>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contractors"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className={[
                  "mb-1 flex min-h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold",
                  draftIds.length === 0 ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                ].join(" ")}
              >
                <span>All Contractors</span>
                <span
                  className={
                    draftIds.length === 0
                      ? "rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white"
                      : allCount === 0
                      ? "rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-300"
                      : "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700"
                  }
                >
                  {allCount}
                </span>
              </button>

              <label
                className={[
                  "mb-1 flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50",
                  draftSet.has(internalWorkId) ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={draftSet.has(internalWorkId)}
                  onChange={(event) => setDraftValue(internalWorkId, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-300"
                />
                <span className="min-w-0 flex-1 truncate">Internal Work</span>
                <span
                  className={
                    internalWorkCount === 0
                      ? "rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-300"
                      : "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700"
                  }
                >
                  {internalWorkCount}
                </span>
              </label>

              {filteredOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-600">
                  No contractors match that search.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredOptions.map((option) => {
                    const isSelected = draftSet.has(option.id);
                    return (
                      <label
                        key={option.id}
                        className={[
                          "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50",
                          isSelected ? "border-slate-200 bg-slate-50 text-slate-900" : "border-slate-200 bg-white text-slate-800",
                          option.count === 0 && !isSelected ? "text-slate-400" : "",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) => setDraftValue(option.id, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-300"
                        />
                        <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        <span
                          className={
                            option.count === 0
                              ? "rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-300"
                              : "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700"
                          }
                        >
                          {option.count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5">
              <button type="button" onClick={() => setDraftIds([])} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Clear
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={() => apply()} className="inline-flex min-h-9 items-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
