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
  FIELD_DRAFT_KEY_PREFIX,
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

/**
 * Age and cap eviction. Called once per form mount and again if a write hits
 * the quota — deliberately NOT on the typing path, where enumerating the whole
 * store on every keystroke pause would put an O(all drafts) scan between the
 * tech and their next reading.
 */
export function pruneDrafts(options: { now?: number; keepKey?: string } = {}): void {
  const store = storage();
  if (!store) return;
  const now = options.now ?? Date.now();
  try {
    for (const key of selectDraftKeysToEvict(readDraftIndex(store), { now, keepKey: options.keepKey })) {
      store.removeItem(key);
    }
  } catch {
    /* hygiene only — never worth surfacing */
  }
}

/**
 * True when this device can actually hold a draft.
 *
 * A round-trip test write, because the failure modes are silent: Safari private
 * mode throws only on write, and a full store accepts nothing. The connectivity
 * banner uses this so it never tells a tech their readings are safe when
 * nothing is being saved.
 */
export function draftStorageWorks(): boolean {
  const store = storage();
  if (!store) return false;
  const probeKey = `${FIELD_DRAFT_KEY_PREFIX}:__probe__`;
  try {
    store.setItem(probeKey, "1");
    const readBack = store.getItem(probeKey) === "1";
    store.removeItem(probeKey);
    return readBack;
  } catch {
    return false;
  }
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

  // Preserve the token the draft was FIRST captured against. Restamping it on
  // every keystroke would erase the evidence that the office changed the row
  // underneath — the conflict warning has to survive a restore-without-save.
  const existing = readDraft(params.key);
  const draft = buildFieldDraft({
    values: params.values,
    serverStateToken: existing ? existing.serverStateToken : params.serverStateToken,
    savedAt: new Date(now).toISOString(),
  });

  try {
    store.setItem(params.key, JSON.stringify(draft));
  } catch {
    // Quota or private mode. Prune, then drop the oldest and try once more:
    // losing the newest reading is worse than losing the oldest draft.
    try {
      pruneDrafts({ now, keepKey: params.key });
      store.setItem(params.key, JSON.stringify(draft));
      return;
    } catch {
      /* fall through to the sacrifice below */
    }
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
