import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"), "utf8");

describe("invoice payment QBO retry wiring", () => {
  it("offers retry for recorded payments left failed or not synced", () => {
    expect(source).toContain('payment.qbo_sync_status === "failed" || payment.qbo_sync_status === "not_synced"');
    expect(source).toContain("Retry QuickBooks Payment Sync");
    expect(source).toContain("syncSinglePaymentToQboFromForm");
  });
});
