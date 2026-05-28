import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf8",
);

describe("internal invoice workspace failed autopay retry wiring", () => {
  it("wires retry saved card affordance with webhook-confirmed payment copy", () => {
    expect(source).toContain("retryFailedScheduledAutopayAttemptFromForm");
    expect(source).toContain("Retry saved card");
    expect(source).toContain("This will attempt the saved payment method again. Payment is only recorded after Stripe confirms it through webhook.");
    expect(source).toContain("manual_retry_from_invoice_workspace");
  });

  it("keeps retry affordance guarded by financial authorization and current retry eligibility", () => {
    expect(source).toContain("canManageFinancialInvoiceLifecycle");
    expect(source).toContain("failedAutopayRetryEligibility");
    expect(source).toContain("canShowFailedAutopayRetryControl");
  });
});
