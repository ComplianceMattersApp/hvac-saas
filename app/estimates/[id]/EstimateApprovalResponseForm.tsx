"use client";

// app/estimates/[id]/EstimateApprovalResponseForm.tsx
// Compliance Matters: Internal-only approval response form for sent estimates.
// For flat estimates: simple confirm + approve button.
// For multi-option proposals: option selector (required) + optional note.
// Does NOT send email, create a job, invoice, payment, or conversion record.

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

type OptionChoice = {
  id: string;
  label: string;
  total_cents: number;
};

type EstimateApprovalResponseFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  estimateId: string;
  proposalMode: "single_option_flat" | "multi_option_packages";
  options: OptionChoice[];
};

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

export default function EstimateApprovalResponseForm({
  action,
  estimateId,
  proposalMode,
  options,
}: EstimateApprovalResponseFormProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [responseNote, setResponseNote] = useState<string>("");

  const isMultiOption = proposalMode === "multi_option_packages";
  const isReadyToSubmit = !isMultiOption || selectedOptionId !== "";

  const selectedOption = options.find((o) => o.id === selectedOptionId) ?? null;

  const confirmMessage = isMultiOption
    ? selectedOption
      ? `Record approval for option "${selectedOption.label}" (${formatCents(selectedOption.total_cents)})? This records approval only and does not create a job or draft invoice.`
      : "Record approval for this estimate?"
    : "Record approval for this estimate? This records approval only and does not create a job or draft invoice.";

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (isMultiOption && !selectedOptionId) {
          event.preventDefault();
          return;
        }
        if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className="space-y-3 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3"
    >
      <input type="hidden" name="estimate_id" value={estimateId} />

      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Approval</p>
          <p className="mt-0.5 text-xs text-slate-600">Record approval for this estimate.</p>
        </div>
      </div>

      {isMultiOption && (
        <div className="space-y-1.5">
          <label
            htmlFor={`approval-option-${estimateId}`}
            className="block text-xs font-semibold text-slate-700"
          >
            Select option <span className="text-rose-500">*</span>
          </label>
          <select
            id={`approval-option-${estimateId}`}
            name="selected_option_id"
            value={selectedOptionId}
            onChange={(e) => setSelectedOptionId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">— Choose an option —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} · {formatCents(o.total_cents)}
              </option>
            ))}
          </select>
          {selectedOption && (
            <p className="text-xs text-slate-500">
              Approval amount: <span className="font-semibold text-slate-700">{formatCents(selectedOption.total_cents)}</span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor={`approval-note-${estimateId}`}
          className="block text-xs font-semibold text-slate-700"
        >
          Note{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id={`approval-note-${estimateId}`}
          name="response_note"
          value={responseNote}
          onChange={(e) => setResponseNote(e.target.value)}
          placeholder="Optional note about this approval…"
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="submit"
          disabled={!isReadyToSubmit}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-[background-color,border-color,transform] hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          {isMultiOption ? "Select Option" : "Record Approval"}
        </button>
        <p className="max-w-64 text-[11px] leading-4 text-slate-500">
          {isMultiOption
            ? "Records selected option and approval only. No job or draft invoice is created."
            : "Records approval only. No job or draft invoice is created."}
        </p>
      </div>
    </form>
  );
}
