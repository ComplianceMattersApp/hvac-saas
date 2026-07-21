import { describe, expect, it } from "vitest";
import {
  buildInternalInvoiceDraftSource,
  buildVisitScopeInvoiceLineSource,
} from "@/lib/business/internal-invoice-source";

describe("internal invoice per-job source builder", () => {
  it("preserves the established contractor-billed single-job draft header", () => {
    const source = buildInternalInvoiceDraftSource({
      accountOwnerUserId: "owner-1",
      actorUserId: "billing-1",
      jobId: "job-1",
      job: {
        customer_id: "customer-1",
        contractor_id: "contractor-1",
        location_id: "location-1",
        service_case_id: "case-1",
        billing_recipient: "contractor",
        billing_name: "legacy override",
      },
      customerBilling: { full_name: "Home Owner", billing_email: "home@example.com" },
      contractorBilling: {
        name: "Coaches HVAC",
        billing_name: "Coaches HVAC Accounts Payable",
        billing_contact_email: "ap@coaches.example",
        billing_address_line1: "100 Contractor Way",
        billing_city: "Sacramento",
        billing_state: "CA",
        billing_zip: "95811",
        qbo_customer_name: "Coaches HVAC, Inc.",
      },
      invoiceNumber: "INV-fixed",
      invoiceDate: "2026-07-20",
    });

    expect(source.header).toEqual({
      account_owner_user_id: "owner-1",
      job_id: "job-1",
      customer_id: "customer-1",
      bill_to_kind: "contractor",
      bill_to_contractor_id: "contractor-1",
      location_id: "location-1",
      service_case_id: "case-1",
      invoice_number: "INV-fixed",
      status: "draft",
      invoice_date: "2026-07-20",
      source_type: "job",
      subtotal_cents: 0,
      total_cents: 0,
      notes: null,
      billing_name: "Coaches HVAC Accounts Payable",
      billing_email: "ap@coaches.example",
      billing_phone: null,
      billing_address_line1: "100 Contractor Way",
      billing_address_line2: null,
      billing_city: "Sacramento",
      billing_state: "CA",
      billing_zip: "95811",
      billing_country: null,
      qbo_customer_name: "Coaches HVAC, Inc.",
      created_by_user_id: "billing-1",
      updated_by_user_id: "billing-1",
    });
  });

  it("preserves existing Work Item line wording, price, quantity, and provenance", () => {
    expect(buildVisitScopeInvoiceLineSource({
      invoiceId: "invoice-1",
      sourceJobId: "job-1",
      sortOrder: 3,
      sourceVisitScopeItemId: "scope-1",
      title: " Replace capacitor ",
      details: " Install 45/5 capacitor and verify startup ",
      itemType: "material",
      category: " Repair ",
      unitLabel: " each ",
      quantityHundredths: 150,
      unitPriceCents: 18950,
      actorUserId: "billing-1",
    })).toEqual({
      invoice_id: "invoice-1",
      source_job_id: "job-1",
      sort_order: 3,
      source_kind: "visit_scope",
      source_visit_scope_item_id: "scope-1",
      item_name_snapshot: "Replace capacitor",
      description_snapshot: "Install 45/5 capacitor and verify startup",
      item_type_snapshot: "material",
      category_snapshot: "Repair",
      unit_label_snapshot: "each",
      quantity: "1.50",
      unit_price: "189.50",
      line_subtotal: "284.25",
      created_by_user_id: "billing-1",
      updated_by_user_id: "billing-1",
    });
  });
});
