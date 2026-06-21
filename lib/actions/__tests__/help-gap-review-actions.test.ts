import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateHelpGapReviewStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

vi.mock("@/lib/help-assistant/help-gap-review-status", () => ({
  updateHelpGapReviewStatus: (...args: unknown[]) =>
    mocks.updateHelpGapReviewStatus(...args),
}));

import {
  updateHelpGapReviewStatusAction,
  updateHelpGapReviewStatusFromForm,
} from "../help-gap-review-actions";

describe("help gap review server action", () => {
  it("returns safe results and revalidates the review route on success", async () => {
    mocks.updateHelpGapReviewStatus.mockResolvedValueOnce({ ok: true });

    const result = await updateHelpGapReviewStatusAction({
      eventId: "gap-1",
      reviewStatus: "reviewed",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.updateHelpGapReviewStatus).toHaveBeenCalledWith({
      eventId: "gap-1",
      reviewStatus: "reviewed",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ops/admin/help-gaps");
  });

  it("passes form values to the status action for route controls", async () => {
    mocks.updateHelpGapReviewStatus.mockResolvedValueOnce({ ok: true });
    mocks.revalidatePath.mockClear();
    const formData = new FormData();
    formData.set("event_id", "gap-1");
    formData.set("review_status", "reviewed");

    const result = await updateHelpGapReviewStatusFromForm(formData);

    expect(result).toBeUndefined();
    expect(mocks.updateHelpGapReviewStatus).toHaveBeenCalledWith({
      eventId: "gap-1",
      reviewStatus: "reviewed",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ops/admin/help-gaps");
  });

  it("does not revalidate when the helper fails closed", async () => {
    mocks.revalidatePath.mockClear();
    mocks.updateHelpGapReviewStatus.mockResolvedValueOnce({
      ok: false,
      reason: "unauthorized",
    });
    const formData = new FormData();
    formData.set("event_id", "gap-1");
    formData.set("review_status", "dismissed");

    const result = await updateHelpGapReviewStatusAction({
      eventId: formData.get("event_id"),
      reviewStatus: formData.get("review_status"),
    });

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not import support-case, provider, analytics, payment, or service-role paths", () => {
    const source = readFileSync(resolve(__dirname, "../help-gap-review-actions.ts"), "utf8");

    expect(source).toContain("updateHelpGapReviewStatus");
    expect(source).not.toMatch(/support-case-actions|support_cases|support_case_notes/);
    expect(source).not.toMatch(/support_access_sessions|support_account_grants|ENABLE_SUPPORT_CONSOLE/);
    expect(source).not.toMatch(/createAdminClient|service_role/);
    expect(source).not.toMatch(/OpenAI|openai|analytics|stripe|payment/i);
  });
});
