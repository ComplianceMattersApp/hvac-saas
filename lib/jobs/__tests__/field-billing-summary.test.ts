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
  can_create_direct_invoice_draft: false,
  can_select_pricebook_invoice_lines: false,
  can_convert_visit_scope_to_invoice_lines: false,
  can_add_manual_invoice_line: false,
  can_edit_invoice_line_description: false,
  can_edit_invoice_line_quantity: false,
  can_edit_invoice_line_price: false,
  can_remove_invoice_line: false,
  can_issue_invoice: false,
  can_send_invoice: false,
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
  can_create_direct_invoice_draft: true,
  can_select_pricebook_invoice_lines: true,
  can_convert_visit_scope_to_invoice_lines: true,
  can_add_manual_invoice_line: true,
  can_edit_invoice_line_description: true,
  can_edit_invoice_line_quantity: true,
  can_edit_invoice_line_price: true,
  can_remove_invoice_line: true,
  can_issue_invoice: true,
  can_send_invoice: true,
  can_collect_card_payment: true,
  can_report_non_card_collection: true,
  can_verify_non_card_collection: true,
};

const pricebookOnlyCapabilities: FieldBillingCapabilities = {
  ...readOnlyCapabilities,
  field_billing_enabled: true,
  can_select_pricebook_lines: true,
  can_submit_field_charges_for_review: true,
};

const visitScopeOnlyCapabilities: FieldBillingCapabilities = {
  ...readOnlyCapabilities,
  field_billing_enabled: true,
  can_convert_visit_scope_to_invoice_line: true,
  can_submit_field_charges_for_review: true,
};

const directInvoiceOnlyCapabilities: FieldBillingCapabilities = {
  ...readOnlyCapabilities,
  field_billing_enabled: true,
  can_create_direct_invoice_draft: true,
  can_select_pricebook_invoice_lines: true,
  can_edit_invoice_line_quantity: true,
};

const proposalWithPriceOverrideCapabilities: FieldBillingCapabilities = {
  ...pricebookOnlyCapabilities,
  can_edit_charge_price: true,
};

type SummaryProps = Parameters<typeof FieldBillingSummary>[0];

function renderSummary(props: Partial<SummaryProps> = {}) {
  return renderToStaticMarkup(
    React.createElement(FieldBillingSummary, {
      jobId: props.jobId ?? "job-1",
      tab: props.tab ?? "info",
      capabilities: props.capabilities ?? readOnlyCapabilities,
      invoice: props.invoice ?? null,
      latestVoidedInvoice: props.latestVoidedInvoice ?? null,
      paymentSummary: props.paymentSummary ?? null,
      fieldChargeProposals: props.fieldChargeProposals ?? [],
      pricebookProposalItems: props.pricebookProposalItems ?? [],
      visitScopeProposalItems: props.visitScopeProposalItems ?? [],
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
    expect(html).toContain("Field charge proposals");
    expect(html).toContain("No field charge proposals.");
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
    expect(html).not.toContain("Add proposed charge");
    expect(html).not.toContain("Submit charge for office review");
    expect(html).not.toContain("Collect Payment");
    expect(html).not.toContain("Add Charge");
    expect(html).not.toContain("Edit Charge");
    expect(html).not.toContain("Remove Charge");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Reject");
    expect(html).not.toContain("Convert");
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

    expect(html).toContain("Direct invoice workflow is primary.");
    expect(html).toContain("Review Invoice");
    expect(html).not.toContain("Add proposed charge");
  });

  it("shows direct invoice workflow as primary when direct invoice authority exists", () => {
    const html = renderSummary({
      capabilities: directInvoiceOnlyCapabilities,
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
    });

    expect(html).toContain("Direct invoice workflow is primary.");
    expect(html).toContain("Review Invoice");
    expect(html).not.toContain("Add proposed charge");
    expect(html).not.toContain("Submit charge for office review");
  });

  it("renders submitted Pricebook proposal as read-only and non-collectible", () => {
    const html = renderSummary({
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
      fieldChargeProposals: [
        {
          id: "proposal-1",
          account_owner_user_id: "owner-1",
          job_id: "job-1",
          internal_invoice_id: "inv-1",
          source_kind: "pricebook",
          source_pricebook_item_id: "pb-1",
          source_visit_scope_item_id: null,
          proposed_name: "Diagnostic Visit",
          proposed_description: "System diagnostic",
          proposed_item_type: "diagnostic",
          proposed_quantity: 2,
          proposed_unit_price_cents: 12500,
          proposed_subtotal_cents: 25000,
          proposed_currency: "usd",
          status: "submitted_for_review",
          proposed_by_user_id: "billing-1",
          submitted_at: "2026-06-05T18:00:00.000Z",
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_note: null,
          converted_internal_invoice_line_item_id: null,
          created_at: "2026-06-05T18:00:00.000Z",
          updated_at: "2026-06-05T18:00:00.000Z",
        },
      ],
    });

    expect(html).toContain("Field charge proposals");
    expect(html).toContain("Review before these become invoice charges.");
    expect(html).toContain("These proposals are not collectible yet.");
    expect(html).toContain("Office/billing approval required before these become invoice charges.");
    expect(html).toContain("Diagnostic Visit");
    expect(html).toContain("Source: Pricebook");
    expect(html).toContain("Qty 2");
    expect(html).toContain("Submitted for Review");
    expect(html).toContain("Proposed total");
    expect(html).toContain("Separate from invoice total");
    expect(html).toContain("$250.00");
    expect(html).toContain("$175.00");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Reject");
    expect(html).not.toContain("Collect Payment");
  });

  it("shows compact Pricebook proposal entry only when Pricebook proposal capability is present", () => {
    const html = renderSummary({
      capabilities: pricebookOnlyCapabilities,
      invoice: null,
      pricebookProposalItems: [
        {
          id: "pb-1",
          item_name: "Diagnostic Visit",
          item_type: "diagnostic",
          category: "HVAC",
          default_description: "System diagnostic",
          default_unit_price: 125,
          unit_label: "each",
        },
      ],
    });

    expect(html).toContain("Add proposed charge");
    expect(html).toContain("Submit charge for office review");
    expect(html).toContain("These are proposals only and are not collectible until approved.");
    expect(html).toContain("From Pricebook");
    expect(html).toContain("Diagnostic Visit - HVAC - $125.00");
    expect(html).not.toContain("From completed work / Visit Scope");
    expect(html).not.toContain("Optional unit price override");
    expect(html).not.toContain("Manual");
    expect(html).not.toContain("Custom");
    expect(html).not.toContain("Collect Payment");
  });

  it("shows Visit Scope proposal entry only when Visit Scope proposal capability is present", () => {
    const html = renderSummary({
      capabilities: visitScopeOnlyCapabilities,
      invoice: null,
      visitScopeProposalItems: [
        {
          id: "8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f",
          title: "Repair blower assembly",
          details: "Replace motor and verify airflow",
        },
      ],
    });

    expect(html).toContain("Add proposed charge");
    expect(html).toContain("Submit charge for office review");
    expect(html).toContain("From completed work / Visit Scope");
    expect(html).toContain("Repair blower assembly");
    expect(html).toContain("Visit Scope pricing is context only here.");
    expect(html).toContain("Submitting this does not add an invoice charge.");
    expect(html).not.toContain("From Pricebook");
    expect(html).not.toContain("Manual");
    expect(html).not.toContain("Custom");
    expect(html).not.toContain("Collect Payment");
  });

  it("shows price override entry only when price edit capability is present", () => {
    const html = renderSummary({
      capabilities: proposalWithPriceOverrideCapabilities,
      invoice: null,
      pricebookProposalItems: [
        {
          id: "pb-1",
          item_name: "Diagnostic Visit",
          item_type: "diagnostic",
          category: "HVAC",
          default_description: "System diagnostic",
          default_unit_price: 125,
          unit_label: "each",
        },
      ],
    });

    expect(html).toContain("Optional unit price override");
    expect(html).toContain("Submit charge for office review");
    expect(html).not.toContain("Collect Payment");
  });

  it("renders submitted Visit Scope proposal with pending amount separately from invoice total", () => {
    const html = renderSummary({
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
      fieldChargeProposals: [
        {
          id: "proposal-visit-scope",
          account_owner_user_id: "owner-1",
          job_id: "job-1",
          internal_invoice_id: "inv-1",
          source_kind: "visit_scope",
          source_pricebook_item_id: null,
          source_visit_scope_item_id: "8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f",
          proposed_name: "Repair blower assembly",
          proposed_description: "Replace motor and verify airflow",
          proposed_item_type: "service",
          proposed_quantity: 1,
          proposed_unit_price_cents: null,
          proposed_subtotal_cents: null,
          proposed_currency: "usd",
          status: "submitted_for_review",
          proposed_by_user_id: "billing-1",
          submitted_at: "2026-06-05T18:00:00.000Z",
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_note: null,
          converted_internal_invoice_line_item_id: null,
          created_at: "2026-06-05T18:00:00.000Z",
          updated_at: "2026-06-05T18:00:00.000Z",
        },
      ],
    });

    expect(html).toContain("Repair blower assembly");
    expect(html).toContain("Source: Visit Scope");
    expect(html).toContain("Amount pending");
    expect(html).toContain("$175.00");
    expect(html).not.toContain("Proposed total");
    expect(html).not.toContain("Collect Payment");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Reject");
    expect(html).not.toContain("Convert");
  });

  it("renders approve and reject controls for authorized reviewers on submitted proposals with a draft invoice", () => {
    const html = renderSummary({
      capabilities: financialCapabilities,
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
      fieldChargeProposals: [
        {
          id: "proposal-1",
          account_owner_user_id: "owner-1",
          job_id: "job-1",
          internal_invoice_id: "inv-1",
          source_kind: "pricebook",
          source_pricebook_item_id: "pb-1",
          source_visit_scope_item_id: null,
          proposed_name: "Diagnostic Visit",
          proposed_description: "System diagnostic",
          proposed_item_type: "diagnostic",
          proposed_quantity: 2,
          proposed_unit_price_cents: 12500,
          proposed_subtotal_cents: 25000,
          proposed_currency: "usd",
          status: "submitted_for_review",
          proposed_by_user_id: "billing-1",
          submitted_at: "2026-06-05T18:00:00.000Z",
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_note: null,
          converted_internal_invoice_line_item_id: null,
          created_at: "2026-06-05T18:00:00.000Z",
          updated_at: "2026-06-05T18:00:00.000Z",
        },
      ],
    });

    expect(html).toContain("<form");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Optional rejection note");
    expect(html).not.toContain("Draft invoice required before approval.");
    expect(html).not.toContain("Collect Payment");
    expect(html).not.toContain("Add Field Charge");
  });

  it("warns authorized reviewers when approval needs a draft invoice", () => {
    const html = renderSummary({
      capabilities: financialCapabilities,
      invoice: null,
      fieldChargeProposals: [
        {
          id: "proposal-1",
          account_owner_user_id: "owner-1",
          job_id: "job-1",
          internal_invoice_id: null,
          source_kind: "pricebook",
          source_pricebook_item_id: "pb-1",
          source_visit_scope_item_id: null,
          proposed_name: "Diagnostic Visit",
          proposed_description: "System diagnostic",
          proposed_item_type: "diagnostic",
          proposed_quantity: 2,
          proposed_unit_price_cents: 12500,
          proposed_subtotal_cents: 25000,
          proposed_currency: "usd",
          status: "submitted_for_review",
          proposed_by_user_id: "billing-1",
          submitted_at: "2026-06-05T18:00:00.000Z",
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_note: null,
          converted_internal_invoice_line_item_id: null,
          created_at: "2026-06-05T18:00:00.000Z",
          updated_at: "2026-06-05T18:00:00.000Z",
        },
      ],
    });

    expect(html).toContain("Draft invoice required before approval.");
    expect(html).toContain("Create a draft invoice before approving field charge proposals.");
    expect(html).toContain("Reject");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Collect Payment");
  });

  it("does not show approval controls for already reviewed proposals", () => {
    const html = renderSummary({
      capabilities: financialCapabilities,
      invoice: {
        status: "draft",
        invoiceNumber: "INV-DRAFT-1",
        invoiceDisplayNumber: null,
        totalCents: 17500,
        lineItemCount: 2,
      },
      fieldChargeProposals: [
        {
          id: "proposal-approved",
          account_owner_user_id: "owner-1",
          job_id: "job-1",
          internal_invoice_id: "inv-1",
          source_kind: "pricebook",
          source_pricebook_item_id: "pb-1",
          source_visit_scope_item_id: null,
          proposed_name: "Approved Diagnostic Visit",
          proposed_description: "System diagnostic",
          proposed_item_type: "diagnostic",
          proposed_quantity: 1,
          proposed_unit_price_cents: 12500,
          proposed_subtotal_cents: 12500,
          proposed_currency: "usd",
          status: "approved",
          proposed_by_user_id: "billing-1",
          submitted_at: "2026-06-05T18:00:00.000Z",
          reviewed_by_user_id: "billing-2",
          reviewed_at: "2026-06-05T19:00:00.000Z",
          review_note: null,
          converted_internal_invoice_line_item_id: "line-1",
          created_at: "2026-06-05T18:00:00.000Z",
          updated_at: "2026-06-05T19:00:00.000Z",
        },
      ],
    });

    expect(html).toContain("Approved Diagnostic Visit");
    expect(html).toContain("Approved");
    expect(html).not.toContain("<form");
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain("Reject");
    expect(html).not.toContain("Collect Payment");
  });
});
