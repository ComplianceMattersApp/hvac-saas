"use client";

// app/estimates/[id]/AddEstimateOptionLineForm.tsx
// Compliance Matters: Draft-only option line form with manual + simple pricebook picker paths.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEstimateOptionLineItemFromForm } from "./actions";
import EstimatePricebookSearchPicker from "./EstimatePricebookSearchPicker";
import {
  applySearchValueToDraft,
  formatPricebookDollars,
  type EstimatePricebookPickerItem,
} from "@/lib/estimates/estimate-pricebook-picker-model";

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

const ITEM_TYPES = [
  { value: "service", label: "Service" },
  { value: "install", label: "Install" },
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
  pricebookItems: EstimatePricebookPickerItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
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
      unitPriceDollars: formatPricebookDollars(selected.default_unit_price),
      description: selected.default_description ?? "",
      category: selected.category ?? "",
      unitLabel: selected.unit_label ?? "",
    }));
    setSearchValue(selected.item_name);
  }, [selectedPricebookId, pricebookItems]);

  function resetDraftState() {
    setSearchValue("");
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

  function applySelectedPricebookItem(item: EstimatePricebookPickerItem) {
    setSelectedPricebookId(item.id);
    setSearchValue(item.item_name);
    setError(null);
    setDraft((prev) => ({
      ...prev,
      itemName: item.item_name,
      itemType: item.item_type || "service",
      unitPriceDollars: formatPricebookDollars(item.default_unit_price),
      description: item.default_description ?? "",
      category: item.category ?? "",
      unitLabel: item.unit_label ?? "",
    }));
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
      className="mt-3 space-y-3 rounded-2xl border border-slate-200/85 bg-white p-3 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.28)] print:hidden sm:p-4"
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">Add Item</div>
        <p className="mt-0.5 text-xs text-slate-600">Search to use Pricebook defaults, or keep typing to enter a manual item.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <EstimatePricebookSearchPicker
        items={pricebookItems}
        searchValue={searchValue}
        selectedItemId={selectedPricebookId}
        inputId={`option_search_pricebook_${estimateOptionId}`}
        labelClassName={labelClass}
        inputClassName={inputClass}
        onSearchValueChange={(nextValue) => {
          setSearchValue(nextValue);
          setDraft((prev) =>
            applySearchValueToDraft(prev, nextValue, Boolean(selectedPricebookId))
          );
          if (selectedPricebookId) {
            setSelectedPricebookId("");
          }
        }}
        onSelectItem={applySelectedPricebookItem}
        onClearSelection={() => {
          setSelectedPricebookId("");
          setError(null);
          setDraft((prev) => ({
            ...prev,
            category: "",
            unitLabel: "",
          }));
        }}
      />

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
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add Item"}
        </button>
      </div>
    </form>
  );
}
