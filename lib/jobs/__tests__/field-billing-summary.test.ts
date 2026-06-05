import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FieldBillingSummary from "@/app/jobs/[id]/_components/FieldBillingSummary";
import type { FieldBillingCapabilities } from "@/lib/auth/field-billing-access";

const readOnlyCapabilities: FieldBillingCapabilities = {
  field_billing_enabled: false,
  can_view_field_billing_summary: true,
  can_select_pricebook_lines: false,
  can_convert_visit_scope_to_invoice_line: false,
  can_add_manual_charge: false,
  can_edit_charge_description: false,
  can_edit_charge_quantity: false,
  can_edit_charge_price: false,
  can_remove_field_charge: false,
  can_submit_field_charges_for_review: false,
  can_approve_field_charges: false,
  can_collect_card_payment: false,
  can_report_non_card_collection: false,
  can_verify_non_card_collection: false,
};

const financialCapabilities: FieldBillingCapabilities = {
  field_billing_enabled: true,
  can_view_field_billing_summary: true,
  can_select_pricebook_lines: true,
  can_convert_visit_scope_to_invoice_line: true,
  can_add_manual_charge: true,
  can_edit_charge_description: true,
  can_edit_charge_quantity: true,
  can_edit_charge_price: true,
  can_remove_field_charge: true,
  can_submit_field_charges_for_review: true,
  can_approve_field_charges: true,
  can_collect_card_payment: true,
  can_report_non_card_collection: true,
  can_verify_non_card_collection: true,
};

type SummaryProps = Parameters<typeof FieldBillingSummary>[0];

function renderSummary(props: Partial<SummaryProps> = {}) {
  return renderToStaticMarkup(
    React.createElement(FieldBillingSummary, {
      capabilities: props.capabilities ?? readOnlyCapabilities,
      invoice: props.invoice ?? null,
      latestVoidedInvoice: props.latestVoidedInvoice ?? null,
      paymentSummary: props.paymentSummary ?? null,
    }),
  );
}

describe("FieldBillingSummary", () => {
  it("renders no-invoice state", () => {
    const html = renderSummary();

    expect(html).toContain("Field Billing Summary");
    expect(html).toContain("No invoice has been created yet.");
    expect(html).toContain("Office billing review may be needed before payment can be collected.");
    expect(html).toContain("You can view billing status only.");
  });

  it("renders draft invoice state as not ready for collection", () => {
    const html = renderSummary({
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
    });

    expect(html).toContain("Draft invoice exists.");
    expect(html).toContain("Charges are not ready for collection until reviewed and issued.");
    expect(html).toContain("$175.00");
    expect(html).toContain("2 lines");
  });

  it("renders issued invoice balance due as read-only", () => {
    const html = renderSummary({
      invoice: {
        status: "issued",
        invoiceNumber: "INV-ISSUED-1",
        invoiceDisplayNumber: "INV-2026-1",
        totalCents: 25000,
        lineItemCount: 3,
      },
      paymentSummary: {
        amountPaidCents: 5000,
        balanceDueCents: 20000,
        paymentStatus: "partial",
      },
    });

    expect(html).toContain("Issued invoice.");
    expect(html).toContain("Payment collection is not enabled from field view yet.");
    expect(html).toContain("INV-2026-1");
    expect(html).toContain("$50.00");
    expect(html).toContain("$200.00");
  });

  it("renders paid invoice state", () => {
    const html = renderSummary({
      invoice: {
        status: "issued",
        invoiceNumber: "INV-PAID-1",
        invoiceDisplayNumber: null,
        totalCents: 12500,
        lineItemCount: 1,
      },
      paymentSummary: {
        amountPaidCents: 12500,
        balanceDueCents: 0,
        paymentStatus: "paid",
      },
    });

    expect(html).toContain("Invoice paid.");
    expect(html).toContain("$125.00");
    expect(html).toContain("$0.00");
  });

  it("renders voided invoice state", () => {
    const html = renderSummary({
      latestVoidedInvoice: {
        status: "void",
        invoiceNumber: "INV-VOID-1",
        invoiceDisplayNumber: null,
        totalCents: 8000,
        lineItemCount: 1,
      },
    });

    expect(html).toContain("Invoice voided.");
    expect(html).toContain("A previous invoice is voided.");
  });

  it("does not render mutation or collection controls", () => {
    const html = renderSummary({
      invoice: {
        status: "issued",
        invoiceNumber: "INV-ISSUED-1",
        invoiceDisplayNumber: null,
        totalCents: 25000,
        lineItemCount: 3,
      },
      paymentSummary: {
        amountPaidCents: 0,
        balanceDueCents: 25000,
        paymentStatus: "unpaid",
      },
    });

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Collect Payment");
    expect(html).not.toContain("Add Charge");
    expect(html).not.toContain("Edit Charge");
    expect(html).not.toContain("Remove Charge");
  });

  it("renders financial users as read-only summary while leaving actions to invoice workspace", () => {
    const html = renderSummary({
      capabilities: financialCapabilities,
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
    });

    expect(html).toContain("Billing actions remain in the invoice workspace.");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });
});
