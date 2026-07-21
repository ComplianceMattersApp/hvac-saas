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

  it("shows active-invoice and missing-price blockers without counting those jobs", () => {
    const groups = buildReadyToBillGroups({
      jobs: [row("job-ready", 100), row("job-invoiced", 100), row("job-unpriced", null)],
      contractorNameById: new Map([[contractorId, "Coaches HVAC"]]),
      activeInvoiceJobIds: new Set(["job-invoiced"]),
      pricebookUnitPriceById: new Map(),
    });
    expect(groups[0].readyJobCount).toBe(1);
    expect(groups[0].blockedJobCount).toBe(2);
    expect(groups[0].jobs.find((job) => job.id === "job-invoiced")?.blocker).toContain("active invoice");
    expect(groups[0].jobs.find((job) => job.id === "job-unpriced")?.blocker).toContain("pricing");
  });

  it("keeps the dedicated read capped", () => {
    expect(READY_TO_BILL_CANDIDATE_LIMIT).toBe(250);
  });
});
