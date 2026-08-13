"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { deleteDraft, readDraft, writeDraft } from "@/lib/field-drafts/form-draft-storage";
import {
  draftDiffersFromCurrent,
  formatDraftAge,
  isDraftEmpty,
  serializeDraftFields,
  serverStateChangedSinceDraft,
  type FieldDraft,
  type FieldDraftSnapshot,
  type FieldDraftValues,
} from "@/lib/field-drafts/form-drafts";

const WRITE_DEBOUNCE_MS = 500;

/**
 * Keeps typed field values on the device as they are entered, and offers them
 * back after a reload, app switch, or crashed tab.
 *
 * Wraps a form's FIELDS, not the form element, so one generic component covers
 * every test-entry form without touching thirty-odd bespoke layouts. It listens
 * to `input`/`change` events bubbling out of its children.
 *
 * Restore is always explicit. Silently refilling fields could resurface a stale
 * reading over newer office-entered data without the tech noticing — on
 * compliance data that is worse than losing the draft.
 *
 * The guard NEVER submits, queues, or replays anything. It only reads and
 * writes localStorage.
 */
export function FormDraftGuard({
  draftKey,
  serverStateToken,
  children,
  className,
}: {
  draftKey: string;
  /** The backing row's updated_at at render time. Null when there is no row yet. */
  serverStateToken?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [restored, setRestored] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const token = String(serverStateToken ?? "").trim() || null;

  const readCurrentFields = useCallback((): FieldDraftSnapshot[] => {
    const container = containerRef.current;
    if (!container) return [];
    const nodes = container.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input[name], select[name], textarea[name]");
    return [...nodes].map((node) => ({
      name: node.name,
      value: node.value,
      type: (node as HTMLInputElement).type,
      checked: (node as HTMLInputElement).checked,
    }));
  }, []);

  // On mount: decide whether there is anything worth offering.
  useEffect(() => {
    const stored = readDraft(draftKey);
    if (!stored) return;

    const current = serializeDraftFields(readCurrentFields());
    // Redundant draft: everything in it is already on screen (typically because
    // the save landed and the server re-rendered these very values). Delete it
    // rather than inviting a pointless restore.
    if (isDraftEmpty(stored.values) || !draftDiffersFromCurrent(stored.values, current)) {
      deleteDraft(draftKey);
      return;
    }
    setNow(Date.now());
    setDraft(stored);
  }, [draftKey, readCurrentFields]);

  // Capture typing. Debounced so a fast typist writes once per pause, not per
  // keystroke, and `capture: false` so the events have already bubbled from the
  // real field components.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const schedule = () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => {
        const values: FieldDraftValues = serializeDraftFields(readCurrentFields());
        // Never store an all-empty form — it would offer a restore that does
        // nothing and hide the fact that there is no backup yet.
        if (isDraftEmpty(values)) {
          deleteDraft(draftKey);
          return;
        }
        writeDraft({ key: draftKey, values, serverStateToken: token });
      }, WRITE_DEBOUNCE_MS);
    };

    container.addEventListener("input", schedule);
    container.addEventListener("change", schedule);
    return () => {
      container.removeEventListener("input", schedule);
      container.removeEventListener("change", schedule);
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, [draftKey, readCurrentFields, token]);

  const handleRestore = useCallback(() => {
    const container = containerRef.current;
    if (!container || !draft) return;

    let firstRestored: HTMLElement | null = null;
    const missing: string[] = [];

    for (const [name, value] of Object.entries(draft.values)) {
      const nodes = container.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(`[name="${CSS.escape(name)}"]`);
      if (nodes.length === 0) {
        // The form changed shape since the draft was taken. Skip silently and
        // drop the field rather than failing the whole restore.
        missing.push(name);
        continue;
      }

      for (const node of nodes) {
        const type = String((node as HTMLInputElement).type ?? "").toLowerCase();
        if (type === "checkbox") {
          (node as HTMLInputElement).checked = Boolean(value);
        } else if (type === "radio") {
          (node as HTMLInputElement).checked = (node as HTMLInputElement).value === String(value);
        } else {
          setNativeValue(node, String(value));
        }
        // React tracks value internally; a dispatched input event is what makes
        // controlled field components and their live previews recompute.
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
        if (!firstRestored) firstRestored = node as HTMLElement;
      }
    }

    if (missing.length > 0) {
      const remaining: FieldDraftValues = { ...draft.values };
      for (const name of missing) delete remaining[name];
      writeDraft({ key: draftKey, values: remaining, serverStateToken: token });
    }

    setDraft(null);
    setRestored(true);
    firstRestored?.focus?.();
  }, [draft, draftKey, token]);

  const handleDiscard = useCallback(() => {
    deleteDraft(draftKey);
    setDraft(null);
  }, [draftKey]);

  const serverChanged = serverStateChangedSinceDraft(draft, token);

  return (
    <div ref={containerRef} className={className}>
      {draft ? (
        <div
          role="status"
          className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900"
        >
          <div className="font-semibold">
            Unsaved readings from {formatDraftAge(draft.savedAt, now)} are saved on this device
          </div>
          {serverChanged ? (
            <p className="mt-1 text-xs leading-5">
              The readings on file changed since this draft — review before restoring.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRestore}
              className="inline-flex min-h-9 items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {restored ? (
        <div role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
          Readings restored from this device. Save to send them in.
        </div>
      ) : null}

      {children}
    </div>
  );
}

/**
 * Set a field's value through the native setter.
 *
 * React installs its own value setter on the element instance; assigning
 * `node.value` directly leaves React's internal tracker thinking nothing
 * changed, so the subsequent input event is ignored and live previews never
 * recompute. Calling the prototype setter is what makes the restore visible.
 */
function setNativeValue(
  node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(node);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) descriptor.set.call(node, value);
  else node.value = value;
}

export default FormDraftGuard;
