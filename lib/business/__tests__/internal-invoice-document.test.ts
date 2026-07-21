import { describe, expect, it } from "vitest";
import {
  buildInternalInvoiceDocumentModel,
  buildInternalInvoicePdfFilename,
  sanitizeInternalInvoicePdfFilenamePart,
} from "@/lib/business/internal-invoice-document";
import type { InternalInvoiceRecord } from "@/lib/business/internal-invoice";

function invoice(overrides: Partial<InternalInvoiceRecord> = {}): InternalInvoiceRecord {
  return {
    id: "internal-uuid-must-not-be-presented",
    account_owner_user_id: "owner-1",
    job_id: "job-1",
    customer_id: "customer-1",
    bill_to_kind: "customer",
    bill_to_contractor_id: null,
    location_id: "location-1",
    service_case_id: null,
    invoice_kind: "primary",
    original_internal_invoice_id: null,
    supplemental_reason: null,
    invoice_display_number: "2048",
    invoice_number: "2048",
    status: "issued",
    invoice_date: "2026-07-19",
    issued_at: "2026-07-19T12:00:00.000Z",
    issued_by_user_id: "user-1",
    voided_at: null,
    voided_by_user_id: null,
    void_reason: null,
    source_type: "job",
    subtotal_cents: 12500,
    total_cents: 12500,
    notes: "Thank you for your business.",
    billing_name: "Taylor Customer",
    billing_email: "taylor@example.com",
    billing_phone: "555-0100",
    billing_address_line1: "123 Main Street",
    billing_address_line2: null,
    billing_city: "Sacramento",
    billing_state: "CA",
    billing_zip: "95814",
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-07-19T12:00:00.000Z",
    updated_at: "2026-07-19T12:00:00.000Z",
    qbo_invoice_id: null,
    qbo_customer_id: null,
    qbo_sync_status: null,
    qbo_sync_error: null,
    line_items: [{
      id: "line-1",
      invoice_id: "internal-uuid-must-not-be-presented",
      sort_order: 0,
      source_kind: "manual",
      source_pricebook_item_id: null,
      source_visit_scope_item_id: null,
      item_name_snapshot: "Diagnostic Service",
      description_snapshot: "System assessment and written findings",
      item_type_snapshot: "diagnostic",
      category_snapshot: null,
      unit_label_snapshot: null,
      quantity: 1,
      unit_price: 125,
      line_subtotal: 125,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      created_at: "2026-07-19T12:00:00.000Z",
      updated_at: "2026-07-19T12:00:00.000Z",
    }],
    ...overrides,
  };
}

describe("internal invoice document model", () => {
  it("sanitizes a predictable customer-facing PDF filename", () => {
    expect(buildInternalInvoicePdfFilename('  INV/20:48*?  ')).toBe("Invoice-INV-20-48-.pdf");
    expect(sanitizeInternalInvoicePdfFilenamePart("A\u0000B. ")).toBe("AB");
    expect(() => buildInternalInvoicePdfFilename(" \u0000 ")).toThrow(/invoice number/i);
  });

  it("maps canonical invoice, payment, address, and branding inputs without recalculating totals", () => {
    const model = buildInternalInvoiceDocumentModel({
      invoice: invoice({ invoice_display_number: "2048", invoice_number: "INV-20260719-LEGACY" }),
      job: {
        title: "Cooling diagnostic",
        customer_first_name: "Taylor",
        customer_last_name: "Customer",
        billing_recipient: "customer",
      },
      location: { address_line1: "44 Service Lane", city: "Sacramento", state: "CA", zip: "95814" },
      paymentSummary: { amountPaidCents: 2500, balanceDueCents: 10000, paymentStatus: "partial" },
      tenantIdentity: { displayName: "EveryStep HVAC", supportEmail: "help@example.com", supportPhone: null, logoUrl: null },
    });

    expect(model).toMatchObject({
      invoiceReference: "Invoice #2048",
      invoiceNumber: "2048",
      statusLabel: "Partially Paid",
      subtotalCents: 12500,
      totalCents: 12500,
      amountPaidCents: 2500,
      balanceDueCents: 10000,
      serviceLocation: "44 Service Lane, Sacramento CA 95814",
      billing: { name: "Taylor Customer", addressLines: ["123 Main Street", "Sacramento CA 95814"] },
      business: { displayName: "EveryStep HVAC", logoUrl: null },
    });
    expect(model.lineItems[0]).toMatchObject({
      name: "Diagnostic Service",
      quantityLabel: "1.00",
      unitPriceLabel: "$125.00",
      subtotalLabel: "$125.00",
    });
    expect(JSON.stringify(model)).not.toContain("internal-uuid-must-not-be-presented");
    expect(JSON.stringify(model)).not.toContain("paymentUrl");
    expect(JSON.stringify(model)).not.toContain("emailHtml");
  });

  it("uses the customer-facing display number for the PDF filename value", () => {
    const model = buildInternalInvoiceDocumentModel({
      invoice: invoice({ invoice_display_number: "2048", invoice_number: "INV-20260719-LEGACY" }),
      job: {},
      paymentSummary: {},
      tenantIdentity: { displayName: "EveryStep HVAC", supportEmail: null, supportPhone: null, logoUrl: null },
    });

    expect(buildInternalInvoicePdfFilename(model.invoiceNumber)).toBe("Invoice-2048.pdf");
  });

  it("handles missing optional customer and branding fields safely", () => {
    const model = buildInternalInvoiceDocumentModel({
      invoice: invoice({ billing_name: null, billing_email: null, billing_phone: null, notes: null }),
      job: { customer_first_name: null, customer_last_name: null },
      paymentSummary: { amountPaidCents: 12500, balanceDueCents: 0, paymentStatus: "paid" },
      tenantIdentity: { displayName: "", supportEmail: null, supportPhone: null, logoUrl: null },
    });
    expect(model.billing.name).toBe("Customer");
    expect(model.business.displayName).toBe("Compliance Matters");
    expect(model.statusLabel).toBe("Paid");
    expect(model.balanceDueLabel).toBe("$0.00");
  });

  it("accepts an already scoped canonical service-location label for send reuse", () => {
    const model = buildInternalInvoiceDocumentModel({
      invoice: invoice(),
      job: { customer_first_name: "Taylor", customer_last_name: "Customer" },
      serviceLocation: "Scoped Location Label",
      location: { address_line1: "Ignored fallback" },
      paymentSummary: { balanceDueCents: 12500, paymentStatus: "unpaid" },
      tenantIdentity: { displayName: "EveryStep HVAC", supportEmail: null, supportPhone: null, logoUrl: null },
    });
    expect(model.serviceLocation).toBe("Scoped Location Label");
    expect(model.lineItems[0]?.serviceLocation).toBe("Scoped Location Label");
  });

  it("renders each consolidated line with its immutable source-job context", () => {
    const consolidated = invoice({
      member_job_ids: ["job-1", "job-2"],
      line_items: [
        { ...invoice().line_items[0], id: "line-1", source_job_id: "job-1" },
        { ...invoice().line_items[0], id: "line-2", source_job_id: "job-2", item_name_snapshot: "Repair" },
      ],
    });
    const memberContextByJobId = new Map([
      ["job-1", { jobId: "job-1", jobTitle: "North unit", jobReference: "Job #101", customerName: "Alpha Customer", serviceLocation: "101 Alpha St" }],
      ["job-2", { jobId: "job-2", jobTitle: "South unit", jobReference: "Job #102", customerName: "Beta Customer", serviceLocation: "202 Beta St" }],
    ]);

    const model = buildInternalInvoiceDocumentModel({
      invoice: consolidated,
      job: { title: "North unit" },
      paymentSummary: {},
      tenantIdentity: { displayName: "EveryStep HVAC", supportEmail: null, supportPhone: null, logoUrl: null },
      memberContextByJobId,
    });

    expect(model.lineItems).toMatchObject([
      { jobReference: "Job #101", customerName: "Alpha Customer", serviceLocation: "101 Alpha St" },
      { jobReference: "Job #102", customerName: "Beta Customer", serviceLocation: "202 Beta St" },
    ]);
  });
});
