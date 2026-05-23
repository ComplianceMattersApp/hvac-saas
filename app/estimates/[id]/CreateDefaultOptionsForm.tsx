"use client";

// app/estimates/[id]/CreateDefaultOptionsForm.tsx
// Internal-only form to trigger creation of default option packages.
// Shows CTA only for eligible draft estimates (no lines, no existing options).

import { createDefaultEstimateOptionsFromForm } from "./actions";

interface CreateDefaultOptionsFormProps {
  estimateId: string;
  isDraft: boolean;
  isMultiOptionProposal: boolean;
  hasFlatLines: boolean;
  optionsUnavailable?: boolean;
}

export default function CreateDefaultOptionsForm({
  estimateId,
  isDraft,
  isMultiOptionProposal,
  hasFlatLines,
  optionsUnavailable,
}: CreateDefaultOptionsFormProps) {
  // Don't show if not draft
  if (!isDraft) {
    return null;
  }

  // Don't show if already multi-option
  if (isMultiOptionProposal) {
    return null;
  }

  const isEligible = !hasFlatLines && !optionsUnavailable;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)] print:hidden">
      {isEligible ? (
        <>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-950">Options</h2>
            <p className="mt-1 text-sm text-slate-600">
              Convert this single estimate into three options: Good, Better, and Best.
            </p>
          </div>

          <form action={createDefaultEstimateOptionsFromForm} className="flex gap-2">
            <input type="hidden" name="estimate_id" value={estimateId} />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-[background-color,border-color,transform] hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-[0.5px]"
            >
              Create Good / Better / Best Options
            </button>
          </form>
        </>
      ) : optionsUnavailable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
            Not Available
          </div>
          <p className="mt-1 text-sm text-amber-800">
            Option packages are not available in this environment.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-900">
            Options Blocked
          </div>
          <p className="mt-1 text-sm text-blue-800">
            This estimate already has single-estimate line items. Options cannot be created when those lines already exist. To use options, start a new estimate.
          </p>
        </div>
      )}
    </div>
  );
}
