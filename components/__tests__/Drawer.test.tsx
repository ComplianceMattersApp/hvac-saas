// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { Drawer } from "@/components/ui/Drawer";

// jsdom 25 ships a partial <dialog> that does not implement showModal/close
// (they emit "Not implemented" and never set the `open` state). Provide a
// faithful minimal implementation so the component's open/close effect can run
// the way it does in a real browser. This mocks a jsdom gap, not the component.
beforeAll(() => {
  const proto = window.HTMLDialogElement.prototype;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Drawer", () => {
  it("opens the native dialog and renders title, description and children when open", () => {
    render(
      <Drawer open onClose={() => {}} title="Replace equipment" description="Swap the outdoor unit">
        <p>Drawer body content</p>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Replace equipment" })).toBeInTheDocument();
    expect(screen.getByText("Swap the outdoor unit")).toBeInTheDocument();
    expect(screen.getByText("Drawer body content")).toBeInTheDocument();
  });

  it("omits the description paragraph when none is provided", () => {
    render(
      <Drawer open onClose={() => {}} title="Edit">
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByRole("heading", { name: "Edit" })).toBeInTheDocument();
    // No description text node beyond the title/children.
    expect(screen.queryByText("Swap the outdoor unit")).not.toBeInTheDocument();
  });

  it("starts closed (dialog not open) when open is false", () => {
    render(
      <Drawer open={false} onClose={() => {}} title="Edit">
        <p>Body</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.open).toBe(false);
  });

  it("closes the dialog when the open prop flips to false", () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} title="Edit">
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { hidden: true }).open).toBe(true);

    rerender(
      <Drawer open={false} onClose={() => {}} title="Edit">
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { hidden: true }).open).toBe(false);
  });

  it("calls onClose when the close (X) button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Edit">
        <p>Body</p>
      </Drawer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop (the dialog element itself) is clicked", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Edit">
        <p>Body</p>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { hidden: true });
    // Clicking the <dialog> element itself is the backdrop area.
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when content inside the drawer is clicked", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Edit">
        <button type="button">Inner action</button>
      </Drawer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Inner action" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on the dialog's native close event (e.g. Escape)", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Edit">
        <p>Body</p>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    fireEvent(dialog, new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
