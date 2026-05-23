import { describe, expect, it } from "vitest";
import {
  applySearchValueToDraft,
  filterEstimatePricebookItems,
  formatPricebookDollars,
  type EstimatePricebookPickerItem,
} from "@/lib/estimates/estimate-pricebook-picker-model";

const items: EstimatePricebookPickerItem[] = [
  {
    id: "pb-1",
    item_name: "Compressor Install",
    item_type: "install",
    category: "HVAC",
    default_description: "Install compressor",
    default_unit_price: 499.5,
    unit_label: "ea",
  },
  {
    id: "pb-2",
    item_name: "Diagnostic Visit",
    item_type: "diagnostic",
    category: "Service",
    default_description: "Troubleshoot issue",
    default_unit_price: 99,
    unit_label: null,
  },
  {
    id: "pb-3",
    item_name: "Filter Material",
    item_type: "material",
    category: "IAQ",
    default_description: "Replace filter",
    default_unit_price: 25,
    unit_label: "ea",
  },
];

describe("estimate pricebook picker model", () => {
  it("filters local pricebook items by search text", () => {
    const result = filterEstimatePricebookItems(items, "diag");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("pb-2");
  });

  it("returns initial sliced list when search is empty", () => {
    const result = filterEstimatePricebookItems(items, "", 2);
    expect(result.map((item) => item.id)).toEqual(["pb-1", "pb-2"]);
  });

  it("formats default unit price as dollars string", () => {
    expect(formatPricebookDollars(499.5)).toBe("499.50");
    expect(formatPricebookDollars(undefined)).toBe("0.00");
  });

  it("clears hidden metadata when switching from selected pricebook to manual typing", () => {
    const next = applySearchValueToDraft(
      {
        itemName: "Compressor Install",
        category: "HVAC",
        unitLabel: "ea",
      },
      "Custom labor",
      true
    );

    expect(next).toEqual({
      itemName: "Custom labor",
      category: "",
      unitLabel: "",
    });
  });

  it("keeps typed manual path unchanged when no item is selected", () => {
    const next = applySearchValueToDraft(
      {
        itemName: "",
        category: "",
        unitLabel: "",
      },
      "Install labor",
      false
    );

    expect(next.itemName).toBe("Install labor");
  });
});
