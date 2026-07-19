import { describe, expect, it } from "vitest";
import {
  buildDepositsDetailCsv,
  buildDepositsLedgerViewModel,
  buildDepositsSummaryCsv,
  depositDetailHrefForGroup,
  getDepositDetailExportRows,
  getDepositDetailLedger,
  getDepositsLedgerSummary,
} from "@/lib/reports/deposits-ledger";

function settlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "set_1",
    account_owner_user_id: "owner-1",
    internal_invoice_payment_id: "pay-1",
    stripe_charge_id: "ch_123",
    stripe_payment_intent_id: "pi_123",
    stripe_checkout_session_id: "cs_123",
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

function makeDepositDetailSupabase(tables: Record<string, any[]>) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  type QueryFilter = { column: string; value: unknown; op: "eq" | "in" };

  function query(table: string) {
    let filters: QueryFilter[] = [];
    const q: any = {
      select(payload: unknown) {
        calls.push({ table, op: "select", payload });
        return q;
      },
      eq(column: string, value: unknown) {
        calls.push({ table, op: `eq:${column}`, payload: value });
        filters.push({ column, value, op: "eq" });
        return q;
      },
      in(column: string, value: unknown[]) {
        calls.push({ table, op: `in:${column}`, payload: value });
        filters.push({ column, value, op: "in" });
        return Promise.resolve({ data: applyFilters(tables[table] ?? [], filters), error: null });
      },
      order(column: string, payload: unknown) {
        calls.push({ table, op: `order:${column}`, payload });
        return Promise.resolve({ data: applyFilters(tables[table] ?? [], filters), error: null });
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

  function applyFilters(rows: any[], filtersToApply: QueryFilter[]) {
    return rows.filter((row) =>
      filtersToApply.every((filter) => {
        if (filter.op === "eq") return row[filter.column] === filter.value;
        return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
      }),
    );
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
    expect(view.rows.find((row) => row.groupKey === "payout:po_1")).toMatchObject({
      processingFeesCents: 1500,
      otherDeductionsCents: 500,
    });
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

  it("builds bookkeeping summary CSV with stable headers, escaping, and mixed-currency markers", () => {
    const view = buildDepositsLedgerViewModel([
      settlement({
        stripe_payout_id: "po_1",
        payout_status: "paid",
        gross_amount_cents: 50000,
        stripe_fee_cents: 1500,
        platform_fee_cents: 500,
        net_amount_cents: 48000,
      }),
      settlement({
        id: "set_2",
        stripe_payout_id: "po_1",
        payout_status: "paid",
        currency: "cad",
        gross_amount_cents: 10000,
        stripe_fee_cents: 300,
        platform_fee_cents: 0,
        net_amount_cents: 9700,
      }),
      settlement({
        id: "set_unmatched",
        stripe_payout_id: null,
        payout_status: "pending",
        internal_invoice_payment_id: null,
        settlement_kind: "unmatched",
        sync_status: "unmatched",
      }),
    ]);

    const csv = buildDepositsSummaryCsv(view.rows);

    expect(csv.split("\r\n")[0]).toBe(
      "Payout ID,Payout Label,Payout Status,Payout Arrival Date,Available Date / Date Range,Gross Collected,Fees & Adjustments,Net Deposit,Currency,Payment Count,Unmatched Count,Failed Sync Count,Pending Sync Count,Needs Review,Sync Status Summary",
    );
    expect(csv).toContain("po_1,po_1,paid,2026-06-12T00:00:00.000Z,2026-06-11T00:00:00.000Z,600.00,23.00,577.00,mixed,2,0,0,0,Yes,synced:2");
    expect(csv).toContain(",Unmatched / Needs Review,pending,2026-06-12T00:00:00.000Z,2026-06-11T00:00:00.000Z,0.00,0.00,0.00,usd,0,1,0,0,Yes,unmatched:1");
  });

  it("builds bookkeeping detail CSV with Stripe identifiers, fee breakdown, unmatched markers, and escaping", () => {
    const csv = buildDepositsDetailCsv([
      {
        settlementId: "set_1",
        payoutId: "po_1",
        payoutStatus: "paid",
        payoutArrivalDate: "2026-06-12T00:00:00.000Z",
        payoutGroupKey: "payout:po_1",
        payoutHref: "/reports/deposits/po_1",
        internalInvoicePaymentId: "pay-1",
        invoiceId: "inv-1",
        invoiceLabel: 'INV-1001, "Quoted"',
        customerName: "Ada\nCustomer",
        jobId: "job-1",
        jobReference: "JOB-55",
        jobTitle: "Heat pump test",
        grossCents: 50000,
        feesAndAdjustmentsCents: 2000,
        stripeFeeCents: 1500,
        platformFeeCents: 500,
        netCents: 48000,
        currency: "usd",
        paymentDate: "2026-06-10T00:00:00.000Z",
        availableDate: "2026-06-11T00:00:00.000Z",
        chargeId: "ch_123",
        paymentIntentId: "pi_123",
        checkoutSessionId: "cs_123",
        balanceTransactionId: "txn_1",
        settlementKind: "payment",
        reportingCategory: "charge",
        syncStatus: "synced",
        syncError: null,
        needsReview: false,
        needsReviewLabels: [],
      },
      {
        settlementId: "set_unmatched",
        payoutId: null,
        payoutStatus: "pending",
        payoutArrivalDate: null,
        payoutGroupKey: "unmatched",
        payoutHref: "/reports/deposits/unmatched",
        internalInvoicePaymentId: null,
        invoiceId: null,
        invoiceLabel: "Unmatched Stripe item",
        customerName: "No local payment link",
        jobId: null,
        jobReference: "No local payment link",
        jobTitle: "No local payment link",
        grossCents: 0,
        feesAndAdjustmentsCents: 0,
        stripeFeeCents: 0,
        platformFeeCents: 0,
        netCents: 0,
        currency: "usd",
        paymentDate: null,
        availableDate: "2026-06-11T00:00:00.000Z",
        chargeId: null,
        paymentIntentId: null,
        checkoutSessionId: null,
        balanceTransactionId: null,
        settlementKind: "unmatched",
        reportingCategory: null,
        syncStatus: "unmatched",
        syncError: "missing local payment",
        needsReview: true,
        needsReviewLabels: ["Needs Review", "Unmatched"],
      },
    ]);

    expect(csv.split("\r\n")[0]).toBe(
      "Payout ID,Payout Status,Payout Arrival Date,Available Date,Payment ID,Invoice Number,Customer,Job Reference,Job Title,Gross Amount,Fees & Adjustments,Stripe Fee,Platform/Application Fee,Net Amount,Currency,Settlement Kind,Reporting Category,Charge ID,Payment Intent ID,Checkout Session ID,Balance Transaction ID,Notes / Reference,Unmatched Marker,Sync Status,Sync Error",
    );
    expect(csv).toContain('pay-1,"INV-1001, ""Quoted""","Ada\nCustomer",JOB-55,Heat pump test,500.00,20.00,15.00,5.00,480.00,usd,payment,charge,ch_123,pi_123,cs_123,txn_1,,No,synced,');
    expect(csv).toContain("Unmatched Stripe item,No local payment link,No local payment link,No local payment link,0.00,0.00,0.00,0.00,0.00,usd,unmatched,,,,,,Needs Review | Unmatched,Yes,unmatched,missing local payment");
  });

  it("builds stable detail links for real and synthetic payout groups", () => {
    expect(depositDetailHrefForGroup({ payoutId: "po_123", groupKey: "payout:po_123" })).toBe("/reports/deposits/po_123");
    expect(depositDetailHrefForGroup({ payoutId: null, groupKey: "pending:no-payout" })).toBe("/reports/deposits/pending%3Ano-payout");
    expect(depositDetailHrefForGroup({ payoutId: null, groupKey: "unmatched" })).toBe("/reports/deposits/unmatched");
  });

  it("detail route scopes by account owner and renders real payout rows with local context", async () => {
    const ctx = makeDepositDetailSupabase({
      stripe_payment_settlements: [settlement({ id: "set_1", account_owner_user_id: "owner-1", stripe_payout_id: "po_1" })],
      internal_invoice_payments: [{ id: "pay-1", invoice_id: "inv-1", job_id: "job-1", paid_at: "2026-06-10T00:00:00.000Z" }],
      internal_invoices: [{ id: "inv-1", invoice_display_number: "INV-1001", invoice_number: "1001", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", full_name: "Ada Customer", first_name: null, last_name: null }],
      jobs: [{ id: "job-1", job_display_number: "JOB-55", title: "Heat pump test" }],
    });

    const detail = await getDepositDetailLedger({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      payoutGroupId: "po_1",
    });

    expect(detail.found).toBe(true);
    expect(detail.payoutId).toBe("po_1");
    expect(detail.rows[0]).toEqual(expect.objectContaining({
      invoiceLabel: "INV-1001",
      customerName: "Ada Customer",
      jobReference: "JOB-55",
      jobTitle: "Heat pump test",
      chargeId: "ch_123",
      paymentIntentId: "pi_123",
      balanceTransactionId: "txn_1",
    }));
    expect(ctx.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "stripe_payment_settlements", op: "eq:account_owner_user_id", payload: "owner-1" }),
    ]));
  });

  it("detail route renders pending:no-payout synthetic group safely", async () => {
    const ctx = makeDepositDetailSupabase({
      stripe_payment_settlements: [settlement({ stripe_payout_id: null, payout_status: "pending" })],
    });

    const detail = await getDepositDetailLedger({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      payoutGroupId: "pending:no-payout",
    });

    expect(detail.found).toBe(true);
    expect(detail.groupKey).toBe("pending:no-payout");
    expect(detail.payoutLabel).toBe("Pending / No Payout");
    expect(detail.rows[0]?.needsReview).toBe(false);
  });

  it("detail route renders unmatched synthetic group and keeps rows visible", async () => {
    const ctx = makeDepositDetailSupabase({
      stripe_payment_settlements: [
        settlement({
          id: "set_unmatched",
          internal_invoice_payment_id: null,
          settlement_kind: "unmatched",
          sync_status: "unmatched",
          stripe_payout_id: null,
        }),
      ],
    });

    const detail = await getDepositDetailLedger({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      payoutGroupId: "unmatched",
    });

    expect(detail.found).toBe(true);
    expect(detail.rows[0]?.invoiceLabel).toBe("Unmatched Stripe item");
    expect(detail.rows[0]?.customerName).toBe("No local payment link");
    expect(detail.rows[0]?.needsReview).toBe(true);
    expect(detail.rows[0]?.needsReviewLabels).toEqual(expect.arrayContaining(["Needs Review", "Unmatched"]));
  });

  it("detail export preserves filters, optional payout group, and stored fee breakdown without guessing platform fees", async () => {
    const ctx = makeDepositDetailSupabase({
      stripe_payment_settlements: [
        settlement({
          id: "included",
          stripe_payout_id: "po_1",
          payout_status: "paid",
          sync_status: "synced",
          platform_fee_cents: null,
        }),
        settlement({
          id: "other_payout",
          stripe_payout_id: "po_2",
          payout_status: "paid",
          sync_status: "synced",
        }),
        settlement({
          id: "failed",
          stripe_payout_id: "po_1",
          payout_status: "paid",
          sync_status: "failed",
        }),
      ],
      internal_invoice_payments: [{ id: "pay-1", invoice_id: "inv-1", job_id: "job-1", paid_at: "2026-06-10T00:00:00.000Z" }],
      internal_invoices: [{ id: "inv-1", invoice_display_number: "INV-1001", invoice_number: "1001", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", full_name: "Ada Customer", first_name: null, last_name: null }],
      jobs: [{ id: "job-1", job_display_number: "JOB-55", title: "Heat pump test" }],
    });

    const rows = await getDepositDetailExportRows({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      payoutGroupId: "po_1",
      payoutStatus: "paid",
      syncStatus: "synced",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      payoutId: "po_1",
      invoiceLabel: "INV-1001",
      stripeFeeCents: 1500,
      platformFeeCents: 0,
      feesAndAdjustmentsCents: 1500,
      syncStatus: "synced",
    }));
    expect(ctx.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "stripe_payment_settlements", op: "eq:account_owner_user_id", payload: "owner-1" }),
      expect.objectContaining({ table: "stripe_payment_settlements", op: "eq:payout_status", payload: "paid" }),
      expect.objectContaining({ table: "stripe_payment_settlements", op: "eq:sync_status", payload: "synced" }),
    ]));
  });

  it("missing local context does not hide the settlement row", async () => {
    const ctx = makeDepositDetailSupabase({
      stripe_payment_settlements: [settlement({ id: "set_missing_context", internal_invoice_payment_id: "pay-missing" })],
      internal_invoice_payments: [],
      internal_invoices: [],
      customers: [],
      jobs: [],
    });

    const detail = await getDepositDetailLedger({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      payoutGroupId: "po_1",
    });

    expect(detail.rows).toHaveLength(1);
    expect(detail.rows[0]?.invoiceLabel).toBe("Unmatched Stripe item");
    expect(detail.rows[0]?.customerName).toBe("No local payment link");
  });

  it("not-found state does not leak cross-account payout existence", async () => {
    const ctx = makeDepositDetailSupabase({
      stripe_payment_settlements: [settlement({ account_owner_user_id: "owner-2", stripe_payout_id: "po_secret" })],
    });

    const detail = await getDepositDetailLedger({
      supabase: ctx.client,
      accountOwnerUserId: "owner-1",
      payoutGroupId: "po_secret",
    });

    expect(detail.found).toBe(false);
    expect(detail.rows).toEqual([]);
    expect(detail.summary.grossCollectedCents).toBe(0);
  });
});
