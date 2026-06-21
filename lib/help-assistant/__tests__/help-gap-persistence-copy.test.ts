import { describe, expect, it } from "vitest";
import {
  getHelpGapFeedbackMessage,
  resolveHelpGapPersistenceStatus,
} from "../help-gap-persistence-copy";

describe("help gap persistence UI copy", () => {
  it("shows local-only copy when persistence is disabled or fails", () => {
    expect(resolveHelpGapPersistenceStatus({ ok: false, reason: "disabled" })).toBe("local_only");
    expect(resolveHelpGapPersistenceStatus({ ok: false, reason: "insert_failed" })).toBe("local_only");

    expect(
      getHelpGapFeedbackMessage({ eventType: "not_helpful", status: "local_only" }),
    ).toBe(
      "Marked locally for this session. This is the kind of question we should improve. No support case was created.",
    );
    expect(
      getHelpGapFeedbackMessage({ eventType: "still_need_help", status: "local_only" }),
    ).toBe(
      "Marked locally for this session. No support case was created. Contact support if this is blocking your work.",
    );
  });

  it("shows saved copy only after successful persistence", () => {
    expect(resolveHelpGapPersistenceStatus({ ok: true })).toBe("saved");
    expect(getHelpGapFeedbackMessage({ eventType: "unknown_answer", status: "saved" })).toBe(
      "Thanks - this helps us improve training and support. No support case was created.",
    );
    expect(getHelpGapFeedbackMessage({ eventType: "not_helpful", status: "saved" })).toBe(
      "Thanks - this helps us improve training and support. No support case was created.",
    );
    expect(getHelpGapFeedbackMessage({ eventType: "still_need_help", status: "saved" })).toBe(
      "Thanks - this helps us see where users need support. No support case was created. Contact support if this is blocking your work.",
    );
  });

  it("does not imply support notification, follow-up, AI training, or case creation", () => {
    const allCopy = [
      getHelpGapFeedbackMessage({ eventType: "unknown_answer", status: "saved" }),
      getHelpGapFeedbackMessage({ eventType: "not_helpful", status: "saved" }),
      getHelpGapFeedbackMessage({ eventType: "still_need_help", status: "saved" }),
      getHelpGapFeedbackMessage({ eventType: "unknown_answer", status: "local_only" }),
      getHelpGapFeedbackMessage({ eventType: "not_helpful", status: "local_only" }),
      getHelpGapFeedbackMessage({ eventType: "still_need_help", status: "local_only" }),
    ].join("\n");

    expect(allCopy).not.toContain("Support has been notified");
    expect(allCopy).not.toContain("A case was created");
    expect(allCopy).not.toContain("We will follow up");
    expect(allCopy).not.toContain("AI training");
  });
});
