// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import PricebookLineEntryFields, {
  type PricebookEntryItem,
} from "@/components/pricebook/PricebookLineEntryFields";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const items: PricebookEntryItem[] = [
  {
    id: "item-1",
    item_name: "Refrigerant Charge",
    item_type: "service",
    category: "Repair",
    default_description: "R-410A top-off",
    default_unit_price: 120,
    unit_label: "lb",
  },
  {
    id: "item-2",
    item_name: "Capacitor",
    item_type: "part",
    category: "Parts",
    default_description: "Dual run capacitor",
    default_unit_price: 45,
    unit_label: "ea",
  },
];

function renderFields(overrides: Partial<React.ComponentProps<typeof PricebookLineEntryFields>> = {}) {
  const onSelectedItemIdChange = vi.fn();
  const props: React.ComponentProps<typeof PricebookLineEntryFields> = {
    items,
    selectedItemId: "item-1",
    onSelectedItemIdChange,
    itemFieldName: "item_id",
    quantityFieldName: "quantity",
    itemLabel: "Item",
    quantityLabel: "Quantity",
    itemSelectId: "item-select",
    quantityInputId: "quantity-input",
    labelClassName: "label",
    inputClassName: "input",
    quantityDefaultValue: "1",
    ...overrides,
  };
  const utils = render(<PricebookLineEntryFields {...props} />);
  return { onSelectedItemIdChange, ...utils };
}

describe("PricebookLineEntryFields", () => {
  it("renders one option per item using item_name by default", () => {
    renderFields();

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent)).toEqual(["Refrigerant Charge", "Capacitor"]);
    expect(options.map((o) => o.value)).toEqual(["item-1", "item-2"]);
  });

  it("omits the empty option unless includeEmptyOption is set", () => {
    const { unmount } = renderFields();
    expect(screen.queryByRole("option", { name: "Select an item..." })).not.toBeInTheDocument();
    unmount();

    renderFields({ includeEmptyOption: true, selectedItemId: "" });
    const empty = screen.getByRole("option", { name: "Select an item..." }) as HTMLOptionElement;
    expect(empty).toBeInTheDocument();
    expect(empty.value).toBe("");
  });

  it("uses a custom emptyOptionLabel when provided", () => {
    renderFields({
      includeEmptyOption: true,
      emptyOptionLabel: "Pick something",
      selectedItemId: "",
    });
    expect(screen.getByRole("option", { name: "Pick something" })).toBeInTheDocument();
  });

  it("reflects selectedItemId as the select value", () => {
    renderFields({ selectedItemId: "item-2" });
    const select = screen.getByLabelText("Item") as HTMLSelectElement;
    expect(select.value).toBe("item-2");
  });

  it("calls onSelectedItemIdChange with the chosen id when the select changes", () => {
    const { onSelectedItemIdChange } = renderFields();
    const select = screen.getByLabelText("Item") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "item-2" } });

    expect(onSelectedItemIdChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemIdChange).toHaveBeenCalledWith("item-2");
  });

  it("is controlled: value follows the prop across re-render after the callback fires", () => {
    const onSelectedItemIdChange = vi.fn();
    const baseProps: React.ComponentProps<typeof PricebookLineEntryFields> = {
      items,
      selectedItemId: "item-1",
      onSelectedItemIdChange,
      itemFieldName: "item_id",
      quantityFieldName: "quantity",
      itemLabel: "Item",
      quantityLabel: "Quantity",
      itemSelectId: "item-select",
      quantityInputId: "quantity-input",
      labelClassName: "label",
      inputClassName: "input",
      quantityDefaultValue: "1",
    };
    const { rerender } = render(<PricebookLineEntryFields {...baseProps} />);

    const select = screen.getByLabelText("Item") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "item-2" } });
    expect(onSelectedItemIdChange).toHaveBeenCalledWith("item-2");

    rerender(<PricebookLineEntryFields {...baseProps} selectedItemId="item-2" />);
    expect((screen.getByLabelText("Item") as HTMLSelectElement).value).toBe("item-2");
  });

  it("customizes option text via optionLabel", () => {
    renderFields({ optionLabel: (item) => `${item.item_name} ($${item.default_unit_price})` });
    expect(screen.getByRole("option", { name: "Refrigerant Charge ($120)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Capacitor ($45)" })).toBeInTheDocument();
  });

  it("renders renderSelectedItem output only for the matching selected item", () => {
    const renderSelectedItem = (item: PricebookEntryItem) => (
      <p data-testid="selected-detail">Selected: {item.item_name}</p>
    );

    const { unmount } = renderFields({ selectedItemId: "item-2", renderSelectedItem });
    expect(screen.getByTestId("selected-detail")).toHaveTextContent("Selected: Capacitor");
    unmount();

    // No match => nothing rendered.
    renderFields({ selectedItemId: "does-not-exist", renderSelectedItem });
    expect(screen.queryByTestId("selected-detail")).not.toBeInTheDocument();
  });

  it("renders the quantity input with the given name and defaultValue", () => {
    renderFields({ quantityFieldName: "qty", quantityDefaultValue: "3" });
    const input = screen.getByLabelText("Quantity") as HTMLInputElement;
    expect(input).toHaveAttribute("name", "qty");
    expect(input.value).toBe("3");
  });

  it("renders the actionSlot when provided", () => {
    renderFields({ actionSlot: <button type="button">Remove</button> });
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
