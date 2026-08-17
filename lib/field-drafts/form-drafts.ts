/**
 * On-device draft persistence for field data-entry forms. Pure logic — no DOM,
 * no React, no storage API — so the rules that decide whether a rater's
 * readings survive are unit-testable on their own.
 *
 * What this protects: a tech standing in an attic types manometer readings,
 * the phone switches apps or the tab dies, and every value since the last Save
 * is gone. Re-taking readings is the worst failure this product has.
 *
 * What this is NOT: an offline submission queue. Nothing here replays a server
 * action. A queued auto-submit could overwrite newer office edits or re-fire
 * lifecycle actions, and for compliance-grade data the tech pressing Save with
 * signal is the only submission path.
 */

/**
 * Bumping this invalidates every stored draft — old shapes are discarded, not
 * migrated.
 *
 * v1 → v2: v1 snapshotted EVERY field in the form, including server-rendered
 * defaults the tech never touched. Those drafts can never agree with the next
 * server render (the server normalizes what it stores — an exception label
 * lands back in the notes box, "2.0" comes back as "2"), so they re-offered
 * themselves after every save and a restore could not settle them. They hold
 * no typed reading worth the loop, so they are dropped rather than migrated.
 */
export const FIELD_DRAFT_VERSION = "v2";
/** Shared by every version of the format, so superseded ones can be swept up. */
export const FIELD_DRAFT_KEY_NAMESPACE = "esfw-draft";
export const FIELD_DRAFT_KEY_PREFIX = `${FIELD_DRAFT_KEY_NAMESPACE}:${FIELD_DRAFT_VERSION}`;

/** At most this many drafts on a device; oldest go first. */
export const FIELD_DRAFT_MAX_ENTRIES = 50;
/** A draft older than this is stale enough that restoring it would surprise. */
export const FIELD_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** One field's captured value. Checkboxes/radios store their checked state. */
export type FieldDraftValue = string | boolean;

export type FieldDraftValues = Record<string, FieldDraftValue>;

export type FieldDraft = {
  version: string;
  /** ISO timestamp the draft was last written. */
  savedAt: string;
  /**
   * The server row's updated_at at the moment the draft was captured. A
   * different current token means the readings on file changed underneath it.
   */
  serverStateToken: string | null;
  /**
   * ISO timestamp of the Save that these values were handed to, or null if they
   * have not been submitted since they were last edited.
   *
   * Set at submit rather than deleted at submit: a save can still fail on the
   * way out, and the draft is the only copy of the reading until the server
   * confirms it landed.
   */
  submittedAt: string | null;
  values: FieldDraftValues;
};

/**
 * Storage key for one form.
 *
 * The user id is in the key on purpose: raters share tablets, and one login's
 * unsaved readings must never appear under another's.
 */
export function buildFieldDraftKey(params: {
  internalUserId: string;
  jobId: string;
  formScope: string;
}): string {
  const part = (value: unknown) => String(value ?? "").trim() || "unknown";
  return [
    FIELD_DRAFT_KEY_PREFIX,
    part(params.internalUserId),
    part(params.jobId),
    part(params.formScope),
  ].join(":");
}

export function isFieldDraftKey(key: unknown): boolean {
  return String(key ?? "").startsWith(`${FIELD_DRAFT_KEY_PREFIX}:`);
}

/**
 * A draft this build can no longer read: written by an older format version.
 *
 * Bumping the version orphans those entries — they no longer match any key this
 * code looks up, so nothing would ever reap them. They get swept on the next
 * prune instead of sitting on the device until the tech clears their browser.
 */
export function isSupersededFieldDraftKey(key: unknown): boolean {
  const value = String(key ?? "");
  return value.startsWith(`${FIELD_DRAFT_KEY_NAMESPACE}:`) && !isFieldDraftKey(value);
}

/** A field as read from (or written back to) the DOM. */
export type FieldDraftSnapshot = {
  name: string;
  value: string;
  /** Present for checkbox/radio; absent for text/number/select/textarea. */
  checked?: boolean;
  type?: string;
};

function isCheckableType(type: unknown): boolean {
  const normalized = String(type ?? "").toLowerCase();
  return normalized === "checkbox" || normalized === "radio";
}

/**
 * Field types a draft must never capture or restore.
 *
 * Hidden inputs are the important one: they carry server-issued identity
 * (job_id, test_run_id, system_id, CSRF-ish tokens) that the tech never typed.
 * Capturing them means a stale draft could later write an old run id back into
 * the form and post readings against the wrong row. The rest cannot be
 * meaningfully restored (file) or are not data (submit/button/password).
 */
export const NON_DRAFTABLE_FIELD_TYPES = new Set([
  "hidden",
  "file",
  "submit",
  "button",
  "reset",
  "image",
  "password",
]);

export function isDraftableFieldType(type: unknown): boolean {
  return !NON_DRAFTABLE_FIELD_TYPES.has(String(type ?? "").toLowerCase());
}

/**
 * Collapse captured fields into storable values.
 *
 * Unnamed fields and the non-draftable types above are skipped — a draft is for
 * typed readings, not for identity or the act of submitting. Unchecked radios
 * are skipped so the last checked one in a group wins rather than the last
 * rendered.
 */
export function serializeDraftFields(fields: FieldDraftSnapshot[]): FieldDraftValues {
  const values: FieldDraftValues = {};
  for (const field of fields ?? []) {
    const name = String(field?.name ?? "").trim();
    if (!name) continue;
    const type = String(field?.type ?? "").toLowerCase();
    if (!isDraftableFieldType(type)) continue;
    if (isCheckableType(type)) {
      if (type === "radio" && !field.checked) continue;
      values[name] = type === "radio" ? String(field.value ?? "") : Boolean(field.checked);
      continue;
    }
    values[name] = String(field?.value ?? "");
  }
  return values;
}

/** True when every stored value is empty — nothing worth offering to restore. */
export function isDraftEmpty(values: FieldDraftValues | null | undefined): boolean {
  if (!values) return true;
  return Object.values(values).every((value) =>
    typeof value === "boolean" ? value === false : String(value ?? "").trim() === "",
  );
}

/**
 * True when the draft holds something the form does not already show.
 *
 * Drives both the "is this worth offering" decision and the hygiene rule: a
 * draft whose values are already rendered is redundant and gets deleted.
 */
export function draftDiffersFromCurrent(
  draftValues: FieldDraftValues | null | undefined,
  currentValues: FieldDraftValues | null | undefined,
): boolean {
  if (!draftValues) return false;
  const current = currentValues ?? {};
  return Object.entries(draftValues).some(([name, value]) => {
    if (!(name in current)) return true;
    const currentValue = current[name];
    if (typeof value === "boolean" || typeof currentValue === "boolean") {
      return Boolean(value) !== Boolean(currentValue);
    }
    return String(value ?? "").trim() !== String(currentValue ?? "").trim();
  });
}

/**
 * True when the draft holds a difference the tech could actually act on — a
 * value that disagrees with a field CURRENTLY on screen.
 *
 * Drives whether the restore banner appears. A draft value whose field is not
 * mounted (the measured-CFM box after an exemption hides the results section)
 * has nowhere to be restored to: offering it produces a banner that Restore
 * cannot clear, so it comes back on every render. Those values are kept —
 * losing a typed reading is worse — but they stay silent until their field is
 * back on screen.
 */
export function draftHasRestorableDifference(
  draftValues: FieldDraftValues | null | undefined,
  currentValues: FieldDraftValues | null | undefined,
): boolean {
  if (!draftValues) return false;
  const current = currentValues ?? {};
  const restorable: FieldDraftValues = {};
  for (const [name, value] of Object.entries(draftValues)) {
    if (name in current) restorable[name] = value;
  }
  return draftDiffersFromCurrent(restorable, current);
}

/**
 * Fold a fresh capture into what is already stored.
 *
 * `snapshot` is what the edited fields read RIGHT NOW; `retainNames` is every
 * field the tech has edited this session. A retained field that is no longer in
 * the DOM — the results box after an exemption unmounts it — keeps its stored
 * value instead of vanishing from the draft.
 */
export function mergeRetainedDraftValues(params: {
  stored: FieldDraftValues | null | undefined;
  snapshot: FieldDraftValues;
  retainNames: Iterable<string>;
}): FieldDraftValues {
  const merged: FieldDraftValues = { ...params.snapshot };
  const stored = params.stored ?? {};
  for (const name of params.retainNames) {
    if (name in merged) continue;
    if (name in stored) merged[name] = stored[name];
  }
  return merged;
}

/**
 * True when the readings on file changed after this draft was captured.
 *
 * A null token on either side means "unknown", which is not evidence of a
 * change — flagging every unknown would cry wolf on forms with no row yet.
 */
export function serverStateChangedSinceDraft(
  draft: Pick<FieldDraft, "serverStateToken"> | null | undefined,
  currentToken: string | null | undefined,
): boolean {
  const stored = String(draft?.serverStateToken ?? "").trim();
  const current = String(currentToken ?? "").trim();
  if (!stored || !current) return false;
  return stored !== current;
}

export function buildFieldDraft(params: {
  values: FieldDraftValues;
  serverStateToken: string | null;
  savedAt: string;
  submittedAt?: string | null;
}): FieldDraft {
  return {
    version: FIELD_DRAFT_VERSION,
    savedAt: params.savedAt,
    serverStateToken: String(params.serverStateToken ?? "").trim() || null,
    submittedAt: String(params.submittedAt ?? "").trim() || null,
    values: params.values,
  };
}

/**
 * True when this draft was handed to a Save that the server has since acted on.
 *
 * The proof that the save landed is the row's token moving: the draft was
 * submitted against token T and the form now renders token T'. Without that
 * movement the save may never have reached the server, and the draft is still
 * the only copy of the reading.
 */
export function draftWasSubmittedAndConfirmed(
  draft: Pick<FieldDraft, "serverStateToken" | "submittedAt"> | null | undefined,
  currentToken: string | null | undefined,
): boolean {
  if (!String(draft?.submittedAt ?? "").trim()) return false;
  return serverStateChangedSinceDraft(draft, currentToken);
}

/**
 * Parse a stored draft, returning null for anything unusable.
 *
 * Never throws. A corrupt entry, a value written by an older version, or
 * hand-edited storage must degrade to "no draft" — a thrown error here would
 * break the very page the tech is standing in an attic to fill out.
 */
export function parseStoredDraft(raw: string | null | undefined): FieldDraft | null {
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (String(parsed.version ?? "") !== FIELD_DRAFT_VERSION) return null;
  if (!parsed.values || typeof parsed.values !== "object" || Array.isArray(parsed.values)) return null;

  const values: FieldDraftValues = {};
  for (const [name, value] of Object.entries(parsed.values)) {
    if (typeof value === "string" || typeof value === "boolean") values[name] = value;
    else if (typeof value === "number" && Number.isFinite(value)) values[name] = String(value);
    // Anything else (objects, arrays, null) is dropped rather than restored.
  }

  const savedAt = String(parsed.savedAt ?? "").trim();
  if (!savedAt || Number.isNaN(new Date(savedAt).getTime())) return null;

  return {
    version: FIELD_DRAFT_VERSION,
    savedAt,
    serverStateToken: String(parsed.serverStateToken ?? "").trim() || null,
    submittedAt: String(parsed.submittedAt ?? "").trim() || null,
    values,
  };
}

export type StoredDraftIndexEntry = { key: string; savedAt: string };

/**
 * Which draft keys to delete on the next write: everything past the age limit,
 * then the oldest beyond the count cap.
 *
 * Age is checked before the cap so an old draft is evicted even on a device
 * holding only a handful.
 */
export function selectDraftKeysToEvict(
  entries: StoredDraftIndexEntry[],
  options: { now: number; keepKey?: string; maxEntries?: number; maxAgeMs?: number },
): string[] {
  const maxEntries = options.maxEntries ?? FIELD_DRAFT_MAX_ENTRIES;
  const maxAgeMs = options.maxAgeMs ?? FIELD_DRAFT_MAX_AGE_MS;
  const keepKey = String(options.keepKey ?? "");

  const timestamped = (entries ?? [])
    .filter((entry) => entry && isFieldDraftKey(entry.key))
    .map((entry) => {
      const parsed = new Date(entry.savedAt ?? "").getTime();
      // An unreadable timestamp sorts oldest so it is evicted first.
      return { key: entry.key, at: Number.isFinite(parsed) ? parsed : 0 };
    });

  const evict = new Set<string>();
  for (const entry of timestamped) {
    if (entry.key === keepKey) continue;
    if (options.now - entry.at > maxAgeMs) evict.add(entry.key);
  }

  const survivors = timestamped
    .filter((entry) => !evict.has(entry.key))
    .sort((a, b) => b.at - a.at);
  for (const entry of survivors.slice(Math.max(1, maxEntries))) {
    if (entry.key === keepKey) continue;
    evict.add(entry.key);
  }

  return [...evict];
}

/** "2 minutes ago" — deliberately coarse; the tech needs recency, not precision. */
export function formatDraftAge(savedAt: string, now: number): string {
  const at = new Date(savedAt ?? "").getTime();
  if (!Number.isFinite(at)) return "a moment ago";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
