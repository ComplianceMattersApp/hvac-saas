// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AccordionCards } from "@/components/AccordionCards";

afterEach(cleanup);

const baseItems = [
  { key: "a", title: "Section A", children: <p>Body A</p> },
  { key: "b", title: "Section B", children: <p>Body B</p> },
  { key: "c", title: "Section C", children: <p>Body C</p> },
];

describe("AccordionCards", () => {
  it("opens the item marked defaultOpen and leaves the others collapsed", () => {
    render(
      <AccordionCards items={[...baseItems.slice(0, 2), { ...baseItems[2], defaultOpen: true }]} />,
    );

    expect(screen.getByText("Body C")).toBeInTheDocument();
    expect(screen.queryByText("Body A")).not.toBeInTheDocument();
    expect(screen.queryByText("Body B")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Section C/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("starts fully collapsed when no item is defaultOpen", () => {
    render(<AccordionCards items={baseItems} />);

    expect(screen.queryByText("Body A")).not.toBeInTheDocument();
    for (const name of ["Section A", "Section B", "Section C"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  it("expands a section on click and reflects it in aria-expanded", () => {
    render(<AccordionCards items={baseItems.slice(0, 2)} />);

    const headerA = screen.getByRole("button", { name: /Section A/ });
    expect(screen.queryByText("Body A")).not.toBeInTheDocument();

    fireEvent.click(headerA);

    expect(screen.getByText("Body A")).toBeInTheDocument();
    expect(headerA).toHaveAttribute("aria-expanded", "true");
  });

  it("is single-open: opening one section closes the previously open one", () => {
    render(<AccordionCards items={baseItems.slice(0, 2)} />);

    fireEvent.click(screen.getByRole("button", { name: /Section A/ }));
    expect(screen.getByText("Body A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Section B/ }));
    expect(screen.getByText("Body B")).toBeInTheDocument();
    expect(screen.queryByText("Body A")).not.toBeInTheDocument();
  });

  it("collapses an open section when its own header is clicked again", () => {
    render(<AccordionCards items={baseItems.slice(0, 1)} />);

    const headerA = screen.getByRole("button", { name: /Section A/ });
    fireEvent.click(headerA);
    expect(screen.getByText("Body A")).toBeInTheDocument();

    fireEvent.click(headerA);
    expect(screen.queryByText("Body A")).not.toBeInTheDocument();
    expect(headerA).toHaveAttribute("aria-expanded", "false");
  });
});
