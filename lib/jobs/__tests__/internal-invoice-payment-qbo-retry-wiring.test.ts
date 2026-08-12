import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"), "utf8");

const retryableStatuses = readFileSync(resolve(__dirname, "../../../lib/qbo/qbo-payment-sync.ts"), "utf8");

describe("invoice payment QBO retry wiring", () => {
  it("offers retry for every retryable payment sync state", () => {
    expect(source).toContain("qboPaymentSyncIsRetryable(payment.qbo_sync_status)");
    expect(source).toContain("Retry QuickBooks Payment Sync");
    expect(source).toContain("syncSinglePaymentToQboFromForm");
  });

  it("takes those states from the shared list, which includes stuck 'pending'", () => {
    expect(source).toContain("RETRYABLE_QBO_PAYMENT_SYNC_STATUSES");
    expect(retryableStatuses).toContain(
      'RETRYABLE_QBO_PAYMENT_SYNC_STATUSES = ["not_synced", "failed", "pending"] as const',
    );
  });
});
