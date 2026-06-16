import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);
const invoiceWorkspaceSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf8",
);
const deferredTimelineSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/DeferredTimelineBody.tsx"),
  "utf8",
);
const stripeWebhookSource = readFileSync(
  resolve(__dirname, "../../business/tenant-invoice-stripe-webhooks.ts"),
  "utf8",
);

describe("Stripe invoice payment received owner visibility wiring", () => {
  it("records successful Stripe invoice payments as collected payment truth and job activity", () => {
    expect(stripeWebhookSource).toContain("recordTenantInvoicePaymentFromCheckoutSession");
    expect(stripeWebhookSource).toContain("recordTenantInvoicePaymentFromStripeCharge");
    expect(stripeWebhookSource).toContain("payment_status: 'recorded'");
    expect(stripeWebhookSource).toContain("payment_method: 'card_stripe_online'");
    expect(stripeWebhookSource).toContain("source: 'stripe_checkout_session_webhook'");
    expect(stripeWebhookSource).toContain("source: 'stripe_charge_webhook'");
    expect(stripeWebhookSource).toContain("insertPaymentRecordedJobEventIfMissing");
  });

  it("does not label failed Stripe charge webhook activity as payment received", () => {
    expect(stripeWebhookSource).toContain("source: 'stripe_charge_webhook_failed'");
    expect(jobDetailSource).toContain('if (paymentStatus === "failed") return "Payment failed";');
    expect(deferredTimelineSource).toContain('if (paymentStatus === "failed") return "Payment failed";');
  });

  it("shows owner-facing payment received confirmation on the job invoice area and invoice workspace", () => {
    for (const source of [jobDetailSource, invoiceWorkspaceSource]) {
      expect(source).toContain("latestStripeReceivedPayment");
      expect(source).toContain("Payment received");
      expect(source).toContain("Stripe confirmed this payment. Payout timing is handled by Stripe.");
      expect(source).toContain("isStripeSourcedPayment");
    }
  });

  it("labels Stripe recorded payment activity as payment received in immediate and deferred timelines", () => {
    for (const source of [jobDetailSource, deferredTimelineSource]) {
      expect(source).toContain('return "Payment received";');
      expect(source).toContain("paymentStatus === \"recorded\"");
      expect(source).toContain('paymentMethod === "card_stripe_online" || source.includes("stripe")');
      expect(source).toContain("Stripe confirmed this payment. Payout timing is handled by Stripe.");
    }
  });

  it("keeps the confirmation language distinct from Stripe payout or deposit completion", () => {
    const changedSources = [jobDetailSource, invoiceWorkspaceSource, deferredTimelineSource].join("\n");

    expect(changedSources).not.toMatch(/payment deposited/i);
    expect(changedSources).not.toMatch(/deposit complete/i);
    expect(changedSources).not.toMatch(/payout complete/i);
  });
});
