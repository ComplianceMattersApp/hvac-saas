import { describe, expect, it } from "vitest";

import {
  canRenderProposalEmailControls,
  resolveProposalEmailNotice,
} from "@/app/estimates/[id]/proposal-email-ui";

describe("proposal email UI helpers", () => {
  it("renders controls only for sent status", () => {
    expect(canRenderProposalEmailControls("sent")).toBe(true);
    expect(canRenderProposalEmailControls("draft")).toBe(false);
    expect(canRenderProposalEmailControls("approved")).toBe(false);
    expect(canRenderProposalEmailControls("declined")).toBe(false);
    expect(canRenderProposalEmailControls("expired")).toBe(false);
    expect(canRenderProposalEmailControls("cancelled")).toBe(false);
    expect(canRenderProposalEmailControls("converted")).toBe(false);
  });

  it("returns safe recipient-required notice", () => {
    const notice = resolveProposalEmailNotice({
      success: false,
      error: "Recipient email is required.",
      code: "recipient_required",
    });

    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe("Recipient email is required.");
  });

  it("returns safe invalid-recipient notice", () => {
    const notice = resolveProposalEmailNotice({
      success: false,
      error: "Recipient email is not a valid email address.",
      code: "recipient_invalid",
    });

    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe("Enter a valid recipient email address.");
  });

  it("returns safe feature-disabled warning for blocked attempts", () => {
    const notice = resolveProposalEmailNotice({
      success: true,
      error: null,
      attemptStatus: "blocked",
      emailDisabled: true,
    });

    expect(notice?.tone).toBe("warning");
    expect(notice?.message).toContain("Email delivery must be enabled");
    expect(notice?.message).toContain("copy the proposal link");
  });

  it("returns success notice for accepted sends", () => {
    const notice = resolveProposalEmailNotice({
      success: true,
      error: null,
      attemptStatus: "accepted",
      emailDisabled: false,
    });

    expect(notice?.tone).toBe("success");
    expect(notice?.message).toContain("Proposal email sent");
    expect(notice?.message).not.toContain("payment");
    expect(notice?.message).not.toContain("invoice");
  });

  it("returns safe retry notice for failed sends", () => {
    const notice = resolveProposalEmailNotice({
      success: true,
      error: null,
      attemptStatus: "failed",
      emailDisabled: false,
    });

    expect(notice?.tone).toBe("error");
    expect(notice?.message).toContain("Unable to send proposal email right now");
  });

  it("never surfaces raw token or token hash from error payload", () => {
    const notice = resolveProposalEmailNotice({
      success: false,
      error: "provider failed token_hash=abc raw_token=secret",
      code: "unknown",
    });

    expect(notice?.tone).toBe("error");
    expect(notice?.message).not.toContain("raw_token");
    expect(notice?.message).not.toContain("token_hash");
    expect(notice?.message).toContain("Unable to send proposal email right now");
  });
});
