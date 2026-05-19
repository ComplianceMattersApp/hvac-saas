"use client";

// app/estimates/[id]/EditEstimateOptionForm.tsx
// Internal draft-only option label + summary editor. Does not edit notes,
// option line items, sort order, slot identity, or totals.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEstimateOptionMetadataAction } from "./actions";

const LABEL_MAX_LENGTH = 100;
const SUMMARY_MAX_LENGTH = 750;

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

type EditEstimateOptionFormProps = {
  estimateId: string;
  estimateOptionId: string;
  label: string;
  summary: string | null;
};

export default function EditEstimateOptionForm({
  estimateId,
  estimateOptionId,
  label,
  summary,
}: EditEstimateOptionFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftSummary, setDraftSummary] = useState(summary ?? "");
  const [error, setError] = useState<string | null>(null);

  function resetDraft() {
    setDraftLabel(label);
    setDraftSummary(summary ?? "");
    setError(null);
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          resetDraft();
          setIsEditing(true);
        }}
        className="mt-3 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 print:hidden"
      >
        Edit Option
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-white p-3 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();

        const nextLabel = draftLabel.trim();
        const nextSummary = draftSummary.trim();

        if (!nextLabel) {
          setError("Option label is required.");
          return;
        }
        if (nextLabel.length > LABEL_MAX_LENGTH) {
          setError(`Option label must be ${LABEL_MAX_LENGTH} characters or fewer.`);
          return;
        }
        if (nextSummary.length > SUMMARY_MAX_LENGTH) {
          setError(`Option summary must be ${SUMMARY_MAX_LENGTH} characters or fewer.`);
          return;
        }

        setError(null);
        startTransition(async () => {
          const result = await updateEstimateOptionMetadataAction({
            estimateId,
            estimateOptionId,
            label: nextLabel,
            summary: nextSummary || null,
          });

          if (result.success) {
            setIsEditing(false);
            router.refresh();
          } else {
            setError(result.error);
          }
        });
      }}
    >
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div>
        <label htmlFor={`option_label_${estimateOptionId}`} className={labelClass}>
          Label
        </label>
        <input
          id={`option_label_${estimateOptionId}`}
          type="text"
          maxLength={LABEL_MAX_LENGTH}
          value={draftLabel}
          onChange={(event) => setDraftLabel(event.target.value)}
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor={`option_summary_${estimateOptionId}`} className={labelClass}>
          Summary
        </label>
        <textarea
          id={`option_summary_${estimateOptionId}`}
          rows={3}
          maxLength={SUMMARY_MAX_LENGTH}
          value={draftSummary}
          onChange={(event) => setDraftSummary(event.target.value)}
          className={inputClass}
          placeholder="Optional short summary for this option package..."
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            resetDraft();
            setIsEditing(false);
          }}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Option"}
        </button>
      </div>
    </form>
  );
}
