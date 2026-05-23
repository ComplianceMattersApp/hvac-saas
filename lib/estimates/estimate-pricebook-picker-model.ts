export type EstimatePricebookPickerItem = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
};

const DEFAULT_RESULT_LIMIT = 6;

export function filterEstimatePricebookItems(
  items: EstimatePricebookPickerItem[],
  searchValue: string,
  maxResults = DEFAULT_RESULT_LIMIT
): EstimatePricebookPickerItem[] {
  const normalizedSearch = String(searchValue ?? "").trim().toLowerCase();
  if (normalizedSearch.length === 0) {
    return items.slice(0, maxResults);
  }

  return items
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
    .slice(0, maxResults);
}

export function formatPricebookDollars(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

export function applySearchValueToDraft<T extends { itemName: string; category: string; unitLabel: string }>(
  draft: T,
  searchValue: string,
  hadPricebookSelection: boolean
): T {
  if (hadPricebookSelection) {
    return {
      ...draft,
      itemName: searchValue,
      category: "",
      unitLabel: "",
    };
  }

  return {
    ...draft,
    itemName: searchValue,
  };
}
