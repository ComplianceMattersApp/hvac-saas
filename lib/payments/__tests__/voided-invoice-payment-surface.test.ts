import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { VOIDED_INVOICE_CHARGE_MARKER } from "@/lib/business/voided-invoice-charge-marker";

const invoiceActionsSource = readFileSync(
  resolve(__dirname, "../../actions/internal-invoice-actions.ts"),
  "utf8",
);
const paymentActionsSource = readFileSync(
  resolve(__dirname, "../../actions/internal-invoice-payment-actions.ts"),
  "utf8",
);
const webhookSource = readFileSync(
  resolve(__dirname, "../../business/tenant-invoice-stripe-webhooks.ts"),
  "utf8",
);
const attentionSource = readFileSync(
  resolve(__dirname, "../../reports/attention-center-read-model.ts"),
  "utf8",
);

/** Body of one exported function, so assertions cannot be satisfied by another one. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/** Same, for a module-private helper. */
function localFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("voiding an invoice closes every path money can arrive on", () => {
  it("expires open Stripe checkout sessions when the invoice is voided", () => {
    // Stripe does not know about the void. An open session would still take the
    // customer's card, and the webhook would then refuse to record it — a charge
    // with nowhere to land.
    const voidAction = functionBody(invoiceActionsSource, "voidInternalInvoiceFromForm");
    expect(voidAction).toContain("expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice");
  });

  it("never lets a Stripe outage block the void itself", () => {
    const voidAction = functionBody(invoiceActionsSource, "voidInternalInvoiceFromForm");
    const expireIndex = voidAction.indexOf("expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice");
    const tryIndex = voidAction.lastIndexOf("try {", expireIndex);
    expect(tryIndex).toBeGreaterThanOrEqual(0);
  });

  it("refuses to record or collect payment on an invoice that is not issued", () => {
    // A whitelist, not a void blacklist — draft and void both fail closed.
    for (const name of [
      "recordInternalInvoicePaymentFromForm",
      "reportNonCardFieldPaymentCollectionFromForm",
      "verifyFieldPaymentCollectionReportFromForm",
    ]) {
      expect(functionBody(paymentActionsSource, name)).toContain("status !== 'issued'");
    }
  });

  it("flags a charge that lands after the void instead of dropping it", () => {
    expect(webhookSource).toContain("flagStripeChargeAgainstVoidedInvoice");
    expect(webhookSource).toContain("VOIDED_INVOICE_CHARGE_MARKER");
    // Must distinguish void from genuinely missing, or the charge is a silent no-op.
    expect(webhookSource).toContain("resolveInvoiceStatusById");
    expect(webhookSource).toContain("charge flagged for refund review");
  });

  it("keeps the flagged charge out of money truth", () => {
    const flagger = localFunctionBody(webhookSource, "flagStripeChargeAgainstVoidedInvoice");
    // Only annotates an existing pending row. It must never promote the payment
    // or insert one — either would credit a retired invoice balance.
    expect(flagger).toContain("payment_status', 'pending'");
    expect(flagger).toContain("notes");
    expect(flagger).not.toContain("payment_status: 'recorded'");
    expect(flagger).not.toContain(".insert(");
  });

  it("surfaces the charge as critical and does not reuse the abandoned-session copy", () => {
    // Matched via the shared constant so the marker cannot drift between writer
    // and reader.
    expect(attentionSource).toContain("VOIDED_INVOICE_CHARGE_MARKER");
    expect(VOIDED_INVOICE_CHARGE_MARKER).toBe("[PAID AFTER VOID]");
    expect(attentionSource).toContain("Customer charged after the invoice was voided");
    expect(attentionSource).toContain("The customer's card WAS charged");
    // The abandoned-session item claims money was NOT collected; a real charge
    // must never inherit that truth statement.
    const skipIndex = attentionSource.indexOf("if (paidAfterVoid.has(");
    const staleTruthIndex = attentionSource.indexOf("This is not counted as collected money");
    expect(skipIndex).toBeGreaterThanOrEqual(0);
    expect(staleTruthIndex).toBeGreaterThan(skipIndex);
  });
});
