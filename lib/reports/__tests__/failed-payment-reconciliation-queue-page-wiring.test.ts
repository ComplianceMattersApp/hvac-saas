import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const queuePageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/failed-payments/page.tsx"),
  "utf-8",
);

describe("failed payment reconciliation queue page wiring", () => {
  it("uses financial access guard and internal-user boundary", () => {
    expect(queuePageSource).toContain("requireInternalUser");
    expect(queuePageSource).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(queuePageSource).toContain('redirectTo: "/reports/invoices?banner=not_authorized"');
  });

  it("loads the 6I-B failed payment reconciliation read model", () => {
    expect(queuePageSource).toContain("loadFailedPaymentReconciliationItems");
    expect(queuePageSource).toContain("accountOwnerUserId: internalUser.account_owner_user_id");
  });

  it("renders open count and balance-at-risk summary", () => {
    expect(queuePageSource).toContain("Open failed payments");
    expect(queuePageSource).toContain("Balance at risk");
    expect(queuePageSource).toContain("queue.summary.openCount");
    expect(queuePageSource).toContain("queue.summary.totalBalanceDueCents");
  });

  it("renders declined, requires-action, and blocked breakdown", () => {
    expect(queuePageSource).toContain("Declined");
    expect(queuePageSource).toContain("Requires action");
    expect(queuePageSource).toContain("Blocked/precondition");
    expect(queuePageSource).toContain("queue.summary.blockedPreconditionCount");
  });

  it("renders item fields including customer, invoice, balance, failure reason, and recommended action", () => {
    expect(queuePageSource).toContain("Customer");
    expect(queuePageSource).toContain("Invoice");
    expect(queuePageSource).toContain("Balance Due");
    expect(queuePageSource).toContain("Failure Reason");
    expect(queuePageSource).toContain("Recommended Action");
  });

  it("includes invoice workspace links", () => {
    expect(queuePageSource).toContain("Open invoice workspace");
    expect(queuePageSource).toContain("/jobs/${item.jobId}/invoice");
  });

  it("includes customer links", () => {
    expect(queuePageSource).toContain("Open customer");
    expect(queuePageSource).toContain("/customers/${item.customerId}");
  });

  it("includes job links when job id exists", () => {
    expect(queuePageSource).toContain("Open job");
    expect(queuePageSource).toContain("/jobs/${item.jobId}");
  });

  it("renders empty state when no items are open", () => {
    expect(queuePageSource).toContain("No failed payments need attention.");
    expect(queuePageSource).toContain("Failed rows may still appear in the Payments Register as payment-event history.");
  });

  it("does not expose retry actions", () => {
    expect(queuePageSource).not.toContain("Retry saved card");
    expect(queuePageSource).not.toContain("retryFailedScheduledAutopayAttemptFromForm");
  });

  it("does not expose acknowledge/review/resolve write actions", () => {
    expect(queuePageSource).not.toContain("Acknowledge");
    expect(queuePageSource).not.toContain("Resolve");
    expect(queuePageSource).not.toContain("Mark reviewed");
  });

  it("does not call Stripe", () => {
    expect(queuePageSource).not.toContain("stripe");
  });

  it("does not mutate payment/allocation/invoice/visit/next_due_date truth", () => {
    expect(queuePageSource).not.toContain("insert(");
    expect(queuePageSource).not.toContain("update(");
    expect(queuePageSource).not.toContain("upsert(");
    expect(queuePageSource).not.toContain("delete(");
    expect(queuePageSource).toContain("No Stripe calls. No payment/allocation/invoice/visit/next_due_date mutations in this queue slice.");
  });

  it("uses reports tab and labels this as reconciliation queue surface", () => {
    expect(queuePageSource).toContain('ReportCenterTabs current="failed-payments"');
    expect(queuePageSource).toContain("Failed Payment Reconciliation");
  });
});
