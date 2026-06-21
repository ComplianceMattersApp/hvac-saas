import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  resolve(__dirname, "../../../app/ops/admin/help-gaps/page.tsx"),
  "utf8",
);
const adminPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/admin/page.tsx"),
  "utf8",
);

describe("help gap review route wiring", () => {
  it("uses the read-only help gap review read model", () => {
    expect(routeSource).toContain("listHelpGapReviewQueue");
    expect(routeSource).toContain("@/lib/help-assistant/help-gap-review-read-model");
    expect(routeSource).toContain("Help Gap Review");
    expect(routeSource).toContain("No support case is created from this page");
  });

  it("does not import support-case, support-console, assistant mutation, or provider paths", () => {
    expect(routeSource).not.toMatch(/support-case-actions|support_cases|support_case_notes/);
    expect(routeSource).not.toMatch(/support_access_sessions|support_account_grants|ENABLE_SUPPORT_CONSOLE/);
    expect(routeSource).not.toMatch(/persistHelpGapEventFromAssistantAction|help-gap-actions/);
    expect(routeSource).not.toMatch(/OpenAI|openai|analytics|stripe|payment/i);
  });

  it("exposes only review status controls as mutation forms", () => {
    expect(routeSource).not.toContain('"use server"');
    expect(routeSource).not.toContain("'use server'");
    expect(routeSource).toContain("updateHelpGapReviewStatusFromForm");
    expect(routeSource).toContain("HELP_GAP_REVIEW_ACTION_STATUSES");
    expect(routeSource).toContain("Review status is for product/support triage only. It does not create a support case.");
    expect(routeSource).toContain("reviewed");
    expect(routeSource).toContain("product_backlog");
    expect(routeSource).toContain("bug_candidate");
    expect(routeSource).toContain("converted_to_help_article");
    expect(routeSource).toContain("dismissed");
    expect(routeSource).not.toContain("linked_to_support_case");
    expect(routeSource).not.toMatch(/formAction/);
    expect(routeSource).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(routeSource).toContain('method="get"');
  });

  it("does not show unsafe raw field labels in the review UI source", () => {
    expect(routeSource).not.toMatch(/account_owner_user_id|internal_user_id|raw_stripe|payload dump/i);
    expect(routeSource).not.toMatch(/customer id|job id|invoice id|subscription id|payment method/i);
  });

  it("adds the Admin Center link only behind the review queue flag", () => {
    expect(adminPageSource).toContain("isHelpGapReviewQueueEnabled");
    expect(adminPageSource).toContain('href: "/ops/admin/help-gaps"');
    expect(adminPageSource).toContain('title: "Help Gap Review"');
    expect(adminPageSource.indexOf("isHelpGapReviewQueueEnabled()")).toBeLessThan(
      adminPageSource.indexOf('href: "/ops/admin/help-gaps"'),
    );
  });
});
