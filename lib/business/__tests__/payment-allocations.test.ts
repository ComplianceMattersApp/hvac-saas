import { describe, expect, it } from "vitest";
import {
  deriveCompatibilityInvoiceAllocations,
  sumActiveInvoiceAllocationCents,
  sumActivePersistedInvoiceAllocationCents,
  upsertInvoicePaymentAllocationForPaymentRow,
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

  describe("persisted allocation write helper foundation", () => {
    function makeSupabaseMock(params?: {
      paymentRows?: Array<{
        id: string;
        account_owner_user_id: string;
        invoice_id: string;
        amount_cents: number;
        payment_status: string;
      }>;
      existingAllocations?: Array<{
        id: string;
        account_owner_user_id: string;
        source_internal_invoice_payment_id: string;
        target_invoice_id: string;
        allocated_amount_cents: number;
        allocation_status: "active" | "inactive" | "reversed" | "voided";
        allocation_source_kind?: string;
      }>;
    }) {
      const paymentRows = new Map(
        (params?.paymentRows ?? []).map((row) => [row.id, { ...row }]),
      );
      const allocations = new Map(
        (params?.existingAllocations ?? []).map((row) => [
          row.source_internal_invoice_payment_id,
          {
            ...row,
            allocation_source_kind: row.allocation_source_kind ?? "invoice_payment_record",
          },
        ]),
      );
      const touchedTables: string[] = [];

      const supabase = {
        from(table: string) {
          touchedTables.push(table);

          if (table === "internal_invoice_payments") {
            return {
              select() {
                return {
                  eq(_column: string, value: string) {
                    return {
                      async maybeSingle() {
                        return {
                          data: paymentRows.get(String(value).trim()) ?? null,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === "internal_invoice_payment_allocations") {
            return {
              select() {
                return {
                  eq(_column: string, value: string) {
                    return {
                      async maybeSingle() {
                        return {
                          data: allocations.get(String(value).trim()) ?? null,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
              upsert(payload: any) {
                const sourceId = String(payload?.source_internal_invoice_payment_id ?? "").trim();
                const existing = allocations.get(sourceId);
                const next = {
                  id: existing?.id ?? `alloc-${allocations.size + 1}`,
                  account_owner_user_id: String(payload?.account_owner_user_id ?? "").trim(),
                  source_internal_invoice_payment_id: sourceId,
                  target_invoice_id: String(payload?.target_invoice_id ?? "").trim(),
                  allocated_amount_cents: Number(payload?.allocated_amount_cents ?? 0) || 0,
                  allocation_status: payload?.allocation_status,
                  allocation_source_kind: String(payload?.allocation_source_kind ?? "").trim(),
                };
                allocations.set(sourceId, next);

                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: {
                            id: next.id,
                            allocation_status: next.allocation_status,
                          },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        },
      };

      return {
        supabase,
        allocations,
        touchedTables,
      };
    }

    it("maps recorded payment to active allocation", async () => {
      const { supabase } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-1",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 1200,
            payment_status: "recorded",
          },
        ],
      });

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-1",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe("created");
      expect(result.allocationStatus).toBe("active");
    });

    it("maps failed payment to inactive allocation", async () => {
      const { supabase } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-2",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 1200,
            payment_status: "failed",
          },
        ],
      });

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-2",
      });

      expect(result.ok).toBe(true);
      expect(result.allocationStatus).toBe("inactive");
    });

    it("maps pending payment to inactive allocation", async () => {
      const { supabase } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-3",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 1200,
            payment_status: "pending",
          },
        ],
      });

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-3",
      });

      expect(result.ok).toBe(true);
      expect(result.allocationStatus).toBe("inactive");
    });

    it("maps reversed payment to reversed allocation", async () => {
      const { supabase } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-4",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 1200,
            payment_status: "reversed",
          },
        ],
      });

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-4",
      });

      expect(result.ok).toBe(true);
      expect(result.allocationStatus).toBe("reversed");
    });

    it("preserves signed and zero amount parity", async () => {
      const { supabase, allocations } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-neg",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: -500,
            payment_status: "recorded",
          },
          {
            id: "pay-zero",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 0,
            payment_status: "recorded",
          },
        ],
      });

      const neg = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-neg",
      });
      const zero = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-zero",
      });

      expect(neg.ok).toBe(true);
      expect(zero.ok).toBe(true);
      expect(allocations.get("pay-neg")?.allocated_amount_cents).toBe(-500);
      expect(allocations.get("pay-zero")?.allocated_amount_cents).toBe(0);
    });

    it("prevents duplicate allocation row writes by source idempotency", async () => {
      const { supabase, allocations } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-idem",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 100,
            payment_status: "recorded",
          },
        ],
      });

      const first = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-idem",
      });
      const second = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-idem",
      });

      expect(first.status).toBe("created");
      expect(second.status).toBe("deduped");
      expect(allocations.size).toBe(1);
    });

    it("updates existing allocation when payment status changes recorded to reversed", async () => {
      const { supabase, allocations } = makeSupabaseMock();

      const created = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentRow: {
          id: "pay-change",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          amount_cents: 100,
          payment_status: "recorded",
        },
      });

      const updated = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentRow: {
          id: "pay-change",
          account_owner_user_id: "owner-1",
          invoice_id: "inv-1",
          amount_cents: 100,
          payment_status: "reversed",
        },
      });

      expect(created.status).toBe("created");
      expect(updated.status).toBe("updated");
      expect(updated.allocationStatus).toBe("reversed");
      expect(allocations.get("pay-change")?.allocation_status).toBe("reversed");
    });

    it("returns blocked result when source payment row is missing", async () => {
      const { supabase } = makeSupabaseMock();

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "missing",
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(String(result.reason ?? "")).toContain("not found");
    });

    it("blocks rows missing invoice id or account scope", async () => {
      const { supabase } = makeSupabaseMock();

      const missingInvoice = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentRow: {
          id: "pay-miss-inv",
          account_owner_user_id: "owner-1",
          invoice_id: "",
          amount_cents: 100,
          payment_status: "recorded",
        },
      });

      const missingOwner = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentRow: {
          id: "pay-miss-owner",
          account_owner_user_id: "",
          invoice_id: "inv-1",
          amount_cents: 100,
          payment_status: "recorded",
        },
      });

      expect(missingInvoice.status).toBe("blocked");
      expect(missingOwner.status).toBe("blocked");
    });

    it("does not touch invoice projection reads or internal invoice table", async () => {
      const { supabase, touchedTables } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-projection",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 100,
            payment_status: "recorded",
          },
        ],
      });

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-projection",
      });

      expect(result.ok).toBe(true);
      expect(touchedTables).toContain("internal_invoice_payments");
      expect(touchedTables).toContain("internal_invoice_payment_allocations");
      expect(touchedTables).not.toContain("internal_invoices");
    });

    it("does not require service-plan target fields and does not call Stripe/webhook paths", async () => {
      const { supabase, allocations, touchedTables } = makeSupabaseMock({
        paymentRows: [
          {
            id: "pay-no-sp",
            account_owner_user_id: "owner-1",
            invoice_id: "inv-1",
            amount_cents: 100,
            payment_status: "recorded",
          },
        ],
      });

      const result = await upsertInvoicePaymentAllocationForPaymentRow({
        supabase,
        paymentId: "pay-no-sp",
      });

      const row = allocations.get("pay-no-sp");

      expect(result.ok).toBe(true);
      expect(String(row?.allocation_source_kind ?? "")).toBe("invoice_payment_record");
      expect(Object.prototype.hasOwnProperty.call(row ?? {}, "target_service_plan_billing_period_id")).toBe(false);
      expect(touchedTables.some((table) => table.includes("stripe"))).toBe(false);
      expect(touchedTables.some((table) => table.includes("webhook"))).toBe(false);
    });
  });
});
