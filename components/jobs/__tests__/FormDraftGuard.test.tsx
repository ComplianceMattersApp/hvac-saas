// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";

import FormDraftGuard from "@/components/jobs/FormDraftGuard";
import { FIELD_DRAFT_KEY_PREFIX } from "@/lib/field-drafts/form-drafts";

const KEY = `${FIELD_DRAFT_KEY_PREFIX}:user-1:job-1:test-run:run-1`;

function seedDraft(values: Record<string, unknown>, options: { token?: string | null } = {}) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      version: "v1",
      savedAt: new Date(Date.now() - 120_000).toISOString(),
      serverStateToken: options.token ?? "token-A",
      values,
    }),
  );
}

function storedDraft() {
  const raw = window.localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Stand-in for the real exception fields: the reason box only mounts once an
 * exception is chosen, which is exactly the shape that breaks a one-pass
 * restore.
 */
function ConditionalExceptionForm() {
  const [exception, setException] = useState("");
  return (
    <form>
      <input type="hidden" name="test_run_id" defaultValue="run-1" />
      <input name="measured_cfm" defaultValue="" />
      <select
        name="exception_value"
        value={exception}
        onChange={(event) => setException(event.target.value)}
      >
        <option value="">None</option>
        <option value="ex-1">Exception 1</option>
      </select>
      {exception ? <textarea name="exception_reason" defaultValue="" /> : null}
    </form>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("restore", () => {
  it("recovers a conditionally mounted field on the second pass", async () => {
    // Pass one selects the exception; the reason box does not exist yet. Pass
    // two runs after React has mounted it.
    seedDraft({
      measured_cfm: "418",
      exception_value: "ex-1",
      exception_reason: "supply plenum inaccessible",
    });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => {
      const reason = document.querySelector<HTMLTextAreaElement>('[name="exception_reason"]');
      expect(reason?.value).toBe("supply plenum inaccessible");
    });
    expect(document.querySelector<HTMLInputElement>('[name="measured_cfm"]')?.value).toBe("418");
  });

  it("reports honestly when a value could not be restored, and keeps it", async () => {
    seedDraft({ measured_cfm: "418", field_that_never_mounts: "9.5" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(screen.getByText(/couldn’t be\s+restored because their fields aren’t currently shown/i)).toBeTruthy();
    });
    // The unrestorable reading is still on the device — dropping it would
    // destroy a value the tech typed just because its field is off screen.
    expect(storedDraft()?.values?.field_that_never_mounts).toBe("9.5");
  });

  it("says nothing about failures when everything came back", async () => {
    seedDraft({ measured_cfm: "418" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(screen.getByText(/Readings restored from this device/i)).toBeTruthy());
    expect(screen.queryByText(/couldn’t be/i)).toBeNull();
  });

  it("never restores without a click", async () => {
    seedDraft({ measured_cfm: "418" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    await screen.findByRole("button", { name: "Restore" });
    expect(document.querySelector<HTMLInputElement>('[name="measured_cfm"]')?.value).toBe("");
  });

  it("discards on request", async () => {
    seedDraft({ measured_cfm: "418" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(storedDraft()).toBeNull();
  });

  it("flags a draft captured before newer server data", async () => {
    seedDraft({ measured_cfm: "418" }, { token: "token-A" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-B">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    expect(await screen.findByText(/readings on file changed since this draft/i)).toBeTruthy();
  });
});

describe("capture", () => {
  it("excludes hidden inputs so a stale draft cannot rewrite server identity", async () => {
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    const cfm = document.querySelector<HTMLInputElement>('[name="measured_cfm"]')!;
    fireEvent.input(cfm, { target: { value: "418" } });

    await waitFor(() => expect(storedDraft()).not.toBeNull());
    expect(storedDraft().values).toHaveProperty("measured_cfm", "418");
    expect(storedDraft().values).not.toHaveProperty("test_run_id");
  });

  it("flushes buffered keystrokes when the tab is hidden", async () => {
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    const cfm = document.querySelector<HTMLInputElement>('[name="measured_cfm"]')!;
    fireEvent.input(cfm, { target: { value: "42" } });
    // Still inside the debounce window — nothing written yet.
    expect(storedDraft()).toBeNull();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // A backgrounded phone may never fire another event, so this write has to
    // have happened synchronously.
    expect(storedDraft()?.values?.measured_cfm).toBe("42");
  });

  it("flushes buffered keystrokes on pagehide", async () => {
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.input(document.querySelector('[name="measured_cfm"]')!, { target: { value: "77" } });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(storedDraft()?.values?.measured_cfm).toBe("77");
  });

  it("flushes buffered keystrokes on unmount", async () => {
    const view = render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.input(document.querySelector('[name="measured_cfm"]')!, { target: { value: "88" } });
    view.unmount();

    expect(storedDraft()?.values?.measured_cfm).toBe("88");
  });

  it("keeps the token the draft was first captured against across rewrites", async () => {
    seedDraft({ measured_cfm: "1" }, { token: "token-A" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-B">
        <ConditionalExceptionForm />
      </FormDraftGuard>,
    );

    fireEvent.input(document.querySelector('[name="measured_cfm"]')!, { target: { value: "123" } });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    // The conflict warning must survive the tech typing one more character.
    expect(storedDraft()?.serverStateToken).toBe("token-A");
    expect(storedDraft()?.values?.measured_cfm).toBe("123");
  });
});
