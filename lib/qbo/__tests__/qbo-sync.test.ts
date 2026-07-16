import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getValidQboAccessToken,
  recordQboConnectionSyncOutcome,
  getQboConnectionForAccount,
  findOrCreateQboServicesItem,
  findOrCreateQboCustomer,
  findQboInvoiceByDocNumber,
  createQboInvoice,
  updateQboInvoice,
} = vi.hoisted(() => ({
  getValidQboAccessToken: vi.fn(),
  recordQboConnectionSyncOutcome: vi.fn(),
  getQboConnectionForAccount: vi.fn(),
  findOrCreateQboServicesItem: vi.fn(),
  findOrCreateQboCustomer: vi.fn(),
  findQboInvoiceByDocNumber: vi.fn(),
  createQboInvoice: vi.fn(),
  updateQboInvoice: vi.fn(),
}));
vi.mock("@/lib/qbo/qbo-connection", () => ({
  getValidQboAccessToken,
  recordQboConnectionSyncOutcome,
  getQboConnectionForAccount,
}));
vi.mock("@/lib/qbo/qbo-api-client", () => ({
  findOrCreateQboServicesItem,
  findOrCreateQboCustomer,
  findQboInvoiceByDocNumber,
  createQboInvoice,
  updateQboInvoice,
}));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboBaseUrl: () => "https://sandbox.example.com" }));

import { syncAllPendingInvoicesToQbo, syncInvoiceToQbo } from "@/lib/qbo/qbo-sync";

/**
 * Fake supabase that serves per-table `single` (for .maybeSingle) and `list`
 * (for awaited chains) and records .update() payloads per table.
 */
function makeSupabase(tables: Record<string, { single?: any; list?: any[] }>) {
  const updates: Record<string, any[]> = {};
  const builder: any = { __table: "" };
  Object.assign(builder, {
    from: vi.fn((t: string) => {
      builder.__table = t;
      return builder;
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: tables[builder.__table]?.single ?? null, error: null })),
    update: vi.fn((payload: any) => {
      (updates[builder.__table] ??= []).push(payload);
      return builder;
    }),
    then: (resolve: (v: any) => void) =>
      resolve({ data: tables[builder.__table]?.list ?? [], error: null }),
  });
  return { builder, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  getValidQboAccessToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  getQboConnectionForAccount.mockResolvedValue(null);
  recordQboConnectionSyncOutcome.mockResolvedValue(undefined);
  findOrCreateQboServicesItem.mockResolvedValue("7");
  findOrCreateQboCustomer.mockResolvedValue({ id: "C1", syncToken: "0" });
  findQboInvoiceByDocNumber.mockResolvedValue(null);
  createQboInvoice.mockResolvedValue({ id: "Q1", syncToken: "0" });
  updateQboInvoice.mockResolvedValue({ id: "Q9", syncToken: "6" });
});

describe("syncInvoiceToQbo", () => {
  it("skips a draft invoice without calling QBO", async () => {
    const { builder } = makeSupabase({
      internal_invoices: { single: { id: "inv1", status: "draft", account_owner_user_id: "acc" } },
    });
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(result.status).toBe("skipped");
    expect(createQboInvoice).not.toHaveBeenCalled();
  });

  it("creates a QBO invoice using the billing snapshot when customer is null", async () => {
    const { builder, updates } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv2",
          status: "issued",
          account_owner_user_id: "acc",
          job_id: null,
          customer_id: null,
          billing_name: "Snap Cust",
          invoice_display_number: 2001,
          invoice_date: "2026-07-10",
          qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [
          {
            item_name_snapshot: "Repair",
            description_snapshot: null,
            quantity: 1,
            unit_price: 100,
            line_subtotal: 100,
            sort_order: 1,
          },
        ],
      },
    });
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv2" });
    expect(result).toMatchObject({ status: "synced", qboInvoiceId: "Q1" });
    expect(findOrCreateQboCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customer: expect.objectContaining({ displayName: "Snap Cust" }) }),
    );
    expect(createQboInvoice).toHaveBeenCalled();
    const synced = (updates.internal_invoices ?? []).find((p) => p.qbo_sync_status === "synced");
    expect(synced).toBeTruthy();
    expect(synced.qbo_invoice_id).toBe("Q1");
  });

  it("updates an existing QBO invoice when qbo_invoice_id is present", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv3",
          status: "issued",
          account_owner_user_id: "acc",
          job_id: null,
          customer_id: null,
          billing_name: "Cust",
          invoice_display_number: 2002,
          invoice_date: "2026-07-10",
          qbo_invoice_id: "Q9",
          qbo_sync_token: "5",
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 50, line_subtotal: 50, sort_order: 1 }],
      },
    });
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv3" });
    expect(result.status).toBe("synced");
    expect(createQboInvoice).not.toHaveBeenCalled();
    expect(findQboInvoiceByDocNumber).not.toHaveBeenCalled();
    expect(updateQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ qboInvoiceId: "Q9", syncToken: "5" }),
    );
  });

  it("blocks creation when QBO already has the proposed invoice number", async () => {
    findQboInvoiceByDocNumber.mockResolvedValueOnce({ id: "Q-existing", syncToken: "2" });
    const { builder, updates } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-conflict",
          status: "issued",
          account_owner_user_id: "acc",
          job_id: null,
          customer_id: null,
          billing_name: "Cust",
          invoice_display_number: 2001,
          invoice_date: "2026-07-10",
          qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 50, line_subtotal: 50, sort_order: 1 }],
      },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-conflict" });

    expect(result).toMatchObject({ status: "error" });
    expect(result.error).toContain("already has invoice number 2001");
    expect(createQboInvoice).not.toHaveBeenCalled();
    expect(updateQboInvoice).not.toHaveBeenCalled();
    expect((updates.internal_invoices ?? []).some((payload) => payload.qbo_sync_status === "error")).toBe(true);
  });

  it("records an error (without throwing) when the QBO API fails", async () => {
    createQboInvoice.mockRejectedValueOnce(new Error("QBO down"));
    const { builder, updates } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv4",
          status: "issued",
          account_owner_user_id: "acc",
          job_id: null,
          customer_id: null,
          billing_name: "Cust",
          invoice_display_number: 2003,
          invoice_date: "2026-07-10",
          qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 10, line_subtotal: 10, sort_order: 1 }],
      },
    });
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv4" });
    expect(result).toMatchObject({ status: "error", error: "QBO down" });
    const errored = (updates.internal_invoices ?? []).find((p) => p.qbo_sync_status === "error");
    expect(errored).toBeTruthy();
    expect(errored.qbo_sync_error).toBe("QBO down");
  });

  it("skips when there is no QBO connection", async () => {
    getValidQboAccessToken.mockResolvedValueOnce(null as any);
    const { builder } = makeSupabase({});
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv5" });
    expect(result.status).toBe("skipped");
    expect(findOrCreateQboServicesItem).not.toHaveBeenCalled();
  });
});

describe("bill-to-aware QBO customer mapping", () => {
  const lines = { list: [{ item_name_snapshot: "Duct", quantity: 1, unit_price: 100, line_subtotal: 100, sort_order: 1 }] };

  it("uses qbo_customer_name to attach to the existing QBO customer, not the end customer", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-c", status: "issued", account_owner_user_id: "acc", job_id: "job-c",
          customer_id: "cust-1", billing_name: "Service Master", qbo_customer_name: "Service Master, Inc.",
          billing_email: "ap@sm.example", invoice_display_number: 3001, invoice_date: "2026-07-14", qbo_invoice_id: null,
        },
      },
      jobs: {
        single: {
          billing_disposition: null,
          job_display_number: "1301",
          job_address: "876 Rutledge Dr, Lodi CA 95242",
        },
      },
      customers: { single: { full_name: "Beck Raintree" } },
      internal_invoice_line_items: lines,
    });
    await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-c" });
    expect(findOrCreateQboCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customer: expect.objectContaining({ displayName: "Service Master, Inc." }) }),
    );
    expect(createQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({
          lines: [
            expect.objectContaining({
              description:
                "Customer: Beck Raintree · Job #1301 · 876 Rutledge Dr, Lodi CA 95242\nDuct",
            }),
          ],
        }),
      }),
    );
  });

  it("falls back to the job customer snapshot when no live customer is available", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-context", status: "issued", account_owner_user_id: "acc", job_id: "job-context",
          customer_id: null, billing_name: "Simi Heating and Air", invoice_display_number: 3003,
          invoice_date: "2026-07-16", qbo_invoice_id: null,
        },
      },
      jobs: {
        single: {
          billing_disposition: null, customer_first_name: "Sandra", customer_last_name: "Meeks",
          job_display_number: "1302", job_address: "123 Main St, Lodi CA",
        },
      },
      internal_invoice_line_items: lines,
    });
    await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-context" });
    expect(createQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({
          lines: [expect.objectContaining({
            description: "Customer: Sandra Meeks · Job #1302 · 123 Main St, Lodi CA\nDuct",
          })],
        }),
      }),
    );
  });

  it("falls back to the invoice snapshot billing_name over the end customer when no qbo name", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-c2", status: "issued", account_owner_user_id: "acc", job_id: "job-c2",
          customer_id: "cust-1", billing_name: "Service Master", qbo_customer_name: null,
          invoice_display_number: 3002, invoice_date: "2026-07-14", qbo_invoice_id: null,
        },
      },
      jobs: { single: { billing_disposition: null } },
      customers: { single: { full_name: "Beck Raintree" } },
      internal_invoice_line_items: lines,
    });
    await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-c2" });
    expect(findOrCreateQboCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customer: expect.objectContaining({ displayName: "Service Master" }) }),
    );
  });
});

describe("syncAllPendingInvoicesToQbo — connect-time cutoff", () => {
  const lineItems = { list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 10, line_subtotal: 10, sort_order: 1 }] };

  it("skips a candidate issued before connected_at (pre-connect — no duplicate)", async () => {
    getQboConnectionForAccount.mockResolvedValue({ connectedAt: "2026-07-01T00:00:00Z" });
    const { builder } = makeSupabase({
      internal_invoices: {
        list: [{ id: "old" }],
        single: {
          id: "old", status: "issued", account_owner_user_id: "acc", issued_at: "2026-06-10T10:00:00Z",
          job_id: null, customer_id: null, billing_name: "X", invoice_display_number: 1, invoice_date: "2026-06-10", qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: lineItems,
    });
    const res = await syncAllPendingInvoicesToQbo({ supabase: builder, accountOwnerUserId: "acc" });
    expect(res.synced).toBe(0);
    expect(res.skipped).toBe(1);
    expect(createQboInvoice).not.toHaveBeenCalled();
    expect(res.results[0].error).toMatch(/before QBO sync start/i);
  });

  it("syncs a candidate issued on/after connected_at", async () => {
    getQboConnectionForAccount.mockResolvedValue({ connectedAt: "2026-07-01T00:00:00Z" });
    const { builder } = makeSupabase({
      internal_invoices: {
        list: [{ id: "new" }],
        single: {
          id: "new", status: "issued", account_owner_user_id: "acc", issued_at: "2026-07-20T10:00:00Z",
          job_id: null, customer_id: null, billing_name: "X", invoice_display_number: 2, invoice_date: "2026-07-20", qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: lineItems,
    });
    const res = await syncAllPendingInvoicesToQbo({ supabase: builder, accountOwnerUserId: "acc" });
    expect(res.synced).toBe(1);
    expect(createQboInvoice).toHaveBeenCalled();
  });
});
