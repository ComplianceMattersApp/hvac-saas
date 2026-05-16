import { describe, expect, it } from "vitest";
import { buildNotePreview, normalizeTaggedUserIds } from "@/lib/notifications/internal-note-tagging";

describe("internal-note-tagging helpers", () => {
  it("normalizes and dedupes tagged user ids", () => {
    const result = normalizeTaggedUserIds([
      " user-1 ",
      "",
      null,
      "user-2",
      "user-1",
      " user-3 ",
      "user-2",
    ]);

    expect(result).toEqual(["user-1", "user-2", "user-3"]);
  });

  it("builds a safe preview for note context", () => {
    const result = buildNotePreview("  Need   customer callback before 5pm.  ");
    expect(result).toBe("Need customer callback before 5pm.");
  });

  it("truncates long note preview", () => {
    const text = "a".repeat(150);
    const result = buildNotePreview(text, 100);
    expect(result).toHaveLength(103);
    expect(result.endsWith("...")).toBe(true);
  });
});
