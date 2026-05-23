"use client";

// app/estimates/[id]/AddEstimateOptionLineForm.tsx
// Compliance Matters: Draft-only option line form with manual + simple pricebook picker paths.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
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
  pricebookItems: PricebookPickerItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
      unitPriceDollars: Number(selected.default_unit_price ?? 0).toFixed(2),
      description: selected.default_description ?? "",
      category: selected.category ?? "",
      unitLabel: selected.unit_label ?? "",
    }));
    setSearchValue(selected.item_name);
  }, [selectedPricebookId, pricebookItems]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredPricebookItems =
    normalizedSearch.length === 0
      ? pricebookItems.slice(0, 6)
      : pricebookItems
          .filter((item) => {
            const haystack = [
              item.item_name,
              item.default_description ?? "",
              item.item_type,
              item.category ?? "",
              item.unit_label ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(normalizedSearch);
          })
          .slice(0, 6);

  const selectedPricebookItem = selectedPricebookId
    ? pricebookItems.find((item) => item.id === selectedPricebookId) ?? null
    : null;

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
        <p className="mt-0.5 text-xs text-slate-600">Search Pricebook or enter a manual item.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor={`option_search_pricebook_${estimateOptionId}`}>
          Search Pricebook or type item
        </label>
        <input
          ref={searchInputRef}
          id={`option_search_pricebook_${estimateOptionId}`}
          type="text"
          value={searchValue}
          placeholder={
            pricebookItems.length > 0
              ? "Search Pricebook or type a manual estimate line"
              : "Type a manual estimate line"
          }
          onChange={(event) => {
            const nextValue = event.target.value;
            setSearchValue(nextValue);
            if (selectedPricebookId) {
              setSelectedPricebookId("");
            }
            setDraft((prev) => ({
              ...prev,
              itemName: nextValue,
            }));
          }}
          className={inputClass}
        />

        {pricebookItems.length > 0 && normalizedSearch.length > 0 && !selectedPricebookId && (
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5">
            {filteredPricebookItems.length > 0 ? (
              filteredPricebookItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedPricebookId(item.id);
                    setError(null);
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{item.item_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {item.category || "Uncategorized"}
                      {item.item_type ? ` - ${item.item_type}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-600">
                    ${(Number(item.default_unit_price ?? 0)).toFixed(2)}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2.5 py-2 text-xs text-slate-500">No Pricebook matches. This line will be treated as manual.</p>
            )}
          </div>
        )}
      </div>

      {selectedPricebookItem && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span>
            Using Pricebook defaults from <strong>{selectedPricebookItem.item_name}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedPricebookId("");
              setError(null);
              searchInputRef.current?.focus();
            }}
            className="rounded-md border border-emerald-200 bg-white px-2 py-1 font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            Clear
          </button>
        </div>
      )}

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
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {isPending ? "Adding..." : "Add Item"}
        </button>
      </div>
    </form>
  );
}
