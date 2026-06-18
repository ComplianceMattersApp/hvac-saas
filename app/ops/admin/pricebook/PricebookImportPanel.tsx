"use client";

import { useActionState } from "react";
import {
  confirmPricebookImportFromForm,
  previewPricebookImportFromForm,
  type PricebookImportActionState,
} from "@/lib/actions/pricebook-actions";
import type { PricebookImportPreviewRow } from "@/lib/business/pricebook-import";

const INITIAL_IMPORT_STATE: PricebookImportActionState = { status: "idle" };

function PreviewTable({
  title,
  rows,
}: {
  title: string;
  rows: PricebookImportPreviewRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-white text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 12).map((row) => (
              <tr key={`${title}-${row.rowNumber}`}>
                <td className="px-3 py-2 text-slate-600">{row.rowNumber}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{row.serviceName || "-"}</td>
                <td className="px-3 py-2 text-slate-700">{row.kind || "-"}</td>
                <td className="px-3 py-2 text-slate-700">{row.unit || "-"}</td>
                <td className="px-3 py-2 text-slate-700">
                  {row.price === null ? "-" : `$${row.price.toFixed(2)}`}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {row.active === null ? "-" : row.active ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 text-slate-600">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 ? (
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          Showing 12 of {rows.length} rows.
        </p>
      ) : null}
    </div>
  );
}

export function PricebookImportPanel() {
  const [previewState, previewAction, previewPending] = useActionState<
    PricebookImportActionState,
    FormData
  >(previewPricebookImportFromForm, INITIAL_IMPORT_STATE);
  const [confirmState, confirmAction, confirmPending] = useActionState<
    PricebookImportActionState,
    FormData
  >(confirmPricebookImportFromForm, INITIAL_IMPORT_STATE);

  const preview = previewState.preview;
  const result = confirmState.result;

  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Import</p>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">
            Import services and add-ons
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Use this to add services, add-ons, labor, supplies, or fees to your Pricebook. This import does not create jobs, invoices, charges, payments, or checklist tasks.
          </p>
        </div>
        <a
          href="/ops/admin/pricebook/import-template"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50"
        >
          Download template
        </a>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-700 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p>Download the template, replace the example rows with your own services, then upload the file here.</p>
          <p className="mt-2">You can leave Price as 0 and edit prices later.</p>
          <p className="mt-2">
            Active = Yes means the item appears in normal selection lists. Active = No saves it for later without showing it in normal active lists.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <dl className="grid gap-2">
            <div><dt className="font-semibold text-slate-900">Service Name</dt><dd>The name your team will choose when adding work to a job.</dd></div>
            <div><dt className="font-semibold text-slate-900">Category</dt><dd>A simple group, like Cleaning, Labor, Supplies, Floor Care, or Add-on.</dd></div>
            <div><dt className="font-semibold text-slate-900">Kind</dt><dd>Service, Labor, Material, or Fee.</dd></div>
            <div><dt className="font-semibold text-slate-900">Unit</dt><dd>Job, Hour, Item, Room, or Sq Ft.</dd></div>
            <div><dt className="font-semibold text-slate-900">Description</dt><dd>Optional notes your team can see when using this item.</dd></div>
          </dl>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>Deep Cleaning is a Service counted by Job.</p>
        <p>Extra Labor Hour is Labor counted by Hour.</p>
        <p>After-Hours Service can be set to Active = No until you are ready to use it.</p>
      </div>

      <form action={previewAction} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Upload CSV</span>
          <input
            type="file"
            name="csv_file"
            accept=".csv,text/csv"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          />
        </label>
        <button
          type="submit"
          disabled={previewPending}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {previewPending ? "Previewing..." : "Preview import"}
        </button>
      </form>

      {previewState.message ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          previewState.status === "error"
            ? "border-red-200 bg-red-50 text-red-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}>
          {previewState.message}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">Ready to add</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-950">{preview.readyToAdd.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Already exists</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{preview.alreadyExists.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-800">Needs review</p>
              <p className="mt-1 text-2xl font-semibold text-amber-950">{preview.needsReview.length}</p>
            </div>
          </div>

          <PreviewTable title="Ready to add" rows={preview.readyToAdd} />
          <PreviewTable title="Already exists" rows={preview.alreadyExists} />
          <PreviewTable title="Needs review" rows={preview.needsReview} />

          {previewState.csvText && preview.readyToAdd.length > 0 ? (
            <form action={confirmAction}>
              <input type="hidden" name="csv_text" value={previewState.csvText} />
              <button
                type="submit"
                disabled={confirmPending}
                className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {confirmPending ? "Importing..." : `Import ${preview.readyToAdd.length} rows`}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {confirmState.message ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
          confirmState.status === "error"
            ? "border-red-200 bg-red-50 text-red-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}>
          {confirmState.message}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">Added</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-950">{result.added}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Skipped because they already exist</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{result.skippedExisting}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-800">Still needs review</p>
            <p className="mt-1 text-2xl font-semibold text-amber-950">{result.needsReview}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
