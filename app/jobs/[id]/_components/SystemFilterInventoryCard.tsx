"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import SubmitButton from "@/components/SubmitButton";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  archiveSystemFilterFromForm,
  updateSystemFilterFromForm,
} from "@/lib/actions/job-actions";
import type { JobSystemFilterRow } from "@/lib/customers/system-filters-read-model";

function formatDimension(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, "");
}

function formatDateChanged(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function filterDimensions(filter: JobSystemFilterRow) {
  return [filter.length, filter.width, filter.height].map(formatDimension).join(" x ");
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 transition-colors hover:bg-rose-100 disabled:opacity-60"
    >
      {pending ? "Removing..." : "Remove"}
    </button>
  );
}

function FilterFields({ filter }: { filter: JobSystemFilterRow }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`filter-label-${filter.id}`}>
          Filter location
        </label>
        <input
          id={`filter-label-${filter.id}`}
          name="label"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter.label ?? ""}
          placeholder="Hall return"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`filter-length-${filter.id}`}>
          Length
        </label>
        <input
          id={`filter-length-${filter.id}`}
          name="length"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter.length}
          placeholder="20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`filter-width-${filter.id}`}>
          Width
        </label>
        <input
          id={`filter-width-${filter.id}`}
          name="width"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter.width}
          placeholder="25"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`filter-height-${filter.id}`}>
          Depth
        </label>
        <input
          id={`filter-height-${filter.id}`}
          name="height"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter.height}
          placeholder="1"
        />
      </div>

      <div className="sm:col-span-3">
        <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`filter-date-${filter.id}`}>
          Date changed
        </label>
        <input
          id={`filter-date-${filter.id}`}
          name="date_changed"
          type="date"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter.date_changed}
        />
      </div>

      <div className="sm:col-span-3">
        <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`filter-notes-${filter.id}`}>
          Notes
        </label>
        <textarea
          id={`filter-notes-${filter.id}`}
          name="notes"
          rows={2}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          defaultValue={filter.notes ?? ""}
          placeholder="Optional notes"
        />
      </div>
    </div>
  );
}

export default function SystemFilterInventoryCard({
  filter,
  jobId,
}: {
  filter: JobSystemFilterRow;
  jobId: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="px-5 py-4 transition-colors hover:bg-slate-50/50 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-sm font-semibold text-navy">Filter</div>
              {filter.label ? <div className="mt-0.5 text-xs text-slate-500">{filter.label}</div> : null}
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <div>Dimensions: {filterDimensions(filter)}</div>
              <div>Changed: {formatDateChanged(filter.date_changed)}</div>
            </div>

            {filter.notes ? <div className="text-xs italic text-slate-600">"{filter.notes}"</div> : null}
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              Edit
            </button>
          </div>
        </div>

        <Disclosure title="Danger zone" variant="danger" className="mt-3">
          <form action={archiveSystemFilterFromForm}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="filter_id" value={filter.id} />
            <RemoveButton />
          </form>
        </Disclosure>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)] sm:p-5">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <SectionEyebrow>Equipment</SectionEyebrow>
          <div className="text-base font-semibold text-navy">Edit Filter</div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <form action={updateSystemFilterFromForm} className="space-y-4">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="filter_id" value={filter.id} />
        <FilterFields filter={filter} />

        <div className="pt-2">
          <SubmitButton
            loadingText="Saving..."
            className="w-fit rounded-[10px] bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Save Filter
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
