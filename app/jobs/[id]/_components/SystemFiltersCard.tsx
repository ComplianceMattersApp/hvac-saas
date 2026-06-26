"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import SubmitButton from "@/components/SubmitButton";
import {
  addSystemFilterFromForm,
  archiveSystemFilterFromForm,
  updateSystemFilterFromForm,
} from "@/lib/actions/job-actions";
import type { JobSystemFilterRow } from "@/lib/customers/system-filters-read-model";

type SystemRow = { id: string; name: string | null };

function formatDimension(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, "");
}

function formatDateChanged(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function filterSummary(filter: JobSystemFilterRow) {
  const dimensions = [filter.length, filter.width, filter.height].map(formatDimension).join(" x ");
  const changed = `Changed ${formatDateChanged(filter.date_changed)}`;
  return [filter.label, dimensions, changed].filter(Boolean).join(" \u00b7 ");
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
    >
      {pending ? "Removing..." : "Remove"}
    </button>
  );
}

function FilterFields({
  filter,
  prefix,
}: {
  filter?: JobSystemFilterRow;
  prefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`${prefix}-label`}>
          Filter location
        </label>
        <input
          id={`${prefix}-label`}
          name="label"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter?.label ?? ""}
          placeholder="Hall return"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`${prefix}-length`}>
          Length
        </label>
        <input
          id={`${prefix}-length`}
          name="length"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter?.length ?? ""}
          placeholder="20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`${prefix}-width`}>
          Width
        </label>
        <input
          id={`${prefix}-width`}
          name="width"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter?.width ?? ""}
          placeholder="25"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`${prefix}-height`}>
          Height
        </label>
        <input
          id={`${prefix}-height`}
          name="height"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter?.height ?? ""}
          placeholder="1"
        />
      </div>

      <div className="sm:col-span-3">
        <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`${prefix}-date`}>
          Date changed
        </label>
        <input
          id={`${prefix}-date`}
          name="date_changed"
          type="date"
          required
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter?.date_changed ?? todayYmd()}
        />
      </div>

      <div className="sm:col-span-3">
        <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`${prefix}-notes`}>
          Notes
        </label>
        <textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter?.notes ?? ""}
          placeholder="Optional notes"
        />
      </div>
    </div>
  );
}

export default function SystemFiltersCard({
  jobId,
  system,
  filters,
}: {
  jobId: string;
  system: SystemRow;
  filters: JobSystemFilterRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const activeFilters = useMemo(() => filters.filter((filter) => !filter.archived_at), [filters]);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-950">System Filters</div>
            <div className="mt-0.5 text-xs text-gray-600">
              Filters for {system.name || "this system"}.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAdding((value) => !value);
              setEditingFilterId(null);
            }}
            className="inline-flex w-fit items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Add Filter to System
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {activeFilters.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            No filters recorded for this system yet.
          </div>
        ) : (
          <div className="space-y-2">
            {activeFilters.map((filter) => {
              const editing = editingFilterId === filter.id;
              return (
                <div key={filter.id} className="rounded-md border border-gray-200 bg-gray-50/70 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{filterSummary(filter)}</div>
                      {filter.notes ? <div className="mt-1 text-xs text-gray-600">{filter.notes}</div> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFilterId(editing ? null : filter.id);
                          setAdding(false);
                        }}
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <form action={archiveSystemFilterFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="filter_id" value={filter.id} />
                        <RemoveButton />
                      </form>
                    </div>
                  </div>

                  {editing ? (
                    <form action={updateSystemFilterFromForm} className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="filter_id" value={filter.id} />
                      <FilterFields filter={filter} prefix={`filter-${filter.id}`} />
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton
                          loadingText="Saving..."
                          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          Save Filter
                        </SubmitButton>
                        <button
                          type="button"
                          onClick={() => setEditingFilterId(null)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {adding ? (
          <form action={addSystemFilterFromForm} className="rounded-md border border-blue-200 bg-blue-50/60 p-3">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="system_id" value={system.id} />
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-800">Dimensions</div>
            <FilterFields prefix={`filter-new-${system.id}`} />
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton
                loadingText="Adding..."
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Add Filter to System
              </SubmitButton>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
