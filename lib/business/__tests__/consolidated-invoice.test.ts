import { describe, expect, it } from "vitest";
import {
  composeConsolidatedInvoiceCreationPayload,
  normalizeConsolidatedInvoiceJobIds,
  validateConsolidatedInvoiceJobs,
  type ConsolidatedInvoiceJob,
} from "@/lib/business/consolidated-invoice";

const ownerId = "10000000-0000-4000-8000-000000000001";
const contractorId = "20000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";
const scopeIds = [
  "40000000-0000-4000-8000-000000000001",
  "40000000-0000-4000-8000-000000000002",
  "40000000-0000-4000-8000-000000000003",
];

function job(id: string, number: number, date: string, price: number): ConsolidatedInvoiceJob {
  return {
    id,
    account_owner_user_id: ownerId,
    status: "completed",
    lifecycle_state: "active",
    deleted_at: null,
    field_complete: true,
    billing_disposition: null,
    customer_id: customerId,
    contractor_id: contractorId,
    billing_recipient: "contractor",
    scheduled_date: date,
    window_start: "09:00:00",
    job_display_number: number,
    visit_scope_items: [{
      id: scopeIds[number - 1],
      title: `Existing job ${number} service`,
      details: `Existing description ${number}`,
      kind: "primary",
      expected_quantity: number,
      expected_unit_price: price,
      item_type: "service",
      category: "Testing",
      unit_label: "job",
    }],
  };
}

const contractorBilling = {
  name: "Coaches HVAC",
  billing_name: "Coaches HVAC AP",
  billing_contact_email: "ap@coaches.example",
  billing_address_line1: "100 Contractor Way",
  billing_city: "Sacramento",
  billing_state: "CA",
  billing_zip: "95811",
  qbo_customer_name: "Coaches HVAC, Inc.",
};

describe("consolidated invoice creation model", () => {
  it("requires an explicit bounded multi-job selection", () => {
    expect(() => normalizeConsolidatedInvoiceJobIds(["job-1"])).toThrow("Select at least two jobs");
    expect(normalizeConsolidatedInvoiceJobIds(["job-1", "job-2", "job-1"])).toEqual(["job-1", "job-2"]);
  });

  it("blocks cross-contractor, cancelled, archived, and external-billing jobs", () => {
    const base = [job(scopeIds[0], 1, "2026-07-20", 100), job(scopeIds[1], 2, "2026-07-20", 200)];
    expect(() => validateConsolidatedInvoiceJobs({ jobs: [base[0], { ...base[1], contractor_id: scopeIds[2] }], selectedJobIds: base.map((row) => row.id), accountOwnerUserId: ownerId })).toThrow("same contractor");
    expect(() => validateConsolidatedInvoiceJobs({ jobs: [base[0], { ...base[1], status: "cancelled" }], selectedJobIds: base.map((row) => row.id), accountOwnerUserId: ownerId })).toThrow("Cancelled");
    expect(() => validateConsolidatedInvoiceJobs({ jobs: [base[0], { ...base[1], deleted_at: "2026-07-20" }], selectedJobIds: base.map((row) => row.id), accountOwnerUserId: ownerId })).toThrow("Archived");
    expect(() => validateConsolidatedInvoiceJobs({ jobs: [base[0], { ...base[1], billing_disposition: "externally_billed" }], selectedJobIds: base.map((row) => row.id), accountOwnerUserId: ownerId })).toThrow("external billing");
  });

  it("composes three jobs deterministically while preserving each existing line", () => {
    const jobs = [
      job(scopeIds[2], 3, "2026-07-21", 300),
      job(scopeIds[1], 2, "2026-07-20", 200),
      job(scopeIds[0], 1, "2026-07-20", 100),
    ];
    const payload = composeConsolidatedInvoiceCreationPayload({
      jobs,
      accountOwnerUserId: ownerId,
      actorUserId: ownerId,
      contractorBilling,
      customerBillingById: new Map([[customerId, { full_name: "Home Owner" }]]),
      pricebookUnitPriceById: new Map(),
      invoiceNumber: "INV-fixed",
      invoiceDate: "2026-07-20",
    });

    expect(payload.memberships.map((row) => row.job_id)).toEqual([scopeIds[0], scopeIds[1], scopeIds[2]]);
    expect(payload.lineItems.map((line) => ({
      sourceJobId: line.source_job_id,
      name: line.item_name_snapshot,
      description: line.description_snapshot,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      subtotal: line.line_subtotal,
    }))).toEqual([
      { sourceJobId: scopeIds[0], name: "Existing job 1 service", description: "Existing description 1", quantity: "1.00", unitPrice: "100.00", subtotal: "100.00" },
      { sourceJobId: scopeIds[1], name: "Existing job 2 service", description: "Existing description 2", quantity: "2.00", unitPrice: "200.00", subtotal: "400.00" },
      { sourceJobId: scopeIds[2], name: "Existing job 3 service", description: "Existing description 3", quantity: "3.00", unitPrice: "300.00", subtotal: "900.00" },
    ]);
    expect(payload.totalCents).toBe(140000);
    expect(payload.invoice).toMatchObject({
      job_id: scopeIds[0],
      bill_to_kind: "contractor",
      bill_to_contractor_id: contractorId,
      billing_name: "Coaches HVAC AP",
      qbo_customer_name: "Coaches HVAC, Inc.",
    });
  });

  it("selection order does not change membership or line ordering", () => {
    const first = job(scopeIds[0], 1, "2026-07-20", 100);
    const second = job(scopeIds[1], 2, "2026-07-21", 200);
    const build = (jobs: ConsolidatedInvoiceJob[]) => composeConsolidatedInvoiceCreationPayload({
      jobs,
      accountOwnerUserId: ownerId,
      actorUserId: ownerId,
      contractorBilling,
      customerBillingById: new Map([[customerId, { full_name: "Home Owner" }]]),
      pricebookUnitPriceById: new Map(),
      invoiceNumber: "INV-fixed",
      invoiceDate: "2026-07-20",
    });
    expect(build([first, second]).memberships).toEqual(build([second, first]).memberships);
    expect(build([first, second]).lineItems).toEqual(build([second, first]).lineItems);
  });
});
