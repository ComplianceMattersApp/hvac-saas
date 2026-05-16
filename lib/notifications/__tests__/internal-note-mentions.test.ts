import { describe, expect, it } from "vitest";
import {
  findActiveMentionToken,
  insertMentionAtCaret,
  removeMentionFromText,
} from "@/lib/notifications/internal-note-mentions";

describe("internal note mention helpers", () => {
  it("finds the active @mention token at the caret", () => {
    const result = findActiveMentionToken("Please review @Ed", "Please review @Ed".length);

    expect(result).toEqual({
      start: 14,
      end: 17,
      query: "Ed",
    });
  });

  it("inserts a mention cleanly at the caret", () => {
    const result = insertMentionAtCaret({
      text: "Please review @Ed",
      caretPosition: "Please review @Ed".length,
      displayName: "Eddie Rivera",
    });

    expect(result.text).toBe("Please review @Eddie Rivera ");
    expect(result.caretPosition).toBe(result.text.length);
  });

  it("removes a mention chip from the note text", () => {
    const result = removeMentionFromText({
      text: "Please review @Eddie Rivera before noon.",
      displayName: "Eddie Rivera",
    });

    expect(result).toBe("Please review before noon.");
  });
});
