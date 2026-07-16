import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260716090000_internal_payment_email_deliveries.sql"), "utf8");
const manualSource = readFileSync(resolve(__dirname, "../../actions/internal-invoice-payment-actions.ts"), "utf8");
const webhookSource = readFileSync(resolve(__dirname, "../../../app/api/stripe/webhook/route.ts"), "utf8");

describe("payment received email delivery contract", () => {
  it("claims each payment and recipient only once behind RLS", () => {
    expect(migration).toContain("UNIQUE (internal_invoice_payment_id, recipient_email)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("internal_invoice_payments(id)");
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });

  it("wires only durable manual and newly recorded Stripe payment truth", () => {
    expect(manualSource).toContain("paymentTruth.paymentId");
    expect(manualSource).toContain("deliverInternalPaymentReceivedEmail");
    expect(webhookSource).toContain("if (!result.recorded || !result.paymentId) return");
    expect(webhookSource).toContain("notifyNewRecordedPayment(paymentResult)");
  });
});
