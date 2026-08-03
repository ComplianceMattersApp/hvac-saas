// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// The modal persists dismissal into Supabase user_metadata via the browser client.
// Stub the client so we can drive getUser and assert what updateUser records.
const getUser = vi.fn();
const updateUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
  }),
}));

import TodayWelcomeModal from "@/components/home/TodayWelcomeModal";

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { user_metadata: { locale: "en" } } } });
  updateUser.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("TodayWelcomeModal", () => {
  it("renders nothing when it is not initially open", () => {
    render(<TodayWelcomeModal initiallyOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the welcome dialog when initially open", () => {
    render(<TodayWelcomeModal initiallyOpen />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("heading", { name: /Welcome to your new dashboard/i }),
    ).toBeInTheDocument();
  });

  it("dismisses on 'Got it', persists the dismissal, and hides the dialog", async () => {
    render(<TodayWelcomeModal initiallyOpen />);

    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(updateUser).toHaveBeenCalledTimes(1);
    const payload = updateUser.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    // Existing metadata is preserved and the dismissal flag is merged in.
    expect(payload.data.locale).toBe("en");
    expect(payload.data.today_dashboard_v1_welcome).toMatchObject({
      dismissed: true,
      version: "v1",
    });
  });

  it("dismisses when Escape is pressed", async () => {
    render(<TodayWelcomeModal initiallyOpen />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateUser).toHaveBeenCalledTimes(1);
  });

  it("stays dismissed across a re-render with the same props", async () => {
    const { rerender } = render(<TodayWelcomeModal initiallyOpen />);

    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Re-rendering with the same initiallyOpen must not resurrect the modal:
    // dismissal lives in component state, not derived from props each render.
    rerender(<TodayWelcomeModal initiallyOpen />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fails open: dismisses the modal even if the metadata write throws", async () => {
    updateUser.mockRejectedValueOnce(new Error("network down"));
    render(<TodayWelcomeModal initiallyOpen />);

    fireEvent.click(screen.getByRole("button", { name: /Got it/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("dismisses and navigates to Operations when 'Open Operations' is clicked", async () => {
    // window.location.assign is non-configurable in jsdom, so swap the whole object.
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign },
    });

    try {
      render(<TodayWelcomeModal initiallyOpen />);

      fireEvent.click(screen.getByRole("button", { name: /Open Operations/i }));

      await waitFor(() => expect(assign).toHaveBeenCalledWith("/ops"));
      expect(updateUser).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
