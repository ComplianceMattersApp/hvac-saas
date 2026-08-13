import { describe, expect, it } from "vitest";

import {
  FIELD_DRAFT_KEY_PREFIX,
  FIELD_DRAFT_MAX_AGE_MS,
  buildFieldDraft,
  buildFieldDraftKey,
  draftDiffersFromCurrent,
  formatDraftAge,
  isDraftEmpty,
  isFieldDraftKey,
  parseStoredDraft,
  selectDraftKeysToEvict,
  serializeDraftFields,
  serverStateChangedSinceDraft,
} from "@/lib/field-drafts/form-drafts";

describe("buildFieldDraftKey", () => {
  it("scopes a draft to one user, job, and form", () => {
    expect(
      buildFieldDraftKey({ internalUserId: "user-1", jobId: "job-9", formScope: "test-run:run-3" }),
    ).toBe(`${FIELD_DRAFT_KEY_PREFIX}:user-1:job-9:test-run:run-3`);
  });

  it("keeps two users on a shared tablet apart", () => {
    const a = buildFieldDraftKey({ internalUserId: "user-1", jobId: "job-9", formScope: "test-run:r" });
    const b = buildFieldDraftKey({ internalUserId: "user-2", jobId: "job-9", formScope: "test-run:r" });
    expect(a).not.toBe(b);
  });

  it("never produces a blank segment that could collide", () => {
    const key = buildFieldDraftKey({ internalUserId: "", jobId: "job-9", formScope: "test-run:r" });
    expect(key).toContain(":unknown:");
  });

  it("recognizes its own keys and ignores others", () => {
    expect(isFieldDraftKey(`${FIELD_DRAFT_KEY_PREFIX}:u:j:s`)).toBe(true);
    expect(isFieldDraftKey("some-other-app-key")).toBe(false);
    expect(isFieldDraftKey(null)).toBe(false);
  });
});

describe("serializeDraftFields", () => {
  it("captures text, number, select, and textarea values", () => {
    expect(
      serializeDraftFields([
        { name: "measured_cfm", value: "418", type: "number" },
        { name: "notes", value: "attic supply", type: "textarea" },
        { name: "method", value: "pressurization", type: "select-one" },
      ]),
    ).toEqual({ measured_cfm: "418", notes: "attic supply", method: "pressurization" });
  });

  it("stores checkbox state as a boolean", () => {
    expect(
      serializeDraftFields([
        { name: "verified", value: "1", type: "checkbox", checked: true },
        { name: "exempt", value: "1", type: "checkbox", checked: false },
      ]),
    ).toEqual({ verified: true, exempt: false });
  });

  it("keeps only the checked radio in a group", () => {
    expect(
      serializeDraftFields([
        { name: "result", value: "pass", type: "radio", checked: false },
        { name: "result", value: "fail", type: "radio", checked: true },
      ]),
    ).toEqual({ result: "fail" });
  });

  it("skips fields that cannot or should not be restored", () => {
    expect(
      serializeDraftFields([
        { name: "", value: "orphan", type: "text" },
        { name: "photo", value: "C:/fake", type: "file" },
        { name: "go", value: "Save", type: "submit" },
        { name: "cfm", value: "300", type: "number" },
      ]),
    ).toEqual({ cfm: "300" });
  });
});

describe("isDraftEmpty", () => {
  it("treats blank strings and unchecked boxes as nothing to restore", () => {
    expect(isDraftEmpty({ a: "", b: "   ", c: false })).toBe(true);
    expect(isDraftEmpty({})).toBe(true);
    expect(isDraftEmpty(null)).toBe(true);
  });

  it("counts any real value", () => {
    expect(isDraftEmpty({ a: "", c: true })).toBe(false);
    expect(isDraftEmpty({ a: "0" })).toBe(false);
  });
});

describe("draftDiffersFromCurrent", () => {
  it("is false when the form already shows the drafted values", () => {
    expect(draftDiffersFromCurrent({ cfm: "418", ok: true }, { cfm: "418", ok: true })).toBe(false);
  });

  it("is true for a changed value, a new field, or a flipped checkbox", () => {
    expect(draftDiffersFromCurrent({ cfm: "418" }, { cfm: "400" })).toBe(true);
    expect(draftDiffersFromCurrent({ cfm: "418" }, {})).toBe(true);
    expect(draftDiffersFromCurrent({ ok: true }, { ok: false })).toBe(true);
  });

  it("ignores whitespace-only differences", () => {
    expect(draftDiffersFromCurrent({ notes: " attic " }, { notes: "attic" })).toBe(false);
  });
});

describe("serverStateChangedSinceDraft", () => {
  it("flags a draft taken against older server data", () => {
    expect(
      serverStateChangedSinceDraft({ serverStateToken: "2026-08-01T00:00:00Z" }, "2026-08-02T00:00:00Z"),
    ).toBe(true);
  });

  it("does not flag a matching token", () => {
    expect(
      serverStateChangedSinceDraft({ serverStateToken: "2026-08-01T00:00:00Z" }, "2026-08-01T00:00:00Z"),
    ).toBe(false);
  });

  it("treats an unknown token on either side as no evidence of change", () => {
    expect(serverStateChangedSinceDraft({ serverStateToken: null }, "2026-08-02T00:00:00Z")).toBe(false);
    expect(serverStateChangedSinceDraft({ serverStateToken: "t" }, null)).toBe(false);
    expect(serverStateChangedSinceDraft(null, "t")).toBe(false);
  });
});

describe("parseStoredDraft", () => {
  const draft = buildFieldDraft({
    values: { cfm: "418", ok: true },
    serverStateToken: "2026-08-01T00:00:00Z",
    savedAt: "2026-08-12T10:00:00.000Z",
  });

  it("round-trips a draft it wrote", () => {
    expect(parseStoredDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("returns null rather than throwing on corrupt storage", () => {
    // A thrown error here would break the page a tech is standing in an attic
    // to fill out, so every one of these must degrade to "no draft".
    expect(parseStoredDraft("{not json")).toBeNull();
    expect(parseStoredDraft("null")).toBeNull();
    expect(parseStoredDraft("[]")).toBeNull();
    expect(parseStoredDraft('"a string"')).toBeNull();
    expect(parseStoredDraft("")).toBeNull();
    expect(parseStoredDraft(null)).toBeNull();
  });

  it("discards an entry written by a different schema version", () => {
    expect(parseStoredDraft(JSON.stringify({ ...draft, version: "v0" }))).toBeNull();
  });

  it("discards an entry with no usable timestamp", () => {
    expect(parseStoredDraft(JSON.stringify({ ...draft, savedAt: "not-a-date" }))).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ ...draft, savedAt: "" }))).toBeNull();
  });

  it("drops values it cannot restore but keeps the rest", () => {
    const parsed = parseStoredDraft(
      JSON.stringify({ ...draft, values: { cfm: "418", junk: { a: 1 }, list: [1], n: 42, empty: null } }),
    );
    expect(parsed?.values).toEqual({ cfm: "418", n: "42" });
  });

  it("rejects a missing or non-object values bag", () => {
    expect(parseStoredDraft(JSON.stringify({ ...draft, values: undefined }))).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ ...draft, values: [] }))).toBeNull();
  });
});

describe("selectDraftKeysToEvict", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const key = (n: number) => `${FIELD_DRAFT_KEY_PREFIX}:u:j:form-${n}`;

  it("evicts anything past the age limit", () => {
    const evicted = selectDraftKeysToEvict(
      [
        { key: key(1), savedAt: at(FIELD_DRAFT_MAX_AGE_MS + 60_000) },
        { key: key(2), savedAt: at(60_000) },
      ],
      { now },
    );
    expect(evicted).toEqual([key(1)]);
  });

  it("evicts the oldest beyond the count cap", () => {
    const entries = Array.from({ length: 5 }, (_unused, index) => ({
      key: key(index),
      savedAt: at(index * 1000),
    }));
    const evicted = selectDraftKeysToEvict(entries, { now, maxEntries: 3 });
    // Newest three survive; the two oldest go.
    expect(evicted.sort()).toEqual([key(3), key(4)].sort());
  });

  it("never evicts the draft being written", () => {
    const entries = Array.from({ length: 5 }, (_unused, index) => ({
      key: key(index),
      savedAt: at((index + 1) * 1000),
    }));
    const evicted = selectDraftKeysToEvict(entries, { now, maxEntries: 2, keepKey: key(4) });
    expect(evicted).not.toContain(key(4));
  });

  it("evicts an entry whose timestamp is unreadable", () => {
    const evicted = selectDraftKeysToEvict([{ key: key(1), savedAt: "garbage" }], { now });
    expect(evicted).toEqual([key(1)]);
  });

  it("ignores keys belonging to other features", () => {
    const evicted = selectDraftKeysToEvict(
      [{ key: "unrelated-key", savedAt: at(FIELD_DRAFT_MAX_AGE_MS * 10) }],
      { now },
    );
    expect(evicted).toEqual([]);
  });
});

describe("formatDraftAge", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("reads as recency, not precision", () => {
    expect(formatDraftAge(ago(5_000), now)).toBe("just now");
    expect(formatDraftAge(ago(60_000), now)).toBe("1 minute ago");
    expect(formatDraftAge(ago(120_000), now)).toBe("2 minutes ago");
    expect(formatDraftAge(ago(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(formatDraftAge(ago(2 * 86_400_000), now)).toBe("2 days ago");
  });

  it("never throws on a bad timestamp", () => {
    expect(formatDraftAge("nonsense", now)).toBe("a moment ago");
  });
});
