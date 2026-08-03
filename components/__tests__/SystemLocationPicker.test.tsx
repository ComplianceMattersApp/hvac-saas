// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import SystemLocationPicker from "@/components/jobs/SystemLocationPicker";

afterEach(cleanup);

const systems = [
  { id: "sys-1", name: "Upstairs" },
  { id: "sys-2", name: "Garage" },
];

const hidden = (name: string) =>
  document.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement | null;

describe("SystemLocationPicker", () => {
  it("renders a select with an option per system plus a '+ New…' option, defaulting to the first system", () => {
    render(<SystemLocationPicker systems={systems} />);

    const select = screen.getByLabelText("System Label (required)") as HTMLSelectElement;
    expect(select).toHaveAttribute("name", "system_location_choice");
    expect(select.value).toBe("sys-1");

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(["sys-1", "sys-2", "__new__"]);
    expect(options.map((o) => o.textContent)).toEqual(["Upstairs", "Garage", "+ New…"]);
  });

  it("exposes the selected system through hidden fields and updates them on selection change", () => {
    render(<SystemLocationPicker systems={systems} />);

    expect(hidden("system_id")!.value).toBe("sys-1");
    expect(hidden("system_location")!.value).toBe("Upstairs");
    expect(hidden("system_location_custom")!.value).toBe("");

    const select = screen.getByLabelText("System Label (required)") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "sys-2" } });

    expect(select.value).toBe("sys-2");
    expect(hidden("system_id")!.value).toBe("sys-2");
    expect(hidden("system_location")!.value).toBe("Garage");
  });

  it("swaps to a required custom-location input when '+ New…' is chosen, hiding the derived fields", () => {
    render(<SystemLocationPicker systems={systems} />);

    // Custom text input is not present while an existing system is selected.
    expect(document.querySelector('input[name="system_location_custom"]:not([type="hidden"])')).toBeNull();

    const select = screen.getByLabelText("System Label (required)") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__new__" } });

    const customInput = document.querySelector(
      'input[name="system_location_custom"]',
    ) as HTMLInputElement;
    expect(customInput).toBeInTheDocument();
    expect(customInput.type).not.toBe("hidden");
    expect(customInput).toBeRequired();
    expect(customInput).toHaveAttribute("placeholder", expect.stringContaining("Garage"));

    // The derived hidden fields are removed in the "new" state.
    expect(hidden("system_id")).toBeNull();
    expect(hidden("system_location")).toBeNull();
  });

  it("returns to derived hidden fields when switching back from '+ New…' to an existing system", () => {
    render(<SystemLocationPicker systems={systems} />);
    const select = screen.getByLabelText("System Label (required)") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "__new__" } });
    expect(hidden("system_id")).toBeNull();

    fireEvent.change(select, { target: { value: "sys-2" } });
    expect(hidden("system_id")!.value).toBe("sys-2");
    expect(hidden("system_location")!.value).toBe("Garage");
    expect(document.querySelector('input[name="system_location_custom"]:not([type="hidden"])')).toBeNull();
  });

  it("falls back to a free-text location field when no systems are provided", () => {
    render(<SystemLocationPicker systems={[]} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const textInput = screen.getByLabelText("System Label (required)") as HTMLInputElement;
    expect(textInput).toHaveAttribute("name", "system_location");
    expect(textInput).toBeRequired();
    expect(textInput).toHaveAttribute("placeholder", "Upstairs");
    expect(hidden("system_location_custom")!.value).toBe("");
  });
});
