"use client";

import { useMemo } from "react";
import {
  filterEstimatePricebookItems,
  formatPricebookDollars,
  type EstimatePricebookPickerItem,
} from "@/lib/estimates/estimate-pricebook-picker-model";

type EstimatePricebookSearchPickerProps = {
  items: EstimatePricebookPickerItem[];
  searchValue: string;
  selectedItemId: string;
  inputId: string;
  labelClassName: string;
  inputClassName: string;
  onSearchValueChange: (value: string) => void;
  onSelectItem: (item: EstimatePricebookPickerItem) => void;
  onClearSelection: () => void;
};

export default function EstimatePricebookSearchPicker({
  items,
  searchValue,
  selectedItemId,
  inputId,
  labelClassName,
  inputClassName,
  onSearchValueChange,
  onSelectItem,
  onClearSelection,
}: EstimatePricebookSearchPickerProps) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  const filteredPricebookItems = useMemo(
    () => filterEstimatePricebookItems(items, searchValue),
    [items, searchValue]
  );

  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) ?? null
    : null;

  return (
    <div>
      <label htmlFor={inputId} className={labelClassName}>
        Search Pricebook or type custom item
      </label>
      <input
        id={inputId}
        type="text"
        value={searchValue}
        placeholder={
          items.length > 0
            ? "Search Pricebook or type a custom estimate line"
            : "Type a custom estimate line"
        }
        onChange={(event) => onSearchValueChange(event.target.value)}
        className={inputClassName}
      />

      {items.length > 0 && normalizedSearch.length > 0 && !selectedItem && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5">
          {filteredPricebookItems.length > 0 ? (
            filteredPricebookItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                className="flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {item.item_name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {item.item_type || "other"}
                    {item.category ? ` - ${item.category}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-slate-600">
                  ${formatPricebookDollars(item.default_unit_price)}
                </span>
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-xs text-slate-500">
              No Pricebook matches. Keep typing to add this as a custom line.
            </p>
          )}
        </div>
      )}

      {selectedItem && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">
                Based on Pricebook item: {selectedItem.item_name}
              </p>
              <p className="mt-0.5 text-emerald-800">
                {selectedItem.item_type || "other"}
                {selectedItem.category ? ` - ${selectedItem.category}` : ""}
                {` - $${formatPricebookDollars(selectedItem.default_unit_price)}`}
              </p>
              {selectedItem.default_description ? (
                <p className="mt-1 line-clamp-2 text-emerald-800">
                  {selectedItem.default_description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              className="shrink-0 rounded-md border border-emerald-200 bg-white px-2 py-1 font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
