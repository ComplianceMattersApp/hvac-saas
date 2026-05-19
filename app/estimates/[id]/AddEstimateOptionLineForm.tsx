// app/estimates/[id]/AddEstimateOptionLineForm.tsx
// Compliance Matters: Draft-only manual option line item entry form.
// Pricebook-backed option lines are intentionally deferred.

import { addEstimateOptionLineItemFromForm } from "./actions";

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

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
}: {
  estimateId: string;
  estimateOptionId: string;
}) {
  async function submitAddOptionLine(formData: FormData) {
    "use server";
    await addEstimateOptionLineItemFromForm(formData);
  }

  return (
    <form
      action={submitAddOptionLine}
      className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 print:hidden"
    >
      <input type="hidden" name="estimate_id" value={estimateId} />
      <input type="hidden" name="estimate_option_id" value={estimateOptionId} />

      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
        Add Option Line
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={`option_item_name_${estimateOptionId}`}>
            Item Name <span className="text-red-500">*</span>
          </label>
          <input
            id={`option_item_name_${estimateOptionId}`}
            name="item_name"
            type="text"
            required
            placeholder="e.g. Repair Labor"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_item_type_${estimateOptionId}`}>
            Type <span className="text-red-500">*</span>
          </label>
          <select
            id={`option_item_type_${estimateOptionId}`}
            name="item_type"
            required
            defaultValue="service"
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
            name="quantity"
            type="number"
            required
            min="0.01"
            step="0.01"
            defaultValue="1"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_unit_price_${estimateOptionId}`}>
            Unit Price ($) <span className="text-red-500">*</span>
          </label>
          <input
            id={`option_unit_price_${estimateOptionId}`}
            name="unit_price"
            type="number"
            required
            min="0"
            step="0.01"
            defaultValue="0"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_category_${estimateOptionId}`}>
            Category
          </label>
          <input
            id={`option_category_${estimateOptionId}`}
            name="category"
            type="text"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={`option_unit_label_${estimateOptionId}`}>
            Unit Label
          </label>
          <input
            id={`option_unit_label_${estimateOptionId}`}
            name="unit_label"
            type="text"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={`option_description_${estimateOptionId}`}>
            Description
          </label>
          <textarea
            id={`option_description_${estimateOptionId}`}
            name="description"
            rows={2}
            placeholder="Optional estimate line detail or work instruction..."
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          Add Option Line
        </button>
      </div>
    </form>
  );
}
