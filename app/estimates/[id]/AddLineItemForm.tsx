"use client";

// app/estimates/[id]/AddLineItemForm.tsx
// Compliance Matters: Client component for adding a manual line item to a draft estimate.
// Calls addLineItemAction server action; refreshes RSC on success via router.refresh().

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addLineItemAction } from "./actions";

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

export default function AddLineItemForm({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const itemName = String(fd.get("item_name") ?? "").trim();
    const itemType = String(fd.get("item_type") ?? "service").trim();
    const quantityStr = String(fd.get("quantity") ?? "1");
    const unitPriceStr = String(fd.get("unit_price_dollars") ?? "0");
    const description = String(fd.get("description") ?? "").trim() || null;

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

    setError(null);
    startTransition(async () => {
      const result = await addLineItemAction({
        estimateId,
        itemName,
        itemType,
        quantity,
        unitPriceCents,
        description,
      });
      if (result.success) {
        formRef.current?.reset();
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
            formRef.current?.reset();
          }}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
        >
          Cancel
        </button>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Item Name */}
          <div className="sm:col-span-2">
            <label htmlFor="add_item_name" className={labelClass}>
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              id="add_item_name"
              name="item_name"
              type="text"
              required
              placeholder="e.g. Diagnostic Visit"
              className={inputClass}
            />
          </div>

          {/* Item Type */}
          <div>
            <label htmlFor="add_item_type" className={labelClass}>
              Type
            </label>
            <select
              id="add_item_type"
              name="item_type"
              defaultValue="service"
              className={inputClass}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
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
              defaultValue="1"
              required
              className={inputClass}
            />
          </div>

          {/* Unit Price */}
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
              defaultValue="0.00"
              required
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <label htmlFor="add_description" className={labelClass}>
              Description
            </label>
            <textarea
              id="add_description"
              name="description"
              rows={2}
              placeholder="Optional scope detail or work instruction…"
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.55)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Adding…" : "Add Line Item"}
          </button>
        </div>
      </form>
    </div>
  );
}
