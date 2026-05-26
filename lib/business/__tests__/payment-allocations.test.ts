import { describe, expect, it } from "vitest";
import {
  deriveCompatibilityInvoiceAllocations,
  sumActiveInvoiceAllocationCents,
  sumActivePersistedInvoiceAllocationCents,
} from "@/lib/business/payment-allocations";

describe("payment allocation compatibility helper", () => {
  it("maps invoice-bound payment rows into allocation-compatible records", () => {
    const allocations = deriveCompatibilityInvoiceAllocations([
      {
        id: "pay-1",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "recorded",
        payment_method: "cash",
        amount_cents: 2500,
        paid_at: "2026-05-01T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "pay-2",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "failed",
        payment_method: "other",
        amount_cents: 1800,
        paid_at: "2026-05-02T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-02T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
      },
    ]);

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toMatchObject({
      paymentRegisterEntryId: "pay-1",
      allocationTargetType: "invoice",
      allocationTargetId: "inv-1",
      allocatedAmountCents: 2500,
      allocationStatus: "active",
      source: "compat_invoice_bound_row",
    });
    expect(allocations[1]?.allocationStatus).toBe("inactive");
  });

  it("sums only active allocations for the requested invoice", () => {
    const allocations = deriveCompatibilityInvoiceAllocations([
      {
        id: "pay-1",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "recorded",
        payment_method: "cash",
        amount_cents: 2000,
        paid_at: "2026-05-01T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "pay-2",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "reversed",
        payment_method: "cash",
        amount_cents: 1500,
        paid_at: "2026-05-02T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-02T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
      },
      {
        id: "pay-3",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-2",
        job_id: "job-2",
        payment_status: "recorded",
        payment_method: "check",
        amount_cents: 999,
        paid_at: "2026-05-03T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-03T00:00:00Z",
        updated_at: "2026-05-03T00:00:00Z",
      },
    ]);

    expect(sumActiveInvoiceAllocationCents(allocations, "inv-1")).toBe(2000);
    expect(sumActiveInvoiceAllocationCents(allocations, "inv-2")).toBe(999);
    expect(sumActiveInvoiceAllocationCents(allocations, "inv-3")).toBe(0);
  });

  it("preserves signed recorded amounts for legacy projection parity", () => {
    const allocations = deriveCompatibilityInvoiceAllocations([
      {
        id: "pay-1",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "recorded",
        payment_method: "cash",
        amount_cents: 2000,
        paid_at: "2026-05-01T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "pay-2",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "recorded",
        payment_method: "other",
        amount_cents: -500,
        paid_at: "2026-05-01T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "pay-3",
        account_owner_user_id: "owner-1",
        invoice_id: "inv-1",
        job_id: "job-1",
        payment_status: "recorded",
        payment_method: "other",
        amount_cents: 0,
        paid_at: "2026-05-01T00:00:00Z",
        received_reference: null,
        notes: null,
        recorded_by_user_id: "user-1",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    ]);

    expect(sumActiveInvoiceAllocationCents(allocations, "inv-1")).toBe(1500);
  });

  it("counts only active persisted allocation rows for invoice totals", () => {
    const total = sumActivePersistedInvoiceAllocationCents(
      [
        {
          id: "alloc-1",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-1",
          target_invoice_id: "inv-1",
          allocated_amount_cents: 3000,
          allocation_status: "active",
        },
        {
          id: "alloc-2",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-2",
          target_invoice_id: "inv-1",
          allocated_amount_cents: 500,
          allocation_status: "inactive",
        },
        {
          id: "alloc-3",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-3",
          target_invoice_id: "inv-1",
          allocated_amount_cents: 400,
          allocation_status: "reversed",
        },
        {
          id: "alloc-4",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-4",
          target_invoice_id: "inv-1",
          allocated_amount_cents: 700,
          allocation_status: "voided",
        },
        {
          id: "alloc-5",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-5",
          target_invoice_id: "inv-2",
          allocated_amount_cents: 999,
          allocation_status: "active",
        },
      ],
      "inv-1",
    );

    expect(total).toBe(3000);
  });

  it("preserves signed amount parity for active persisted allocation totals", () => {
    const total = sumActivePersistedInvoiceAllocationCents(
      [
        {
          id: "alloc-1",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-1",
          target_invoice_id: "inv-1",
          allocated_amount_cents: 2000,
          allocation_status: "active",
        },
        {
          id: "alloc-2",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-2",
          target_invoice_id: "inv-1",
          allocated_amount_cents: -500,
          allocation_status: "active",
        },
        {
          id: "alloc-3",
          account_owner_user_id: "owner-1",
          source_internal_invoice_payment_id: "pay-3",
          target_invoice_id: "inv-1",
          allocated_amount_cents: 0,
          allocation_status: "active",
        },
      ],
      "inv-1",
    );

    expect(total).toBe(1500);
  });
});
