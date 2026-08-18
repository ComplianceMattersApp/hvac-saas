// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";

import FormDraftGuard from "@/components/jobs/FormDraftGuard";
import { FIELD_DRAFT_KEY_PREFIX, FIELD_DRAFT_VERSION } from "@/lib/field-drafts/form-drafts";

const KEY = `${FIELD_DRAFT_KEY_PREFIX}:user-1:job-1:test-run:run-1`;

function seedDraft(values: Record<string, unknown>, options: { token?: string | null } = {}) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      version: FIELD_DRAFT_VERSION,
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

/**
 * Shaped like the duct leakage form: picking an exemption unmounts the results
 * section, and the server echoes the exception's label back into the notes box
 * on the next render. That combination is what looped the restore banner.
 */
function DuctLeakageForm({
  exception = "",
  reason = "",
}: { exception?: string; reason?: string }) {
  const [selected, setSelected] = useState(exception);
  const [notes, setNotes] = useState(reason);
  const exempt = selected === "under_40_ft_ducting";
  return (
    <form>
      <input type="hidden" name="test_run_id" defaultValue="run-1" />
      <select
        name="duct_exception"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">No exception</option>
        <option value="under_40_ft_ducting">&lt; 40&apos; of ducting</option>
      </select>
      {selected ? (
        <input name="override_reason" value={notes} onChange={(e) => setNotes(e.target.value)} />
      ) : null}
      {/* Server-rendered setup defaults the tech never types. */}
      <input name="leakage_percent_target" type="number" defaultValue="10" />
      <input name="tonnage" type="number" defaultValue="2" />
      {exempt ? null : <input name="measured_duct_leakage_cfm" type="number" defaultValue="" />}
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

  it("captures only the fields the tech touched, not the server's defaults", async () => {
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    fireEvent.change(document.querySelector('[name="duct_exception"]')!, {
      target: { value: "under_40_ft_ducting" },
    });

    await waitFor(() => expect(storedDraft()).not.toBeNull());
    // Storing untouched defaults is what let a normalized server re-render
    // disagree with the draft and re-offer a restore after every save.
    expect(Object.keys(storedDraft().values)).toEqual(["duct_exception"]);
  });

  it("writes nothing at all when the tech never edited anything", async () => {
    const view = render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    view.unmount();

    expect(storedDraft()).toBeNull();
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

/**
 * The reported bug: completing a duct leakage test re-offered "Unsaved
 * readings from just now" after every save, and restoring brought it straight
 * back. Each save redirects, so the guard re-reads the draft against a form the
 * server has re-rendered from what it stored.
 */
describe("save cycle", () => {
  it("stops offering a draft once the save it went out with has landed", async () => {
    const view = render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    fireEvent.change(document.querySelector('[name="duct_exception"]')!, {
      target: { value: "under_40_ft_ducting" },
    });
    await waitFor(() => expect(storedDraft()).not.toBeNull());

    // Save: submit, then the server action's redirect tears the form down.
    fireEvent.submit(document.querySelector("form")!);
    view.unmount();

    // Re-render after the redirect: the row has a new updated_at, and the
    // server has echoed the exception's label into the notes box.
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-B">
        <DuctLeakageForm exception="under_40_ft_ducting" reason="< 40' of ducting" />
      </FormDraftGuard>,
    );

    await waitFor(() => expect(storedDraft()).toBeNull());
    expect(screen.queryByText(/Unsaved readings/i)).toBeNull();
  });

  it("still offers the readings when the save never landed", async () => {
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    fireEvent.input(document.querySelector('[name="tonnage"]')!, { target: { value: "3" } });
    await waitFor(() => expect(storedDraft()?.values?.tonnage).toBe("3"));
    fireEvent.submit(document.querySelector("form")!);
    cleanup();

    // Same token: nothing proves the row was written, so the reading stays
    // recoverable rather than being retired on the strength of a click.
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    expect(await screen.findByRole("button", { name: "Restore" })).toBeTruthy();
    expect(storedDraft()?.values?.tonnage).toBe("3");
  });

  it("holds a value whose field is off screen without looping the banner", async () => {
    // Typed while the results section was mounted; the exemption has since
    // unmounted it, so there is nowhere to restore it to.
    seedDraft({ measured_duct_leakage_cfm: "418" });

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm exception="under_40_ft_ducting" reason="< 40' of ducting" />
      </FormDraftGuard>,
    );

    await waitFor(() => expect(screen.queryByRole("button", { name: "Restore" })).toBeNull());
    // Silent, but not lost.
    expect(storedDraft()?.values?.measured_duct_leakage_cfm).toBe("418");
  });

  it("does not resurrect a discarded draft when the form unmounts", async () => {
    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    fireEvent.input(document.querySelector('[name="tonnage"]')!, { target: { value: "3" } });
    await waitFor(() => expect(storedDraft()).not.toBeNull());
    cleanup();

    render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-B">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    cleanup();

    expect(storedDraft()).toBeNull();
  });

  it("settles as soon as the tech restores, even if the page re-renders", async () => {
    seedDraft({ tonnage: "3" });

    const view = render(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-A">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('[name="tonnage"]')?.value).toBe("3"),
    );

    // A re-render arriving right after the restore (a photo upload finishing,
    // the row's token moving) must not re-offer what is already on screen.
    view.rerender(
      <FormDraftGuard draftKey={KEY} serverStateToken="token-B">
        <DuctLeakageForm />
      </FormDraftGuard>,
    );

    await waitFor(() => expect(screen.queryByText(/Unsaved readings/i)).toBeNull());
    // Still unsaved, so still on the device.
    expect(storedDraft()?.values?.tonnage).toBe("3");
  });
});
