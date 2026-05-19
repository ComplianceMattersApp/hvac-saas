"use client";

// app/estimates/[id]/AddEstimateOptionLineForm.tsx
// Compliance Matters: Draft-only option line form with manual + simple pricebook picker paths.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEstimateOptionLineItemFromForm } from "./actions";

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

type PricebookPickerItem = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
};

const ITEM_TYPES = [
  { value: "service", label: "Service" },
  { value: "material", label: "Material" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
] as const;

export default function AddEstimateOptionLineForm({
  estimateId,
  estimateOptionId,
  pricebookItems,
}: {
  estimateId: string;
  estimateOptionId: string;
  pricebookItems: PricebookPickerItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedPricebookId, setSelectedPricebookId] = useState("");
  const [draft, setDraft] = useState({
    itemName: "",
    itemType: "service",
    quantity: "1.00",
    unitPriceDollars: "0.00",
    description: "",
    category: "",
    unitLabel: "",
  });

  useEffect(() => {
    if (!selectedPricebookId) {
      return;
    }

    const selected = pricebookItems.find((item) => item.id === selectedPricebookId);
    if (!selected) return;

    setDraft((prev) => ({
      ...prev,
      itemName: selected.item_name,
      itemType: selected.item_type || "service",
      unitPriceDollars: Number(selected.default_unit_price ?? 0).toFixed(2),
      description: selected.default_description ?? "",
      category: selected.category ?? "",
      unitLabel: selected.unit_label ?? "",
    }));
  }, [selectedPricebookId, pricebookItems]);

  function resetDraftState() {
    setSelectedPricebookId("");
    setDraft({
      itemName: "",
      itemType: "service",
      quantity: "1.00",
      unitPriceDollars: "0.00",
      description: "",
      category: "",
      unitLabel: "",
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const sourcePricebookItemId = selectedPricebookId || null;
    const itemName = draft.itemName.trim();
    const itemType = draft.itemType.trim();
    const quantity = Number.parseFloat(draft.quantity);
    const unitPriceDollars = Number.parseFloat(draft.unitPriceDollars);
    const unitPriceCents = Math.round(unitPriceDollars * 100);

    if (!sourcePricebookItemId && !itemName) {
      setError("Item name is required for manual option lines.");
      return;
    }
    if (!sourcePricebookItemId && !itemType) {
      setError("Type is required for manual option lines.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
      setError("Unit price must be 0 or greater.");
      return;
    }

    const fd = new FormData();
    fd.set("estimate_id", estimateId);
    fd.set("estimate_option_id", estimateOptionId);
    if (sourcePricebookItemId) {
      fd.set("source_pricebook_item_id", sourcePricebookItemId);
    }
    fd.set("item_name", itemName);
    fd.set("item_type", itemType);
    fd.set("quantity", String(quantity));
    fd.set("unit_price", unitPriceDollars.toFixed(2));
    fd.set("description", draft.description.trim());
    fd.set("category", draft.category.trim());
    fd.set("unit_label", draft.unitLabel.trim());

    setError(null);
    startTransition(async () => {
      const result = await addEstimateOptionLineItemFromForm(fd);
      if (result.success) {
        formRef.current?.reset();
        resetDraftState();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 print:hidden"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
        Add Option Line
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
        <label className={labelClass} htmlFor={`option_source_pricebook_${estimateOptionId}`}>
          Pricebook Item (Optional)
        </label>
        <select
          id={`option_source_pricebook_${estimateOptionId}`}
          value={selectedPricebookId}
          onChange={(event) => {
            setSelectedPricebookId(event.target.value);
            setError(null);
          }}
          className={inputClass}
        >
          <option value="">Manual line (no Pricebook source)</option>
          {pricebookItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.item_name} {item.category ? `- ${item.category}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-emerald-900/80">
          Selecting a Pricebook item pre-fills editable defaults and preserves source provenance.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={`option_item_name_${estimateOptionId}`}>
            Item Name {!selectedPricebookId && <span className="text-red-500">*</span>}
          </label>
          <input
            id={`option_item_name_${estimateOptionId}`}
            type="text"
            placeholder="e.g. Repair Labor"
            value={draft.itemName}
            onChange={(event) => setDraft((prev) => ({ ...prev, itemName: event.target.value }))}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_item_type_${estimateOptionId}`}>
            Type {!selectedPricebookId && <span className="text-red-500">*</span>}
          </label>
          <select
            id={`option_item_type_${estimateOptionId}`}
            value={draft.itemType}
            onChange={(event) => setDraft((prev) => ({ ...prev, itemType: event.target.value }))}
            className={inputClass}
          >
            {ITEM_TYPES.map((itemType) => (
              <option key={itemType.value} value={itemType.value}>
                {itemType.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_quantity_${estimateOptionId}`}>
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            id={`option_quantity_${estimateOptionId}`}
            type="number"
            min="0.01"
            step="0.01"
            value={draft.quantity}
            onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_unit_price_${estimateOptionId}`}>
            Unit Price ($) <span className="text-red-500">*</span>
          </label>
          <input
            id={`option_unit_price_${estimateOptionId}`}
            type="number"
            min="0"
            step="0.01"
            value={draft.unitPriceDollars}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, unitPriceDollars: event.target.value }))
            }
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_category_${estimateOptionId}`}>
            Category
          </label>
          <input
            id={`option_category_${estimateOptionId}`}
            type="text"
            value={draft.category}
            onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_unit_label_${estimateOptionId}`}>
            Unit Label
          </label>
          <input
            id={`option_unit_label_${estimateOptionId}`}
            type="text"
            value={draft.unitLabel}
            onChange={(event) => setDraft((prev) => ({ ...prev, unitLabel: event.target.value }))}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={`option_description_${estimateOptionId}`}>
            Description
          </label>
          <textarea
            id={`option_description_${estimateOptionId}`}
            rows={2}
            placeholder="Optional estimate line detail or work instruction..."
            value={draft.description}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, description: event.target.value }))
            }
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            resetDraftState();
          }}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add Option Line"}
        </button>
      </div>
    </form>
  );
}
