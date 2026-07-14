import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateQboInvoiceEligibility,
  QBO_INVOICE_EXCLUSION_REASONS,
} from "../qbo-eligibility";

// ── Read-only fake Supabase ──────────────────────────────────────────────────
// Chained builder that supports only read ops; any write op throws so the test
// fails loudly if the evaluator ever attempts a mutation.
class FakeQuery {
  filters: Array<[string, string, any]> = [];
  constructor(private table: string, private store: Record<string, any[]>, private log: any) {}
  select(_cols?: string) {
    this.log.reads.push({ table: this.table, op: "select" });
    return this;
  }
  eq(col: string, val: any) { this.filters.push(["eq", col, val]); return this; }
  gte(col: string, val: any) { this.filters.push(["gte", col, val]); return this; }
  lte(col: string, val: any) { this.filters.push(["lte", col, val]); return this; }
  in(col: string, arr: any[]) {
    this.filters.push(["in", col, arr]);
    this.log.inFilters.push({ table: this.table, col, values: arr.map(String) });
    return this;
  }
  insert() { this.log.writes.push(["insert", this.table]); throw new Error("WRITE_ATTEMPTED insert"); }
  update() { this.log.writes.push(["update", this.table]); throw new Error("WRITE_ATTEMPTED update"); }
  upsert() { this.log.writes.push(["upsert", this.table]); throw new Error("WRITE_ATTEMPTED upsert"); }
  delete() { this.log.writes.push(["delete", this.table]); throw new Error("WRITE_ATTEMPTED delete"); }
  then(resolve: (v: any) => void, reject: (e: any) => void) {
    try {
      let rows = (this.store[this.table] ?? []).slice();
      for (const [op, col, val] of this.filters) {
        if (op === "eq") rows = rows.filter((r) => String(r[col]) === String(val));
        else if (op === "gte") rows = rows.filter((r) => String(r[col] ?? "") >= String(val));
        else if (op === "lte") rows = rows.filter((r) => String(r[col] ?? "") <= String(val));
        else if (op === "in") rows = rows.filter((r) => (val as any[]).map(String).includes(String(r[col])));
      }
      resolve({ data: rows, error: null });
    } catch (e) {
      reject(e);
    }
  }
}

function makeFake(store: Record<string, any[]>) {
  const log = { reads: [] as any[], writes: [] as any[], fromTables: [] as string[], inFilters: [] as any[] };
  const supabase = {
    from(table: string) {
      log.fromTables.push(table);
      return new FakeQuery(table, store, log);
    },
  };
  return { supabase, log };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ACCT = "acct-1";

function baseStore(): Record<string, any[]> {
  return {
    internal_invoices: [
      { id: "inv-void", account_owner_user_id: ACCT, status: "void", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-07-01", job_id: "job-void", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-draft", account_owner_user_id: ACCT, status: "draft", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-07-01", job_id: "job-draft", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-synced", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: "synced", total_cents: 5000, invoice_date: "2026-07-02", job_id: "job-s", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-skipped", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: "skipped", total_cents: 5000, invoice_date: "2026-07-02", job_id: "job-sk", customer_id: "cust-1", billing_name: "X" },
      // disposition + zero total + no lines all apply → primary must be disposition
      { id: "inv-dispo", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 0, invoice_date: "2026-07-03", job_id: "job-dispo", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-zero", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 0, invoice_date: "2026-07-03", job_id: "job-zero", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-nolines", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-07-03", job_id: "job-nl", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-nocust", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-07-03", job_id: "job-nc", customer_id: null, billing_name: null },
      { id: "inv-ok", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-07-04", invoice_display_number: "DISP-OK", job_id: "job-ok", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-ok-err", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: "error", total_cents: 5000, invoice_date: "2026-07-04", job_id: "job-ok2", customer_id: "cust-1", billing_name: "X" },
      { id: "inv-out", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-05-01", job_id: "job-ok3", customer_id: "cust-1", billing_name: "X" },
      // different account — must never appear
      { id: "inv-other", account_owner_user_id: "acct-2", status: "issued", qbo_sync_status: null, total_cents: 5000, invoice_date: "2026-07-04", job_id: "job-x", customer_id: "cust-1", billing_name: "X" },
    ],
    jobs: [
      { id: "job-dispo", billing_disposition: "externally_billed" },
      { id: "job-zero", billing_disposition: null },
      { id: "job-nl", billing_disposition: null },
      { id: "job-nc", billing_disposition: null },
      { id: "job-ok", billing_disposition: null },
      { id: "job-ok2", billing_disposition: null },
      { id: "job-ok3", billing_disposition: null },
    ],
    customers: [{ id: "cust-1", full_name: "Acme HVAC", billing_name: null, first_name: null, last_name: null }],
    internal_invoice_line_items: [
      { invoice_id: "inv-zero" },
      { invoice_id: "inv-nocust" },
      { invoice_id: "inv-ok" },
      { invoice_id: "inv-ok-err" },
      { invoice_id: "inv-out" },
      // inv-dispo and inv-nolines intentionally have zero line items
    ],
  };
}

function byId(report: any) {
  const map: Record<string, any> = {};
  for (const r of report.results) map[r.invoiceId] = r;
  return map;
}

describe("evaluateQboInvoiceEligibility — precedence & eligibility", () => {
  it("assigns one canonical primary reason per invoice in the locked precedence", async () => {
    const { supabase } = makeFake(baseStore());
    const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    const r = byId(report);

    expect(r["inv-void"].primaryReason).toBe("voided");
    expect(r["inv-draft"].primaryReason).toBe("draft");
    expect(r["inv-synced"].primaryReason).toBe("already_synced");
    expect(r["inv-skipped"].primaryReason).toBe("previously_skipped");
    expect(r["inv-dispo"].primaryReason).toBe("external_billing_or_no_charge");
    expect(r["inv-zero"].primaryReason).toBe("zero_or_invalid_total");
    expect(r["inv-nolines"].primaryReason).toBe("no_line_items");
    expect(r["inv-nocust"].primaryReason).toBe("unresolvable_customer");
    expect(r["inv-ok"].eligible).toBe(true);
    expect(r["inv-ok"].primaryReason).toBeNull();
    // qbo_sync_status='error' is retryable → still eligible
    expect(r["inv-ok-err"].eligible).toBe(true);
  });

  it("excludes other accounts entirely", async () => {
    const { supabase } = makeFake(baseStore());
    const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    expect(byId(report)["inv-other"]).toBeUndefined();
  });

  it("reports diagnostics as a complete superset while primary stays first-hit", async () => {
    const { supabase } = makeFake(baseStore());
    const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    const dispo = byId(report)["inv-dispo"];
    expect(dispo.primaryReason).toBe("external_billing_or_no_charge");
    expect(dispo.diagnostics).toEqual(
      expect.arrayContaining(["external_billing_or_no_charge", "zero_or_invalid_total", "no_line_items"]),
    );
  });

  it("conserves counts: sum(excludedByReason) + eligible === evaluated", async () => {
    const { supabase } = makeFake(baseStore());
    const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    const excluded = QBO_INVOICE_EXCLUSION_REASONS.reduce((sum, k) => sum + report.excludedByReason[k], 0);
    expect(excluded + report.eligible).toBe(report.evaluated);
    expect(report.evaluated).toBe(11); // all ACCT invoices, other account excluded
  });
});

describe("evaluateQboInvoiceEligibility — scope", () => {
  it("applies an inclusive invoice_date scope", async () => {
    const { supabase } = makeFake(baseStore());
    const report = await evaluateQboInvoiceEligibility({
      supabase,
      accountOwnerUserId: ACCT,
      scope: { invoiceDateFrom: "2026-07-01", invoiceDateTo: "2026-07-31" },
    });
    expect(byId(report)["inv-out"]).toBeUndefined(); // May row filtered out
    expect(report.evaluated).toBe(10);
  });

  it("applies an invoice-number scope against number or display number", async () => {
    const { supabase } = makeFake(baseStore());
    const report = await evaluateQboInvoiceEligibility({
      supabase,
      accountOwnerUserId: ACCT,
      scope: { invoiceNumbers: ["DISP-OK"] },
    });
    expect(report.evaluated).toBe(1);
    expect(report.results[0].invoiceId).toBe("inv-ok");
  });
});

describe("evaluateQboInvoiceEligibility — read-only & short-circuit guarantees", () => {
  it("never attempts a write", async () => {
    const { supabase, log } = makeFake(baseStore());
    await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    expect(log.writes).toEqual([]);
  });

  it("does NOT read content tables when only terminal-state invoices exist", async () => {
    const terminalOnly: Record<string, any[]> = {
      internal_invoices: [
        { id: "v", account_owner_user_id: ACCT, status: "void", qbo_sync_status: null, job_id: "j1", customer_id: "cust-1" },
        { id: "d", account_owner_user_id: ACCT, status: "draft", qbo_sync_status: null, job_id: "j2", customer_id: "cust-1" },
        { id: "s", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: "synced", job_id: "j3", customer_id: "cust-1" },
        { id: "k", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: "skipped", job_id: "j4", customer_id: "cust-1" },
      ],
      jobs: [],
      customers: [],
      internal_invoice_line_items: [],
    };
    const { supabase, log } = makeFake(terminalOnly);
    const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    expect(report.eligible).toBe(0);
    // Only the invoices table is ever touched — proves the short-circuit.
    expect(log.fromTables).toEqual(["internal_invoices"]);
  });

  it("only queries content tables with content-stage ids (terminal job ids excluded)", async () => {
    const { supabase, log } = makeFake(baseStore());
    await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    const jobsIn = log.inFilters.find((f: any) => f.table === "jobs");
    expect(jobsIn.values).not.toEqual(expect.arrayContaining(["job-void", "job-draft", "job-s", "job-sk"]));
  });
});

describe("evaluateQboInvoiceEligibility — sync-start cutoff", () => {
  const cutoffStore: Record<string, any[]> = {
    internal_invoices: [
      { id: "old", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 5000, issued_at: "2026-06-10T10:00:00Z", job_id: "j1", customer_id: "cust-1", billing_name: "X" },
      { id: "new", account_owner_user_id: ACCT, status: "issued", qbo_sync_status: null, total_cents: 5000, issued_at: "2026-07-20T10:00:00Z", job_id: "j2", customer_id: "cust-1", billing_name: "X" },
    ],
    jobs: [{ id: "j1", billing_disposition: null }, { id: "j2", billing_disposition: null }],
    customers: [{ id: "cust-1", full_name: "Acme HVAC" }],
    internal_invoice_line_items: [{ invoice_id: "old" }, { invoice_id: "new" }],
  };

  it("excludes invoices issued before the cutoff as before_sync_start", async () => {
    const { supabase } = makeFake(cutoffStore);
    const report = await evaluateQboInvoiceEligibility({
      supabase,
      accountOwnerUserId: ACCT,
      scope: { issuedOnOrAfter: "2026-07-01" },
    });
    const r = byId(report);
    expect(r["old"].primaryReason).toBe("before_sync_start");
    expect(r["new"].eligible).toBe(true);
    expect(report.eligible).toBe(1);
    expect(report.excludedByReason.before_sync_start).toBe(1);
  });

  it("with no cutoff, both issued invoices are eligible", async () => {
    const { supabase } = makeFake(cutoffStore);
    const report = await evaluateQboInvoiceEligibility({ supabase, accountOwnerUserId: ACCT });
    expect(report.eligible).toBe(2);
  });

  it("a cutoff after all issued dates yields 0 eligible (the connect-now baseline)", async () => {
    const { supabase } = makeFake(cutoffStore);
    const report = await evaluateQboInvoiceEligibility({
      supabase,
      accountOwnerUserId: ACCT,
      scope: { issuedOnOrAfter: "2026-12-31" },
    });
    expect(report.eligible).toBe(0);
    expect(report.excludedByReason.before_sync_start).toBe(2);
  });
});

describe("qbo-eligibility source — structural zero-write / zero-QBO lock", () => {
  const source = readFileSync(resolve(__dirname, "../qbo-eligibility.ts"), "utf-8");

  it("imports nothing from the QBO API client and resolves no tokens", () => {
    expect(source).not.toContain("qbo-api-client");
    expect(source).not.toContain("getValidQboAccessToken");
    expect(source).not.toContain("findOrCreateQbo");
  });

  it("contains no mutation calls", () => {
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.upsert\(/);
    expect(source).not.toMatch(/\.delete\(/);
    // No invocation of the sync-path mutators (doc-comment mentions are allowed).
    expect(source).not.toMatch(/updateInvoiceSyncFields\(/);
    expect(source).not.toMatch(/revalidatePath\(/);
  });
});
