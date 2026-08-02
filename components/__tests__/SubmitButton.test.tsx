// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import SubmitButton from "@/components/SubmitButton";

afterEach(cleanup);

describe("SubmitButton", () => {
  it("renders its children and is enabled and not busy when idle", () => {
    render(<SubmitButton>Save invoice</SubmitButton>);

    const button = screen.getByRole("button", { name: "Save invoice" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("honors the disabled prop and shows the disabled affordance", () => {
    render(<SubmitButton disabled>Save invoice</SubmitButton>);

    const button = screen.getByRole("button", { name: "Save invoice" });
    expect(button).toBeDisabled();
    expect(button.className).toContain("cursor-not-allowed");
  });

  it("shows the attachment-upload pending state when the form emits attachment-upload-state", () => {
    render(
      <form>
        <SubmitButton>Save invoice</SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Save invoice" });
    const form = button.closest("form")!;

    act(() => {
      form.dispatchEvent(
        new CustomEvent("attachment-upload-state", { detail: { pending: true } }),
      );
    });

    expect(screen.getByText("Uploading attachments...")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();

    act(() => {
      form.dispatchEvent(
        new CustomEvent("attachment-upload-state", { detail: { pending: false } }),
      );
    });

    expect(screen.queryByText("Uploading attachments...")).not.toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("uses a custom loadingText only while pending, not in the idle label", () => {
    render(
      <form>
        <SubmitButton loadingText="Issuing...">Issue invoice</SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Issue invoice" });
    expect(screen.queryByText("Issuing...")).not.toBeInTheDocument();

    act(() => {
      button
        .closest("form")!
        .dispatchEvent(new CustomEvent("attachment-upload-state", { detail: { pending: true } }));
    });

    // Attachment uploads have their own copy that takes precedence over loadingText.
    expect(screen.getByText("Uploading attachments...")).toBeInTheDocument();
  });
});
