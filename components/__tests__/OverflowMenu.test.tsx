// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { OverflowMenu } from "@/components/ui/OverflowMenu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OverflowMenu", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(<OverflowMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a collapsed trigger with the default label and correct ARIA", () => {
    render(<OverflowMenu items={[{ label: "Edit", onSelect: () => {} }]} />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Menu is not mounted until opened.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("uses a custom label on the trigger", () => {
    render(<OverflowMenu label="Job actions" items={[{ label: "Edit", onSelect: () => {} }]} />);
    expect(screen.getByRole("button", { name: "Job actions" })).toBeInTheDocument();
  });

  it("opens on click, revealing the menu items and flipping aria-expanded", () => {
    render(
      <OverflowMenu
        items={[
          { label: "Edit", onSelect: () => {} },
          { label: "Duplicate", onSelect: () => {} },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Edit", "Duplicate"]);
  });

  it("toggles closed when the trigger is clicked a second time", () => {
    render(<OverflowMenu items={[{ label: "Edit", onSelect: () => {} }]} />);
    const trigger = screen.getByRole("button", { name: "More actions" });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("fires the item's onSelect and closes the menu when an item is chosen", () => {
    const onEdit = vi.fn();
    const onDuplicate = vi.fn();
    render(
      <OverflowMenu
        items={[
          { label: "Edit", onSelect: onEdit },
          { label: "Duplicate", onSelect: onDuplicate },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape while open (document keydown listener)", () => {
    render(<OverflowMenu items={[{ label: "Edit", onSelect: () => {} }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores non-Escape keys while open", () => {
    render(<OverflowMenu items={[{ label: "Edit", onSelect: () => {} }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on an outside pointerdown but stays open for a pointerdown inside the menu", () => {
    render(<OverflowMenu items={[{ label: "Edit", onSelect: () => {} }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    // Pointerdown inside the menu must NOT close it.
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Pointerdown outside the root closes it.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("styles a danger item distinctly from a default item", () => {
    render(
      <OverflowMenu
        items={[
          { label: "Edit", onSelect: () => {} },
          { label: "Delete", onSelect: () => {}, variant: "danger" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    const danger = screen.getByRole("menuitem", { name: "Delete" });
    const normal = screen.getByRole("menuitem", { name: "Edit" });
    expect(danger.className).toContain("text-rose-700");
    expect(normal.className).toContain("text-slate-700");
    expect(normal.className).not.toContain("text-rose-700");
  });
});
