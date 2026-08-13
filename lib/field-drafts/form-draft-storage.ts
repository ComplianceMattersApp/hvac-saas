/**
 * localStorage access for field drafts.
 *
 * Every operation is wrapped: Safari private mode throws on setItem, storage
 * can be full, and an entry can be corrupt. None of that may surface as an
 * error on a page a tech is filling out in a crawlspace — the worst acceptable
 * outcome is "no draft", never a broken form.
 *
 * localStorage only, by design: values are a few hundred bytes of text, it is
 * synchronous (so a write lands before the tab dies), and it works identically
 * in the browser, the PWA, and the Capacitor Android/iOS WebViews with no
 * native plugin.
 */

import {
  buildFieldDraft,
  isFieldDraftKey,
  parseStoredDraft,
  selectDraftKeysToEvict,
  type FieldDraft,
  type FieldDraftValues,
  type StoredDraftIndexEntry,
} from "./form-drafts";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Blocked by privacy settings — behave as if there is no draft store.
    return null;
  }
}

export function readDraft(key: string): FieldDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    return parseStoredDraft(store.getItem(key));
  } catch {
    return null;
  }
}

export function deleteDraft(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing to do — a stale draft is harmless */
  }
}

/** Every draft key currently on the device, with its timestamp, for eviction. */
function readDraftIndex(store: Storage): StoredDraftIndexEntry[] {
  const entries: StoredDraftIndexEntry[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!isFieldDraftKey(key)) continue;
    const draft = parseStoredDraft(store.getItem(key as string));
    // An unparseable draft still gets an index entry so eviction can reap it.
    entries.push({ key: key as string, savedAt: draft?.savedAt ?? "" });
  }
  return entries;
}

export function writeDraft(params: {
  key: string;
  values: FieldDraftValues;
  serverStateToken: string | null;
  now?: number;
}): void {
  const store = storage();
  if (!store) return;
  const now = params.now ?? Date.now();
  const draft = buildFieldDraft({
    values: params.values,
    serverStateToken: params.serverStateToken,
    savedAt: new Date(now).toISOString(),
  });

  try {
    // Evict before writing so a device at the cap still accepts the new draft.
    for (const key of selectDraftKeysToEvict(readDraftIndex(store), { now, keepKey: params.key })) {
      store.removeItem(key);
    }
  } catch {
    /* eviction is hygiene, never a reason to lose the write below */
  }

  try {
    store.setItem(params.key, JSON.stringify(draft));
  } catch {
    // Quota or private mode. Drop the oldest and try once more: losing the
    // newest reading is worse than losing the oldest draft.
    try {
      const index = readDraftIndex(store).filter((entry) => entry.key !== params.key);
      const oldest = index.sort(
        (a, b) => new Date(a.savedAt || 0).getTime() - new Date(b.savedAt || 0).getTime(),
      )[0];
      if (oldest) store.removeItem(oldest.key);
      store.setItem(params.key, JSON.stringify(draft));
    } catch {
      /* give up quietly — the form still works, it just is not backed up */
    }
  }
}
