// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import PrintButton from "@/components/ui/PrintButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PrintButton", () => {
  it("renders the default label as a non-submitting button", () => {
    render(<PrintButton />);
    const button = screen.getByRole("button", { name: "Print CHEERS" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("renders a custom label", () => {
    render(<PrintButton label="Print invoice" />);
    expect(screen.getByRole("button", { name: "Print invoice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print CHEERS" })).not.toBeInTheDocument();
  });

  it("applies the provided className", () => {
    render(<PrintButton className="btn-primary big" />);
    const button = screen.getByRole("button", { name: "Print CHEERS" });
    expect(button.className).toContain("btn-primary");
    expect(button.className).toContain("big");
  });

  it("invokes window.print when clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintButton />);

    fireEvent.click(screen.getByRole("button", { name: "Print CHEERS" }));

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("does not print until actually clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintButton label="Print" />);

    expect(printSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(printSpy).toHaveBeenCalledTimes(2);
  });
});
