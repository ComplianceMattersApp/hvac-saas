// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import ChecklistItemBuilder from "@/components/jobs/ChecklistItemBuilder";

afterEach(cleanup);

function hiddenValue(name = "checklist_items_json") {
  const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
  expect(input).toBeTruthy();
  return JSON.parse(input!.value) as Array<{
    item_label: string;
    default_guidance: string | null;
    sort_order: number;
  }>;
}

function labelBox() {
  return screen.getByPlaceholderText(/Item label/i) as HTMLInputElement;
}
function guidanceBox() {
  return screen.getByPlaceholderText(/Guidance for tech/i) as HTMLInputElement;
}
function rows() {
  return screen.getAllByRole("button", { name: "Remove item" }).map((b) => b.closest("div.flex")!);
}

describe("ChecklistItemBuilder", () => {
  it("starts empty: no rows and an empty serialized list", () => {
    render(<ChecklistItemBuilder />);
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
    expect(hiddenValue()).toEqual([]);
  });

  it("adds an item, appending a row and serializing it into the hidden input", () => {
    render(<ChecklistItemBuilder />);

    fireEvent.change(labelBox(), { target: { value: "Checked capacitor" } });
    fireEvent.change(guidanceBox(), { target: { value: "Record µF reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByText("Checked capacitor")).toBeInTheDocument();
    expect(screen.getByText("Record µF reading")).toBeInTheDocument();
    expect(hiddenValue()).toEqual([
      { item_label: "Checked capacitor", default_guidance: "Record µF reading", sort_order: 0 },
    ]);

    // Drafts are cleared after a successful add.
    expect(labelBox().value).toBe("");
    expect(guidanceBox().value).toBe("");
  });

  it("serializes optional guidance as null when omitted", () => {
    render(<ChecklistItemBuilder />);
    fireEvent.change(labelBox(), { target: { value: "Flush drain line" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(hiddenValue()).toEqual([
      { item_label: "Flush drain line", default_guidance: null, sort_order: 0 },
    ]);
  });

  it("does not add when the label is blank; Add is disabled for whitespace-only labels", () => {
    render(<ChecklistItemBuilder />);
    const add = screen.getByRole("button", { name: "Add item" });
    expect(add).toBeDisabled();

    fireEvent.change(labelBox(), { target: { value: "   " } });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(hiddenValue()).toEqual([]);
  });

  it("adds on Enter in the label field", () => {
    render(<ChecklistItemBuilder />);
    const box = labelBox();
    fireEvent.change(box, { target: { value: "Verify airflow" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(screen.getByText("Verify airflow")).toBeInTheDocument();
    expect(hiddenValue()).toHaveLength(1);
  });

  it("removes the targeted row and drops it from the serialization", () => {
    render(<ChecklistItemBuilder />);
    for (const label of ["First", "Second", "Third"]) {
      fireEvent.change(labelBox(), { target: { value: label } });
      fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    }
    expect(rows()).toHaveLength(3);

    // Remove "Second".
    const secondRow = rows()[1];
    fireEvent.click(within(secondRow as HTMLElement).getByRole("button", { name: "Remove item" }));

    expect(screen.queryByText("Second")).not.toBeInTheDocument();
    expect(hiddenValue().map((i) => i.item_label)).toEqual(["First", "Third"]);
    // sort_order is recomputed contiguously after removal.
    expect(hiddenValue().map((i) => i.sort_order)).toEqual([0, 1]);
  });

  it("reorders items with the move-up control and updates sort_order", () => {
    render(<ChecklistItemBuilder />);
    for (const label of ["A", "B"]) {
      fireEvent.change(labelBox(), { target: { value: label } });
      fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    }
    expect(hiddenValue().map((i) => i.item_label)).toEqual(["A", "B"]);

    // Move "B" up.
    const bRow = rows()[1];
    fireEvent.click(within(bRow as HTMLElement).getByRole("button", { name: "Move up" }));

    expect(hiddenValue().map((i) => i.item_label)).toEqual(["B", "A"]);
    expect(hiddenValue().map((i) => i.sort_order)).toEqual([0, 1]);
  });

  it("disables move-up on the first row and move-down on the last row", () => {
    render(<ChecklistItemBuilder />);
    for (const label of ["A", "B"]) {
      fireEvent.change(labelBox(), { target: { value: label } });
      fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    }
    const upButtons = screen.getAllByRole("button", { name: "Move up" });
    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });

  it("hydrates from initialItems and honors a custom itemsName", () => {
    render(
      <ChecklistItemBuilder
        itemsName="custom_field"
        initialItems={[
          { id: "x1", item_label: "  Trimmed label  ", default_guidance: "  hint  " },
          { id: "", item_label: "Second", default_guidance: "" },
        ]}
      />,
    );

    const parsed = hiddenValue("custom_field");
    expect(parsed).toEqual([
      { item_label: "Trimmed label", default_guidance: "hint", sort_order: 0 },
      { item_label: "Second", default_guidance: null, sort_order: 1 },
    ]);
    expect(screen.getByText("Trimmed label")).toBeInTheDocument();
  });
});
