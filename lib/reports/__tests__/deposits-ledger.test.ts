import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildDepositsLedgerViewModel,
  getDepositsLedgerSummary,
} from "@/lib/reports/deposits-ledger";

function settlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "set_1",
    account_owner_user_id: "owner-1",
    internal_invoice_payment_id: "pay-1",
    stripe_balance_transaction_id: "txn_1",
    stripe_payout_id: "po_1",
    settlement_kind: "payment",
    gross_amount_cents: 50000,
    stripe_fee_cents: 1500,
    platform_fee_cents: 500,
    net_amount_cents: 48000,
    currency: "usd",
    available_on: "2026-06-11T00:00:00.000Z",
    payout_arrival_date: "2026-06-12T00:00:00.000Z",
    payout_status: "paid",
    reporting_category: "charge",
    sync_status: "synced",
    sync_error: null,
    ...overrides,
  };
}

function makeSupabase(rows: any[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  function query(table: string) {
    const q: any = {
      select(payload: unknown) {
        calls.push({ table, op: "select", payload });
        return q;
      },
      eq(column: string, value: unknown) {
        calls.push({ table, op: `eq:${column}`, payload: value });
        return q;
      },
      order(column: string, payload: unknown) {
        calls.push({ table, op: `order:${column}`, payload });
        return Promise.resolve({ data: rows, error: null });
      },
      insert(payload: unknown) {
        calls.push({ table, op: "insert", payload });
        throw new Error("read model must not insert");
      },
      update(payload: unknown) {
        calls.push({ table, op: "update", payload });
        throw new Error("read model must not update");
      },
      upsert(payload: unknown) {
        calls.push({ table, op: "upsert", payload });
        throw new Error("read model must not upsert");
      },
      delete() {
        calls.push({ table, op: "delete" });
        throw new Error("read model must not delete");
      },
    };
    return q;
  }

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ table, op: "from" });
        return query(table);
      },
    },
  };
}

describe("deposits ledger read model", () => {
  it("groups settlement rows by payout id", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ id: "set_1", stripe_payout_id: "po_1", gross_amount_cents: 10000, net_amount_cents: 9500, stripe_fee_cents: 500, platform_fee_cents: 0 }),
      settlement({ id: "set_2", stripe_payout_id: "po_1", gross_amount_cents: 20000, net_amount_cents: 19000, stripe_fee_cents: 1000, platform_fee_cents: 0 }),
      settlement({ id: "set_3", stripe_payout_id: "po_2", gross_amount_cents: 30000, net_amount_cents: 28500, stripe_fee_cents: 1500, platform_fee_cents: 0 }),
    ]);

    expect(view.rows).toHaveLength(2);
    expect(view.rows.find((row) => row.payoutId === "po_1")?.grossCollectedCents).toBe(30000);
    expect(view.rows.find((row) => row.payoutId === "po_1")?.paymentCount).toBe(2);
  });

  it("groups no-payout rows into pending/no-payout bucket", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ stripe_payout_id: null, payout_status: "pending" }),
    ]);

    expect(view.rows[0]?.groupKey).toBe("pending:no-payout");
    expect(view.rows[0]?.payoutLabel).toBe("Pending / No Payout");
    expect(view.summary.pendingPayoutsCents).toBe(48000);
  });

  it("groups unmatched rows into needs-review/unmatched bucket", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({
        internal_invoice_payment_id: null,
        settlement_kind: "unmatched",
        sync_status: "unmatched",
        gross_amount_cents: 99999,
        net_amount_cents: 99999,
      }),
    ]);

    expect(view.rows[0]?.groupKey).toBe("unmatched");
    expect(view.rows[0]?.needsReview).toBe(true);
    expect(view.summary.unmatchedNeedsReviewCount).toBe(1);
    expect(view.summary.grossCollectedCents).toBe(0);
  });

  it("computes Gross Collected from synced payment settlements only", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ settlement_kind: "payment", gross_amount_cents: 50000 }),
      settlement({ settlement_kind: "refund", gross_amount_cents: -10000, net_amount_cents: -10000 }),
      settlement({ settlement_kind: "payment", sync_status: "failed", gross_amount_cents: 70000 }),
    ]);

    expect(view.summary.grossCollectedCents).toBe(50000);
  });

  it("computes Fees & Adjustments as a combined display rollup", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ gross_amount_cents: 50000, stripe_fee_cents: 1500, platform_fee_cents: 500, net_amount_cents: 48000 }),
      settlement({ id: "refund_1", settlement_kind: "refund", gross_amount_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_amount_cents: -10000 }),
    ]);

    expect(view.summary.feesAndAdjustmentsCents).toBe(12000);
    expect(view.summary.grossCollectedCents - view.summary.feesAndAdjustmentsCents).toBe(view.summary.netDepositsCents);
  });

  it("computes Net Deposits from stored net amounts", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ net_amount_cents: 48000 }),
      settlement({ id: "adj_1", settlement_kind: "payout_adjustment", gross_amount_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_amount_cents: -3000 }),
    ]);

    expect(view.summary.netDepositsCents).toBe(45000);
  });

  it("does not guess platform/application fees", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({
        gross_amount_cents: 50000,
        stripe_fee_cents: 1500,
        platform_fee_cents: 0,
        net_amount_cents: 48000,
      }),
    ]);

    expect(view.summary.feesAndAdjustmentsCents).toBe(1500);
    expect(view.rows[0]?.feesAndAdjustmentsCents).toBe(1500);
  });

  it("failed sync rows do not inflate collected or net totals", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ sync_status: "failed", gross_amount_cents: 50000, net_amount_cents: 48000 }),
    ]);

    expect(view.summary.grossCollectedCents).toBe(0);
    expect(view.summary.netDepositsCents).toBe(0);
    expect(view.summary.unmatchedNeedsReviewCount).toBe(1);
    expect(view.rows[0]?.failedSyncCount).toBe(1);
  });

  it("pending and unmatched rows surface as needs review", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ id: "pending_1", sync_status: "pending" }),
      settlement({ id: "unmatched_1", settlement_kind: "unmatched", sync_status: "unmatched", internal_invoice_payment_id: null }),
    ]);

    expect(view.rows.some((row) => row.pendingSyncCount === 1)).toBe(true);
    expect(view.summary.unmatchedNeedsReviewCount).toBe(1);
    expect(view.rows.find((row) => row.groupKey === "unmatched")?.needsReview).toBe(true);
  });

  it("requires account scope", async () => {
    await expect(
      getDepositsLedgerSummary({
        supabase: makeSupabase([]).client,
        accountOwnerUserId: "",
      }),
    ).rejects.toThrow(/accountOwnerUserId/i);
  });

  it("date filters apply to payout arrival date, falling back to available_on", async () => {
    const ctx = makeSupabase([
      settlement({ id: "in_arrival", payout_arrival_date: "2026-06-12T00:00:00.000Z", available_on: "2026-06-01T00:00:00.000Z" }),
      settlement({ id: "out_arrival", payout_arrival_date: "2026-06-20T00:00:00.000Z", available_on: "2026-06-12T00:00:00.000Z" }),
      settlement({ id: "in_available", payout_arrival_date: null, available_on: "2026-06-12T00:00:00.000Z", stripe_payout_id: null, payout_status: "pending" }),
    ]);

    const view = await getDepositsLedgerSummary({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      dateFrom: "2026-06-10T00:00:00.000Z",
      dateTo: "2026-06-13T00:00:00.000Z",
    });

    expect(view.summary.grossCollectedCents).toBe(100000);
    expect(view.rows.flatMap((row) => row.groupKey)).toEqual(expect.arrayContaining(["payout:po_1", "pending:no-payout"]));
  });

  it("reads only settlement truth and not manual/off-platform payment truth", async () => {
    const ctx = makeSupabase([settlement()]);
    await getDepositsLedgerSummary({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
    });

    expect(ctx.calls.some((call) => call.table === "stripe_payment_settlements")).toBe(true);
    expect(ctx.calls.some((call) => call.table === "internal_invoice_payments")).toBe(false);
  });

  it("does not call invoice/payment/allocation mutation paths", async () => {
    const ctx = makeSupabase([settlement()]);
    await getDepositsLedgerSummary({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
    });

    expect(ctx.calls.some((call) => ["insert", "update", "upsert", "delete"].includes(call.op))).toBe(false);
    expect(ctx.calls.some((call) => ["internal_invoices", "internal_invoice_payments", "internal_invoice_payment_allocations"].includes(call.table))).toBe(false);
  });

  it("empty state returns safe zero summary and empty rows", () => {
    const view = buildDepositsLedgerViewModel([]);

    expect(view.summary).toEqual({
      grossCollectedCents: 0,
      feesAndAdjustmentsCents: 0,
      netDepositsCents: 0,
      pendingPayoutsCents: 0,
      unmatchedNeedsReviewCount: 0,
      currency: "usd",
      hasMultipleCurrencies: false,
    });
    expect(view.rows).toEqual([]);
  });

  it("multiple currencies are flagged and not silently combined", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({ id: "usd_1", currency: "usd" }),
      settlement({ id: "cad_1", currency: "cad", gross_amount_cents: 10000, net_amount_cents: 9500, stripe_fee_cents: 500 }),
    ]);

    expect(view.summary.currency).toBe("mixed");
    expect(view.summary.hasMultipleCurrencies).toBe(true);
    expect(view.summary.grossCollectedCents).toBe(0);
    expect(view.perCurrencySummaries.map((row) => row.currency).sort()).toEqual(["cad", "usd"]);
    expect(view.warnings[0]).toMatch(/Multiple currencies/);
  });

  it("does not add CSV, export, UI, or route wiring", () => {
    const reportSource = fs.readFileSync(
      path.join(process.cwd(), "lib/reports/deposits-ledger.ts"),
      "utf8",
    );

    expect(reportSource).not.toMatch(/csv|export\s+route|revalidatePath|redirect\(/i);
    expect(fs.existsSync(path.join(process.cwd(), "app/reports/deposits"))).toBe(false);
  });
});
