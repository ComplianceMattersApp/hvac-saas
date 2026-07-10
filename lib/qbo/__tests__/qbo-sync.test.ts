import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getValidQboAccessToken,
  recordQboConnectionSyncOutcome,
  findOrCreateQboServicesItem,
  findOrCreateQboCustomer,
  createQboInvoice,
  updateQboInvoice,
} = vi.hoisted(() => ({
  getValidQboAccessToken: vi.fn(),
  recordQboConnectionSyncOutcome: vi.fn(),
  findOrCreateQboServicesItem: vi.fn(),
  findOrCreateQboCustomer: vi.fn(),
  createQboInvoice: vi.fn(),
  updateQboInvoice: vi.fn(),
}));
vi.mock("@/lib/qbo/qbo-connection", () => ({
  getValidQboAccessToken,
  recordQboConnectionSyncOutcome,
}));
vi.mock("@/lib/qbo/qbo-api-client", () => ({
  findOrCreateQboServicesItem,
  findOrCreateQboCustomer,
  createQboInvoice,
  updateQboInvoice,
}));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboBaseUrl: () => "https://sandbox.example.com" }));

import { syncInvoiceToQbo } from "@/lib/qbo/qbo-sync";

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
  recordQboConnectionSyncOutcome.mockResolvedValue(undefined);
  findOrCreateQboServicesItem.mockResolvedValue("7");
  findOrCreateQboCustomer.mockResolvedValue({ id: "C1", syncToken: "0" });
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
    expect(updateQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ qboInvoiceId: "Q9", syncToken: "5" }),
    );
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
