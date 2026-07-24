import { describe, expect, it } from "vitest";
import { buildReadyToBillGroups, READY_TO_BILL_CANDIDATE_LIMIT } from "@/lib/business/ready-to-bill";

const contractorId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

function row(id: string, price: number | null) {
  return {
    id,
    account_owner_user_id: ownerId,
    contractor_id: contractorId,
    customer_first_name: "Avery",
    customer_last_name: "Homeowner",
    title: "Duct leakage test",
    job_address: "123 Main St",
    scheduled_date: "2026-07-20",
    window_start: "09:00:00",
    job_display_number: 101,
    visit_scope_items: [{
      id: "40000000-0000-4000-8000-000000000001",
      title: "Duct leakage test",
      details: "Existing detail",
      kind: "primary" as const,
      expected_quantity: 2,
      expected_unit_price: price,
    }],
    invoice_complete: false,
    ops_status: "paperwork_required",
  };
}

describe("Ready to Bill grouping", () => {
  it("groups ready uninvoiced jobs by contractor and sums expected invoice totals", () => {
    const groups = buildReadyToBillGroups({
      jobs: [row("job-1", 125), { ...row("job-2", 75), job_display_number: 102 }],
      contractorNameById: new Map([[contractorId, "Coaches HVAC"]]),
      activeInvoiceJobIds: new Set(),
      pricebookUnitPriceById: new Map(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ contractorName: "Coaches HVAC", readyJobCount: 2, expectedTotalCents: 40000, expectedTotalDisplay: "$400.00" });
  });

  it("keeps jobs needing manual invoice details actionable while blocking active invoices", () => {
    const groups = buildReadyToBillGroups({
      jobs: [row("job-ready", 100), row("job-invoiced", 100), row("job-unpriced", null)],
      contractorNameById: new Map([[contractorId, "Coaches HVAC"]]),
      activeInvoiceJobIds: new Set(["job-invoiced"]),
      pricebookUnitPriceById: new Map(),
    });
    expect(groups[0].readyJobCount).toBe(1);
    expect(groups[0].blockedJobCount).toBe(1);
    expect(groups[0].invoiceDetailsJobCount).toBe(1);
    expect(groups[0].jobs.find((job) => job.id === "job-invoiced")?.blocker).toContain("active invoice");
    expect(groups[0].jobs.find((job) => job.id === "job-unpriced")).toMatchObject({
      eligible: true,
      manualDetailsRequired: true,
    });
  });

  it("keeps a contractor group visible when every available job needs invoice details", () => {
    const missingItems = { ...row("job-empty", null), visit_scope_items: [] };
    const groups = buildReadyToBillGroups({
      jobs: [missingItems],
      contractorNameById: new Map([[contractorId, "Coaches HVAC"]]),
      activeInvoiceJobIds: new Set(),
      pricebookUnitPriceById: new Map(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ readyJobCount: 0, invoiceDetailsJobCount: 1 });
    expect(groups[0].jobs[0]).toMatchObject({ eligible: true, manualDetailsRequired: true });
  });

  it("keeps a saved single-job draft eligible as prepared billing details", () => {
    const groups = buildReadyToBillGroups({
      jobs: [{ ...row("job-prepared", null), visit_scope_items: [] }],
      contractorNameById: new Map([[contractorId, "Coaches HVAC"]]),
      activeInvoiceJobIds: new Set(),
      preparedDraftTotalCentsByJobId: new Map([["job-prepared", 37500]]),
      pricebookUnitPriceById: new Map(),
    });

    expect(groups[0]).toMatchObject({
      readyJobCount: 1,
      blockedJobCount: 0,
      expectedTotalCents: 37500,
    });
    expect(groups[0].jobs[0]).toMatchObject({
      eligible: true,
      preparedDraft: true,
      manualDetailsRequired: false,
      expectedTotalDisplay: "$375.00",
    });
  });

  it("keeps the dedicated read capped", () => {
    expect(READY_TO_BILL_CANDIDATE_LIMIT).toBe(250);
  });
});
