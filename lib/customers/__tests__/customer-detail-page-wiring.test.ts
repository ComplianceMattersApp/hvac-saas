import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const customerPageSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/page.tsx"),
  "utf8",
);

describe("customer detail relationship hub wiring", () => {
  it("uses responsible account language in overview", () => {
    expect(customerPageSource).toContain("Responsible Account");
    expect(customerPageSource).toContain("Account Contact");
    expect(customerPageSource).toContain("Account Phone");
    expect(customerPageSource).toContain("Account Email");
    expect(customerPageSource).toContain("Account Summary");
  });

  it("keeps role contacts rendering in account contacts section", () => {
    expect(customerPageSource).toContain("Account Contacts");
    expect(customerPageSource).toContain("Customer / Account Role Contacts");
    expect(customerPageSource).toContain("<RoleContactsCard");
  });

  it("renders lightweight internal contact entry controls", () => {
    expect(customerPageSource).toContain("Add account contact");
    expect(customerPageSource).toContain("Save account contact");
    expect(customerPageSource).toContain("Add site/access contact");
    expect(customerPageSource).toContain("Save site/access contact");
    expect(customerPageSource).toContain("isInternalViewer ? (");
  });

  it("shows billing and paperwork defaults copy", () => {
    expect(customerPageSource).toContain("Billing / Paperwork Defaults");
    expect(customerPageSource).toContain("Billing / Paperwork Contact:");
    expect(customerPageSource).toContain("Saved billing contact");
    expect(customerPageSource).toContain(
      "Invoices and paperwork default to the responsible account unless a job or invoice has its own billing recipient.",
    );
  });

  it("keeps managed locations and recent active work sections", () => {
    expect(customerPageSource).toContain("Managed Locations");
    expect(customerPageSource).toContain("Recent / Active Work");
    expect(customerPageSource).toContain("View Location");
    expect(customerPageSource).toContain("Site / Access Contact");
  });

  it("includes read-only billing periods inside maintenance agreement cards", () => {
    expect(customerPageSource).toContain("Billing Periods");
    expect(customerPageSource).toContain(
      "Billing periods are for billing visibility only and do not control service visits.",
    );
    expect(customerPageSource).toContain(
      "Work orders, visits, next due date, and visit counting continue independently of billing period status.",
    );
    expect(customerPageSource).toContain(
      "No billing periods have been created for this service plan yet.",
    );
    expect(customerPageSource).toContain("listMaintenanceAgreementBillingPeriodsForCustomer");
    expect(customerPageSource).toContain("billingPeriodsByAgreementId");
    expect(customerPageSource).toContain("payment_display_state");
    expect(customerPageSource).toContain("canManageInvoiceLifecycle");
    expect(customerPageSource).toContain("canManageBillingPeriods");
    expect(customerPageSource).toContain("Add Billing Period");
    expect(customerPageSource).toContain("Edit Billing Period");
    expect(customerPageSource).toContain("Cancel Billing Period");
    expect(customerPageSource).toContain("Create a billing period record only. This does not generate or link an invoice.");
    expect(customerPageSource).toContain("Billing periods are for billing visibility only and do not control service visits.");
    expect(customerPageSource).toContain("Cancelling preserves billing history and does not affect work orders, visits, or next due date.");
    expect(customerPageSource).toContain("Edit is disabled for invoice-linked billing periods.");
    expect(customerPageSource).toContain("billingPeriodBanner");
    expect(customerPageSource).toContain("Billing period created.");
    expect(customerPageSource).toContain("Billing period updated.");
    expect(customerPageSource).toContain("Billing period cancelled.");
    expect(customerPageSource).toContain("Generate Draft Invoice");
    expect(customerPageSource).toContain("anchor_job_id");
    expect(customerPageSource).toContain("canGenerateDraftInvoice");
    expect(customerPageSource).toContain("You do not have permission to manage billing periods for this customer.");
    expect(customerPageSource).not.toContain("Delete Billing Period");
    expect(customerPageSource).not.toContain("Link Invoice");
    expect(customerPageSource).not.toContain("Autopay");
    expect(customerPageSource).not.toContain("Subscription");
    expect(customerPageSource).not.toContain("Payment required before service");
  });

  it("wires Generate Draft Invoice control inside eligible billing period blocks", () => {
    expect(customerPageSource).toContain("generateDraftInvoiceFromBillingPeriodFromForm");
    expect(customerPageSource).toContain("generateDraftInvoiceFromBillingPeriodAction");
    expect(customerPageSource).toContain("Generate Draft Invoice");
    expect(customerPageSource).toContain("Anchor Job ID");
    expect(customerPageSource).toContain("anchor_job_id");
    expect(customerPageSource).toContain("Creates a draft invoice only from this billing period.");
    expect(customerPageSource).toContain(
      "Does not issue, send, email, collect payment, or create a payment link.",
    );
    expect(customerPageSource).toContain(
      "Anchor job must already belong to this maintenance agreement.",
    );
    expect(customerPageSource).toContain("canGenerateDraftInvoice");
    expect(customerPageSource).toContain("billingPeriod.billing_period_status !== \"cancelled\"");
    expect(customerPageSource).toContain("!billingPeriod.internal_invoice_id");
    expect(customerPageSource).toContain("billingPeriod.billing_posture === \"internal_invoice\"");
    expect(customerPageSource).toContain("Number(billingPeriod.amount_due_cents) > 0");
  });

  it("wires Link Existing Invoice control inside billing period block", () => {
    expect(customerPageSource).toContain("linkInternalInvoiceToBillingPeriodFromForm");
    expect(customerPageSource).toContain("linkBillingPeriodInvoiceAction");
    expect(customerPageSource).toContain("Link Existing Invoice");
    expect(customerPageSource).toContain("Existing Internal Invoice ID");
    expect(customerPageSource).toContain(
      "Linking connects this billing period to an existing invoice for visibility only. It does not generate, issue, send, or collect payment.",
    );
    // Visibility gated to financial managers
    expect(customerPageSource).toContain("canManageBillingPeriods");
    // Hidden when cancelled or already linked
    expect(customerPageSource).toContain(
      "billingPeriod.billing_period_status !== \"cancelled\" && !billingPeriod.internal_invoice_id",
    );
  });

  it("wires Unlink Invoice control inside billing period block", () => {
    expect(customerPageSource).toContain("unlinkInternalInvoiceFromBillingPeriodFromForm");
    expect(customerPageSource).toContain("unlinkBillingPeriodInvoiceAction");
    expect(customerPageSource).toContain("Unlink Invoice");
    expect(customerPageSource).toContain(
      "Unlinking preserves invoice and payment history. It only removes this billing-period relationship.",
    );
    // Reason required for unlink
    expect(customerPageSource).toMatch(/action=\{unlinkBillingPeriodInvoiceAction\}[\s\S]*?name="status_reason"[\s\S]*?required/);
    // Hidden when no linked invoice
    expect(customerPageSource).toContain("{billingPeriod.internal_invoice_id ? (");
  });

  it("wires new billing-period invoice link banners", () => {
    expect(customerPageSource).toContain("billing_period_invoice_linked");
    expect(customerPageSource).toContain("billing_period_invoice_unlinked");
    expect(customerPageSource).toContain("billing_period_invoice_link_denied");
    expect(customerPageSource).toContain("billing_period_invoice_link_invalid");
    expect(customerPageSource).toContain("billing_period_invoice_link_conflict");
    expect(customerPageSource).toContain("billing_period_invoice_unlink_reason_required");
    expect(customerPageSource).toContain("billing_period_invoice_generated");
    expect(customerPageSource).toContain("billing_period_invoice_generate_denied");
    expect(customerPageSource).toContain("billing_period_invoice_generate_invalid");
    expect(customerPageSource).toContain("billing_period_invoice_generate_anchor_invalid");
    expect(customerPageSource).toContain("billing_period_invoice_generate_conflict");
    expect(customerPageSource).toContain(
      "Billing period linked to existing invoice for visibility. No invoice was generated, sent, or charged.",
    );
    expect(customerPageSource).toContain(
      "Billing period unlinked from invoice. Invoice and payment history are preserved.",
    );
    expect(customerPageSource).toContain(
      "Draft invoice generated from billing period. No invoice was issued, sent, emailed, charged, or linked to payment.",
    );
  });

  it("preserves existing billing-period and work-order affordances after link/unlink wiring", () => {
    expect(customerPageSource).toContain("Add Billing Period");
    expect(customerPageSource).toContain("Edit Billing Period");
    expect(customerPageSource).toContain("Cancel Billing Period");
    expect(customerPageSource).toContain("Create Work Order");
  });

  it("does not expose invoice generation, payment, or autopay button labels inside billing periods", () => {
    // Disclaimer helper copy intentionally describes what link/unlink does NOT do
    // (e.g. "does not generate, issue, send, or collect payment"). Only forbid
    // actionable, title-case affordances that would imply such behavior is offered.
    expect(customerPageSource).not.toContain("Generate Invoice");
    expect(customerPageSource).not.toContain("Create Invoice");
    expect(customerPageSource).not.toContain("Issue Invoice");
    expect(customerPageSource).not.toContain("Send Invoice");
    expect(customerPageSource).not.toContain("Email Invoice");
    expect(customerPageSource).not.toContain("Pay Now");
    expect(customerPageSource).not.toContain("Create Payment Link");
    expect(customerPageSource).not.toContain("Stripe Checkout");
    expect(customerPageSource).not.toContain("Autopay");
    expect(customerPageSource).not.toContain("Subscription");
    expect(customerPageSource).not.toContain("Payment required before service");
  });

  it("wires saved-card setup controls with no-charge and no-autopay copy", () => {
    expect(customerPageSource).toContain("startCustomerSavedPaymentMethodSetupFromForm");
    expect(customerPageSource).toContain("startSavedPaymentMethodSetupAction");
    expect(customerPageSource).toContain("Saved Card Setup");
    expect(customerPageSource).toContain("Set up saved card");
    expect(customerPageSource).toContain("Saving a card does not enable autopay");
    expect(customerPageSource).toContain("No saved card is on file for this customer yet.");
    expect(customerPageSource).toContain("saved_payment_method_setup_returned");
    expect(customerPageSource).toContain("saved_payment_method_setup_cancelled");
    expect(customerPageSource).toContain("saved_payment_method_setup_denied");
    expect(customerPageSource).toContain("saved_payment_method_setup_connect_not_ready");
    expect(customerPageSource).toContain("saved_payment_method_setup_failed");
    expect(customerPageSource).not.toContain("Enable Autopay");
    expect(customerPageSource).not.toContain("Start Subscription");
  });
});
