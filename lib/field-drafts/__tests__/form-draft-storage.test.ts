import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteDraft, readDraft, writeDraft } from "@/lib/field-drafts/form-draft-storage";
import { FIELD_DRAFT_KEY_PREFIX, FIELD_DRAFT_MAX_AGE_MS } from "@/lib/field-drafts/form-drafts";

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
  return JSON.stringify({ version: "v1", savedAt, serverStateToken: "t1", values });
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
    expect(parsed).toMatchObject({ version: "v1", serverStateToken: "t9", values: { cfm: "418" } });
    expect(parsed.savedAt).toBe("2026-08-12T10:00:00.000Z");
  });

  it("evicts drafts past the age limit on write", () => {
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    const stale = new Date(now - FIELD_DRAFT_MAX_AGE_MS - 60_000).toISOString();
    const { map } = installStorage({ [otherKey(2)]: storedDraft(stale) });

    writeDraft({ key: KEY, values: { cfm: "1" }, serverStateToken: null, now });

    expect(map.has(otherKey(2))).toBe(false);
    expect(map.has(KEY)).toBe(true);
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

    // The newest reading survives; the oldest draft was sacrificed for it.
    expect(map.has(KEY)).toBe(true);
    expect(map.has(otherKey(3))).toBe(false);
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
