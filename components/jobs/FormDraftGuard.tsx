"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteDraft,
  pruneDrafts,
  readDraft,
  writeDraft,
} from "@/lib/field-drafts/form-draft-storage";
import {
  draftDiffersFromCurrent,
  formatDraftAge,
  isDraftableFieldType,
  isDraftEmpty,
  serializeDraftFields,
  serverStateChangedSinceDraft,
  type FieldDraft,
  type FieldDraftSnapshot,
  type FieldDraftValues,
} from "@/lib/field-drafts/form-drafts";

const WRITE_DEBOUNCE_MS = 500;
/**
 * Gap before the second restore pass. Several field components mount their
 * dependent inputs in response to the first pass — pick an exception and the
 * reason box appears — so a single pass would drop exactly the values a tech
 * most needs back.
 */
const SECOND_PASS_DELAY_MS = 150;

const FIELD_SELECTOR = "input[name], select[name], textarea[name]";

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
  const secondPassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [unrestoredCount, setUnrestoredCount] = useState(0);
  const [restoredCount, setRestoredCount] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const token = String(serverStateToken ?? "").trim() || null;

  const fieldNodes = useCallback((from?: HTMLElement | null): Array<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  > => {
    const container = from ?? containerRef.current;
    if (!container) return [];
    return [
      ...container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        FIELD_SELECTOR,
      ),
      // Fields associated by the `form` attribute can live outside this
      // subtree; they still belong to the reading the tech is entering.
    ].filter((node) => isDraftableFieldType((node as HTMLInputElement).type));
  }, []);

  const readCurrentFields = useCallback(
    (from?: HTMLElement | null): FieldDraftSnapshot[] =>
      fieldNodes(from).map((node) => ({
        name: node.name,
        value: node.value,
        type: (node as HTMLInputElement).type,
        checked: (node as HTMLInputElement).checked,
      })),
    [fieldNodes],
  );

  /**
   * Write buffered values NOW, cancelling any pending debounce.
   *
   * Takes the container explicitly because React detaches refs BEFORE running
   * effect cleanups: by unmount time `containerRef.current` is already null, so
   * a flush that relied on it would silently discard the last keystrokes — the
   * exact loss this guard exists to prevent.
   */
  const flushWrite = useCallback((from?: HTMLElement | null) => {
    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    const container = from ?? containerRef.current;
    if (!container) return;
    const values: FieldDraftValues = serializeDraftFields(readCurrentFields(container));
    if (isDraftEmpty(values)) {
      deleteDraft(draftKey);
      return;
    }
    writeDraft({ key: draftKey, values, serverStateToken: token });
  }, [draftKey, readCurrentFields, token]);

  // On mount: prune old drafts once, then decide whether there is anything
  // worth offering back.
  useEffect(() => {
    pruneDrafts({ keepKey: draftKey });

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

  // Capture typing, debounced so a fast typist writes once per pause.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const schedule = () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => flushWrite(container), WRITE_DEBOUNCE_MS);
    };

    // A phone backgrounding the tab is the single most likely moment to lose
    // buffered keystrokes, and it may never fire another event. Both of these
    // write synchronously; localStorage is sync, so the value lands even if the
    // tab is killed immediately after.
    const flushNow = () => flushWrite(container);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };

    container.addEventListener("input", schedule);
    container.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);

    return () => {
      container.removeEventListener("input", schedule);
      container.removeEventListener("change", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      // Unmount must not discard buffered values either — hence the captured
      // container rather than the (already detached) ref.
      if (writeTimerRef.current) flushWrite(container);
      if (secondPassTimerRef.current) clearTimeout(secondPassTimerRef.current);
    };
  }, [flushWrite]);

  /**
   * Write one pass of values into the DOM. Returns the names that had no field
   * to write into.
   */
  const applyValues = useCallback(
    (values: FieldDraftValues): { missing: string[]; applied: number; firstNode: HTMLElement | null } => {
      const container = containerRef.current;
      if (!container) return { missing: Object.keys(values), applied: 0, firstNode: null };

      const missing: string[] = [];
      let applied = 0;
      let firstNode: HTMLElement | null = null;

      for (const [name, value] of Object.entries(values)) {
        const nodes = [
          ...container.querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >(`[name="${CSS.escape(name)}"]`),
        ].filter((node) => isDraftableFieldType((node as HTMLInputElement).type));

        if (nodes.length === 0) {
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
          // React tracks value internally; a dispatched input event is what
          // makes controlled field components and their live previews
          // recompute — and what mounts fields that depend on this one.
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
          if (!firstNode) firstNode = node as HTMLElement;
        }
        applied += 1;
      }

      return { missing, applied, firstNode };
    },
    [],
  );

  const handleRestore = useCallback(() => {
    if (!draft) return;

    const first = applyValues(draft.values);
    const total = Object.keys(draft.values).length;
    setDraft(null);
    setRestoredCount(total - first.missing.length);
    setUnrestoredCount(first.missing.length);
    first.firstNode?.focus?.();

    if (first.missing.length === 0) return;

    // Second pass: fields that appear only in response to the first pass (an
    // exception reason box unlocked by picking an exception) are not in the DOM
    // until React has re-rendered.
    const pending: FieldDraftValues = {};
    for (const name of first.missing) pending[name] = draft.values[name];

    secondPassTimerRef.current = setTimeout(() => {
      const second = applyValues(pending);
      setRestoredCount(total - second.missing.length);
      setUnrestoredCount(second.missing.length);
      // Whatever is still unrestorable STAYS in the draft. Dropping it would
      // destroy a reading the tech typed just because its field is not on
      // screen right now.
    }, SECOND_PASS_DELAY_MS);
  }, [applyValues, draft]);

  const handleDiscard = useCallback(() => {
    deleteDraft(draftKey);
    setDraft(null);
    setRestoredCount(null);
    setUnrestoredCount(0);
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

      {restoredCount !== null ? (
        unrestoredCount > 0 ? (
          <div
            role="status"
            className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
          >
            Restored {restoredCount} value{restoredCount === 1 ? "" : "s"}.{" "}
            <span className="font-semibold">
              {unrestoredCount} saved value{unrestoredCount === 1 ? "" : "s"} couldn&rsquo;t be
              restored because their fields aren&rsquo;t currently shown.
            </span>{" "}
            They are still saved on this device — open the matching option and restore again.
          </div>
        ) : (
          <div role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
            Readings restored from this device. Save to send them in.
          </div>
        )
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
