"use client";

// app/estimates/[id]/AddLineItemForm.tsx
// Compliance Matters: Client component for adding a manual line item to a draft estimate.
// Calls addLineItemAction server action; refreshes RSC on success via router.refresh().

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addLineItemAction } from "./actions";
import type { PricebookEntryItem } from "@/components/pricebook/PricebookLineEntryFields";

const ITEM_TYPES = [
  { value: "service", label: "Service" },
  { value: "material", label: "Material" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
] as const;

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

type PricebookPickerItem = PricebookEntryItem;

export default function AddLineItemForm({
  estimateId,
  pricebookItems,
}: {
  estimateId: string;
  pricebookItems: PricebookPickerItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [selectedPricebookId, setSelectedPricebookId] = useState("");
  const [pricebookDraft, setPricebookDraft] = useState({
    itemName: "",
    description: "",
    itemType: "service",
    category: "",
    unitLabel: "",
    quantity: "1.00",
    unitPriceDollars: "0.00",
  });

  useEffect(() => {
    if (!selectedPricebookId) {
      return;
    }

    const selected = pricebookItems.find((item) => item.id === selectedPricebookId);
    if (!selected) return;

    setPricebookDraft({
      itemName: selected.item_name,
      description: selected.default_description ?? "",
      itemType: selected.item_type || "service",
      category: selected.category ?? "",
      unitLabel: selected.unit_label ?? "",
      quantity: "1.00",
      unitPriceDollars: Number(selected.default_unit_price ?? 0).toFixed(2),
    });
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
    setPricebookDraft({
      itemName: "",
      description: "",
      itemType: "service",
      category: "",
      unitLabel: "",
      quantity: "1.00",
      unitPriceDollars: "0.00",
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const itemName = pricebookDraft.itemName.trim();
    const itemType = pricebookDraft.itemType.trim();
    const quantityStr = pricebookDraft.quantity;
    const unitPriceStr = pricebookDraft.unitPriceDollars;
    const description = pricebookDraft.description.trim() || null;
    const category = pricebookDraft.category.trim() || null;
    const unitLabel = pricebookDraft.unitLabel.trim() || null;

    const quantity = parseFloat(quantityStr);
    const unitPriceCents = Math.round(parseFloat(unitPriceStr) * 100);

    if (!itemName) {
      setError("Item name is required.");
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

    const sourcePricebookItemId = selectedPricebookId || undefined;
    if (sourcePricebookItemId) {
      const item = pricebookItems.find((entry) => entry.id === sourcePricebookItemId);
      if (!item) {
        setError("Selected Pricebook item is unavailable.");
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const result = await addLineItemAction({
        estimateId,
        sourcePricebookItemId,
        itemName,
        itemType,
        quantity,
        unitPriceCents,
        description,
        category,
        unitLabel,
      });
      if (result.success) {
        formRef.current?.reset();
        resetDraftState();
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-[background-color,border-color,transform] hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
      >
        + Add Line Item
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
          Add Line Item
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            resetDraftState();
          }}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-blue-200 bg-white p-3.5">
          <div>
            <label htmlFor="estimate_line_search" className={labelClass}>
              Search or type line item
            </label>
            <input
              ref={searchInputRef}
              id="estimate_line_search"
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
                setPricebookDraft((prev) => ({
                  ...prev,
                  itemName: nextValue,
                }));
              }}
              className={inputClass}
            />
          </div>

          {pricebookItems.length > 0 && (
            <div>
              <label htmlFor="estimate_source_pricebook" className={labelClass}>
                Matching Pricebook item (optional)
              </label>
              <select
                id="estimate_source_pricebook"
                value={selectedPricebookId}
                onChange={(event) => {
                  setSelectedPricebookId(event.target.value);
                  setError(null);
                }}
                className={inputClass}
              >
                <option value="">Manual line (no Pricebook source)</option>
                {filteredPricebookItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.item_name} {item.category ? `- ${item.category}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="add_item_name" className={labelClass}>
                Item Name <span className="text-red-500">*</span>
              </label>
              <input
                id="add_item_name"
                name="item_name"
                type="text"
                required
                placeholder="e.g. Diagnostic"
                value={pricebookDraft.itemName}
                onChange={(event) =>
                  setPricebookDraft((prev) => ({ ...prev, itemName: event.target.value }))
                }
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="add_item_type" className={labelClass}>
                Type
              </label>
              <select
                id="add_item_type"
                name="item_type"
                value={pricebookDraft.itemType}
                onChange={(event) =>
                  setPricebookDraft((prev) => ({ ...prev, itemType: event.target.value }))
                }
                className={inputClass}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="add_quantity" className={labelClass}>
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                id="add_quantity"
                name="quantity"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={pricebookDraft.quantity}
                onChange={(event) =>
                  setPricebookDraft((prev) => ({ ...prev, quantity: event.target.value }))
                }
                required
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="add_unit_price" className={labelClass}>
                Unit Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                id="add_unit_price"
                name="unit_price_dollars"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={pricebookDraft.unitPriceDollars}
                onChange={(event) =>
                  setPricebookDraft((prev) => ({ ...prev, unitPriceDollars: event.target.value }))
                }
                required
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="add_description" className={labelClass}>
                Description
              </label>
              <textarea
                id="add_description"
                name="description"
                rows={2}
                placeholder="Optional estimate line detail or work instruction..."
                value={pricebookDraft.description}
                onChange={(event) =>
                  setPricebookDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.55)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Adding…" : "Add Line"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
