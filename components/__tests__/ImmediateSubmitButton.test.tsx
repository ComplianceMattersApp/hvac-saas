// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";

afterEach(cleanup);

// Render inside a form so useFormStatus has a provider and submit events have a target.
// The form action is stubbed and its default is suppressed so jsdom doesn't try to navigate.
function renderInForm(
  node: React.ReactNode,
  formProps: React.FormHTMLAttributes<HTMLFormElement> = {},
) {
  return render(
    <form onSubmit={(e) => e.preventDefault()} {...formProps}>
      {node}
    </form>,
  );
}

describe("ImmediateSubmitButton", () => {
  it("renders children as a submit button, enabled and not busy when idle", () => {
    renderInForm(<ImmediateSubmitButton>Send now</ImmediateSubmitButton>);

    const button = screen.getByRole("button", { name: "Send now" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("honors the disabled prop and shows the disabled affordance", () => {
    renderInForm(<ImmediateSubmitButton disabled>Send now</ImmediateSubmitButton>);

    const button = screen.getByRole("button", { name: "Send now" });
    expect(button).toBeDisabled();
    expect(button.className).toContain("cursor-not-allowed");
    expect(button.className).toContain("opacity-60");
  });

  it("enters the pending state after a click, swapping in the spinner and pendingText", async () => {
    renderInForm(<ImmediateSubmitButton pendingText="Sending...">Send now</ImmediateSubmitButton>);

    const button = screen.getByRole("button", { name: "Send now" });
    expect(screen.queryByText("Sending...")).not.toBeInTheDocument();

    fireEvent.click(button);

    // submitted is flipped on a 0ms timeout, so observe the transition async.
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button).toBeDisabled();
    expect(screen.getByText("Sending...")).toBeInTheDocument();
    // Original label is replaced by the pending copy.
    expect(button).not.toHaveTextContent("Send now");
  });

  it("invokes a caller-supplied onClick", () => {
    const onClick = vi.fn();
    renderInForm(<ImmediateSubmitButton onClick={onClick}>Send now</ImmediateSubmitButton>);

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT enter the pending state when onClick prevents default", async () => {
    renderInForm(
      <ImmediateSubmitButton
        pendingText="Sending..."
        onClick={(e) => e.preventDefault()}
      >
        Send now
      </ImmediateSubmitButton>,
    );

    const button = screen.getByRole("button", { name: "Send now" });
    fireEvent.click(button);

    // Give the (suppressed) 0ms timeout a chance to fire, then confirm nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toBeEnabled();
    expect(screen.queryByText("Sending...")).not.toBeInTheDocument();
  });

  it("does NOT enter the pending state when the form is invalid", async () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <input name="req" required defaultValue="" />
        <ImmediateSubmitButton pendingText="Sending...">Send now</ImmediateSubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Send now" });
    fireEvent.click(button);

    await new Promise((resolve) => setTimeout(resolve, 20));
    // checkValidity() is false because the required input is empty.
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toBeEnabled();
    expect(screen.queryByText("Sending...")).not.toBeInTheDocument();
  });
});
