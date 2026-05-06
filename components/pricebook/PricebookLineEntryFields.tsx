"use client";

import type { ReactNode } from "react";

export type PricebookEntryItem = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
};

type PricebookLineEntryFieldsProps = {
  items: PricebookEntryItem[];
  selectedItemId: string;
  onSelectedItemIdChange: (itemId: string) => void;
  itemFieldName: string;
  quantityFieldName: string;
  itemLabel: string;
  quantityLabel: string;
  itemSelectId: string;
  quantityInputId: string;
  labelClassName: string;
  inputClassName: string;
  quantityDefaultValue: string;
  includeEmptyOption?: boolean;
  emptyOptionLabel?: string;
  optionLabel?: (item: PricebookEntryItem) => string;
  gridClassName?: string;
  actionSlot?: ReactNode;
  actionSlotClassName?: string;
  quantityInputType?: "text" | "number";
  quantityStep?: string;
  quantityMin?: string;
  renderSelectedItem?: (item: PricebookEntryItem) => ReactNode;
};

export default function PricebookLineEntryFields({
  items,
  selectedItemId,
  onSelectedItemIdChange,
  itemFieldName,
  quantityFieldName,
  itemLabel,
  quantityLabel,
  itemSelectId,
  quantityInputId,
  labelClassName,
  inputClassName,
  quantityDefaultValue,
  includeEmptyOption = false,
  emptyOptionLabel = "Select an item...",
  optionLabel,
  gridClassName = "grid gap-3 sm:grid-cols-2",
  actionSlot,
  actionSlotClassName,
  quantityInputType = "text",
  quantityStep,
  quantityMin,
  renderSelectedItem,
}: PricebookLineEntryFieldsProps) {
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  return (
    <>
      <div className={gridClassName}>
        <div>
          <label htmlFor={itemSelectId} className={labelClassName}>
            {itemLabel}
          </label>
          <select
            id={itemSelectId}
            name={itemFieldName}
            value={selectedItemId}
            onChange={(event) => onSelectedItemIdChange(event.target.value)}
            required
            className={inputClassName}
          >
            {includeEmptyOption ? <option value="">{emptyOptionLabel}</option> : null}
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {optionLabel ? optionLabel(item) : item.item_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={quantityInputId} className={labelClassName}>
            {quantityLabel}
          </label>
          <input
            id={quantityInputId}
            name={quantityFieldName}
            type={quantityInputType}
            inputMode="decimal"
            step={quantityStep}
            min={quantityMin}
            defaultValue={quantityDefaultValue}
            required
            className={inputClassName}
          />
        </div>

        {actionSlot ? <div className={actionSlotClassName}>{actionSlot}</div> : null}
      </div>

      {selectedItem && renderSelectedItem ? renderSelectedItem(selectedItem) : null}
    </>
  );
}
