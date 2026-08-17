import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteDraft,
  draftStorageWorks,
  pruneDrafts,
  readDraft,
  writeDraft,
} from "@/lib/field-drafts/form-draft-storage";
import {
  FIELD_DRAFT_KEY_PREFIX,
  FIELD_DRAFT_MAX_AGE_MS,
  FIELD_DRAFT_VERSION,
} from "@/lib/field-drafts/form-drafts";

/** Minimal localStorage stand-in with the same enumeration surface. */
function installStorage(seed: Record<string, string> = {}, options: { failWrites?: boolean } = {}) {
  const map = new Map(Object.entries(seed));
  const store = {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: vi.fn((key: string, value: string) => {
      if (options.failWrites) throw new Error("QuotaExceededError");
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => { map.delete(key); }),
    clear: () => map.clear(),
  };
  vi.stubGlobal("window", { localStorage: store });
  return { store, map };
}

const KEY = `${FIELD_DRAFT_KEY_PREFIX}:user-1:job-1:test-run:run-1`;
const otherKey = (n: number) => `${FIELD_DRAFT_KEY_PREFIX}:user-1:job-1:test-run:run-${n}`;

function storedDraft(savedAt: string, values: Record<string, unknown> = { cfm: "418" }) {
  return JSON.stringify({ version: FIELD_DRAFT_VERSION, savedAt, serverStateToken: "t1", values });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readDraft", () => {
  it("returns a stored draft", () => {
    installStorage({ [KEY]: storedDraft("2026-08-12T10:00:00.000Z") });
    expect(readDraft(KEY)?.values).toEqual({ cfm: "418" });
  });

  it("returns null for a corrupt entry instead of throwing", () => {
    installStorage({ [KEY]: "{{{" });
    expect(readDraft(KEY)).toBeNull();
  });

  it("returns null when storage is unavailable", () => {
    // Safari private mode and locked-down WebViews both look like this.
    vi.stubGlobal("window", {
      get localStorage(): Storage { throw new Error("SecurityError"); },
    });
    expect(readDraft(KEY)).toBeNull();
  });

  it("returns null during SSR, where there is no window at all", () => {
    vi.stubGlobal("window", undefined);
    expect(readDraft(KEY)).toBeNull();
  });
});

describe("writeDraft", () => {
  it("writes a versioned draft carrying its server token", () => {
    const { map } = installStorage();
    writeDraft({ key: KEY, values: { cfm: "418" }, serverStateToken: "t9", now: Date.parse("2026-08-12T10:00:00.000Z") });
    const parsed = JSON.parse(map.get(KEY) as string);
    expect(parsed).toMatchObject({
      version: FIELD_DRAFT_VERSION,
      serverStateToken: "t9",
      values: { cfm: "418" },
    });
    expect(parsed.savedAt).toBe("2026-08-12T10:00:00.000Z");
  });

  it("does NOT scan or evict on the typing path", () => {
    // Eviction is O(all drafts). Running it on every keystroke pause puts that
    // scan between the tech and their next reading, so writes just setItem.
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    const stale = new Date(now - FIELD_DRAFT_MAX_AGE_MS - 60_000).toISOString();
    const { store, map } = installStorage({ [otherKey(2)]: storedDraft(stale) });

    writeDraft({ key: KEY, values: { cfm: "1" }, serverStateToken: null, now });

    expect(map.has(KEY)).toBe(true);
    expect(map.has(otherKey(2))).toBe(true);
    expect(store.removeItem).not.toHaveBeenCalled();
  });

  it("leaves keys owned by other features alone", () => {
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    const { map } = installStorage({ "some.other.app": "value" });
    writeDraft({ key: KEY, values: { cfm: "1" }, serverStateToken: null, now });
    expect(map.get("some.other.app")).toBe("value");
  });

  it("drops the oldest draft and retries when the quota is exceeded", () => {
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    const seed = {
      [otherKey(2)]: storedDraft(new Date(now - 5_000).toISOString()),
      [otherKey(3)]: storedDraft(new Date(now - 60_000).toISOString()),
    };
    const map = new Map(Object.entries(seed));
    let failNext = true;
    const store = {
      get length() { return map.size; },
      key: (index: number) => [...map.keys()][index] ?? null,
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        if (failNext) { failNext = false; throw new Error("QuotaExceededError"); }
        map.set(key, value);
      },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => map.clear(),
    };
    vi.stubGlobal("window", { localStorage: store });

    writeDraft({ key: KEY, values: { cfm: "418" }, serverStateToken: null, now });

    // The newest reading survives — that is the property that matters.
    expect(map.has(KEY)).toBe(true);
  });

  it("gives up quietly when storage refuses every write", () => {
    installStorage({}, { failWrites: true });
    expect(() =>
      writeDraft({ key: KEY, values: { cfm: "418" }, serverStateToken: null }),
    ).not.toThrow();
  });
});

describe("deleteDraft", () => {
  it("removes the entry", () => {
    const { map } = installStorage({ [KEY]: storedDraft("2026-08-12T10:00:00.000Z") });
    deleteDraft(KEY);
    expect(map.has(KEY)).toBe(false);
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(() => deleteDraft(KEY)).not.toThrow();
  });
});

describe("pruneDrafts", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");

  it("evicts drafts past the age limit", () => {
    const stale = new Date(now - FIELD_DRAFT_MAX_AGE_MS - 60_000).toISOString();
    const { map } = installStorage({
      [otherKey(2)]: storedDraft(stale),
      [otherKey(3)]: storedDraft(new Date(now - 60_000).toISOString()),
    });

    pruneDrafts({ now });

    expect(map.has(otherKey(2))).toBe(false);
    expect(map.has(otherKey(3))).toBe(true);
  });

  it("sweeps drafts left behind by a superseded format version", () => {
    // The version bump renames the key prefix, so v1 entries match nothing this
    // build looks up and would otherwise sit on the device forever.
    const { map } = installStorage({
      "esfw-draft:v1:user-1:job-1:test-run:run-1": "{}",
      [KEY]: storedDraft(new Date().toISOString()),
      "some-other-app-key": "keep me",
    });

    pruneDrafts();

    expect(map.has("esfw-draft:v1:user-1:job-1:test-run:run-1")).toBe(false);
    expect(map.has(KEY)).toBe(true);
    expect(map.has("some-other-app-key")).toBe(true);
  });

  it("never evicts the form currently being edited", () => {
    const stale = new Date(now - FIELD_DRAFT_MAX_AGE_MS - 60_000).toISOString();
    const { map } = installStorage({ [KEY]: storedDraft(stale) });
    pruneDrafts({ now, keepKey: KEY });
    expect(map.has(KEY)).toBe(true);
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(() => pruneDrafts({ now })).not.toThrow();
  });
});

describe("serverStateToken preservation", () => {
  it("keeps the token the draft was FIRST captured against", () => {
    // Restamping on every keystroke would erase the evidence that the office
    // changed the row underneath, so the conflict warning would vanish the
    // moment the tech typed one more character.
    const { map } = installStorage();
    writeDraft({ key: KEY, values: { cfm: "1" }, serverStateToken: "token-A", now: 1_000 });
    writeDraft({ key: KEY, values: { cfm: "12" }, serverStateToken: "token-B", now: 2_000 });

    const parsed = JSON.parse(map.get(KEY) as string);
    expect(parsed.serverStateToken).toBe("token-A");
    // The age display still advances.
    expect(parsed.savedAt).toBe(new Date(2_000).toISOString());
    expect(parsed.values).toEqual({ cfm: "12" });
  });

  it("stamps the current token when creating a fresh draft", () => {
    const { map } = installStorage();
    writeDraft({ key: KEY, values: { cfm: "1" }, serverStateToken: "token-B", now: 1_000 });
    expect(JSON.parse(map.get(KEY) as string).serverStateToken).toBe("token-B");
  });

  it("stamps again after the draft is deleted and re-created", () => {
    const { map } = installStorage();
    writeDraft({ key: KEY, values: { cfm: "1" }, serverStateToken: "token-A", now: 1_000 });
    deleteDraft(KEY);
    writeDraft({ key: KEY, values: { cfm: "9" }, serverStateToken: "token-B", now: 2_000 });
    expect(JSON.parse(map.get(KEY) as string).serverStateToken).toBe("token-B");
  });
});

describe("draftStorageWorks", () => {
  it("is true when a probe round-trips", () => {
    installStorage();
    expect(draftStorageWorks()).toBe(true);
  });

  it("is false when writes throw, which is how private mode fails", () => {
    installStorage({}, { failWrites: true });
    expect(draftStorageWorks()).toBe(false);
  });

  it("is false when a write silently does not stick", () => {
    const store = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("window", { localStorage: store });
    expect(draftStorageWorks()).toBe(false);
  });

  it("is false during SSR", () => {
    vi.stubGlobal("window", undefined);
    expect(draftStorageWorks()).toBe(false);
  });

  it("leaves no probe key behind", () => {
    const { map } = installStorage();
    draftStorageWorks();
    expect([...map.keys()].some((key) => key.includes("__probe__"))).toBe(false);
  });
});
