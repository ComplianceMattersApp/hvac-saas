import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getValidQboAccessToken,
  recordQboConnectionSyncOutcome,
  getQboConnectionForAccount,
  findOrCreateEveryStepServicesItem,
  findOrCreateQboCustomer,
  findQboInvoiceByDocNumber,
  findQboInvoiceById,
  createQboInvoice,
  updateQboInvoice,
} = vi.hoisted(() => ({
  getValidQboAccessToken: vi.fn(),
  recordQboConnectionSyncOutcome: vi.fn(),
  getQboConnectionForAccount: vi.fn(),
  findOrCreateEveryStepServicesItem: vi.fn(),
  findOrCreateQboCustomer: vi.fn(),
  findQboInvoiceByDocNumber: vi.fn(),
  findQboInvoiceById: vi.fn(),
  createQboInvoice: vi.fn(),
  updateQboInvoice: vi.fn(),
}));
vi.mock("@/lib/qbo/qbo-connection", () => ({
  getValidQboAccessToken,
  recordQboConnectionSyncOutcome,
  getQboConnectionForAccount,
}));
vi.mock("@/lib/qbo/qbo-api-client", () => ({
  findOrCreateEveryStepServicesItem,
  findOrCreateQboCustomer,
  findQboInvoiceByDocNumber,
  findQboInvoiceById,
  createQboInvoice,
  updateQboInvoice,
}));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboBaseUrl: () => "https://sandbox.example.com" }));

import { syncAllPendingInvoicesToQbo, syncInvoiceToQbo } from "@/lib/qbo/qbo-sync";

/**
 * Fake supabase that serves per-table `single` (for .maybeSingle) and `list`
 * (for awaited chains) and records .update() payloads per table.
 */
function makeSupabase(
  tables: Record<string, { single?: any; list?: any[] }>,
  /** Return an error to make that particular update fail, as Postgres would. */
  options: { updateFails?: (table: string, payload: any) => { message: string } | null } = {},
) {
  const updates: Record<string, any[]> = {};
  const builder: any = { __table: "", __pendingUpdate: null };
  Object.assign(builder, {
    from: vi.fn((t: string) => {
      builder.__table = t;
      builder.__pendingUpdate = null;
      return builder;
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: tables[builder.__table]?.single ?? null, error: null })),
    update: vi.fn((payload: any) => {
      (updates[builder.__table] ??= []).push(payload);
      builder.__pendingUpdate = { table: builder.__table, payload };
      return builder;
    }),
    then: (resolve: (v: any) => void) => {
      const pending = builder.__pendingUpdate;
      builder.__pendingUpdate = null;
      const updateError = pending ? options.updateFails?.(pending.table, pending.payload) ?? null : null;
      if (updateError) return resolve({ data: null, error: updateError });
      return resolve({ data: tables[builder.__table]?.list ?? [], error: null });
    },
  });
  return { builder, updates };
}

/** The invoice payload of the most recent create/update push. */
function lastPushedInvoice(): any {
  const calls = [...createQboInvoice.mock.calls, ...updateQboInvoice.mock.calls];
  return calls.at(-1)?.[0]?.invoice ?? null;
}

/**
 * Default read-back: QuickBooks agrees with what we just pushed, so the happy
 * path verifies clean. Tests that exercise drift override this per case.
 */
function confirmingReadBack() {
  return async ({ qboInvoiceId }: any) => {
    const invoice = lastPushedInvoice();
    const totalAmount = (invoice?.lines ?? []).reduce(
      (sum: number, line: any) => sum + Number(line.amount ?? 0),
      0,
    );
    return {
      id: String(qboInvoiceId),
      syncToken: "9",
      docNumber: String(invoice?.docNumber ?? ""),
      balance: totalAmount,
      totalAmount,
      totalTax: 0,
      looksVoided: false,
    };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getValidQboAccessToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  getQboConnectionForAccount.mockResolvedValue(null);
  recordQboConnectionSyncOutcome.mockResolvedValue(undefined);
  findOrCreateEveryStepServicesItem.mockResolvedValue("7");
  findOrCreateQboCustomer.mockResolvedValue({ id: "C1", syncToken: "0" });
  findQboInvoiceByDocNumber.mockResolvedValue(null);
  findQboInvoiceById.mockImplementation(confirmingReadBack());
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
    expect(createQboInvoice).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "esinv-inv2",
      invoice: expect.objectContaining({ privateNote: expect.stringContaining("EveryStep invoice ID: inv2") }),
    }));
    const synced = (updates.internal_invoices ?? []).find((p) => p.qbo_sync_status === "synced");
    expect(synced).toBeTruthy();
    expect(synced.qbo_invoice_id).toBe("Q1");
  });

  it("stamps EmailStatus=EmailSent when EveryStep already emailed the invoice", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-mailed", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
          billing_name: "Cust", invoice_display_number: 2005, invoice_date: "2026-08-01",
          qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 75, line_subtotal: 75, sort_order: 1 }],
      },
      // A successful EveryStep email delivery for this invoice exists.
      notifications: { list: [{ id: "n1" }] },
    });
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-mailed" });
    expect(result.status).toBe("synced");
    expect(createQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: expect.objectContaining({ emailStatus: "EmailSent" }) }),
    );
  });

  it("sends no EmailStatus when the invoice has never been emailed", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-unmailed", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
          billing_name: "Cust", invoice_display_number: 2006, invoice_date: "2026-08-01",
          qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 75, line_subtotal: 75, sort_order: 1 }],
      },
      notifications: { list: [] },
    });
    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-unmailed" });
    expect(result.status).toBe("synced");
    expect(createQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: expect.objectContaining({ emailStatus: null }) }),
    );
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
    // The token comes from a live re-read, not the stored "5" — the stored one
    // goes stale as soon as anything touches the invoice in QuickBooks.
    expect(updateQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ qboInvoiceId: "Q9", syncToken: "9", requestId: "esinvupd-inv3-9" }),
    );
  });

  it("updates with a freshly re-read SyncToken, not the stale stored one", async () => {
    // A payment posting in QuickBooks bumps the token; using the stored one
    // fails with a 5010 stale-object fault.
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q9", syncToken: "42", docNumber: "2002", balance: 50, totalAmount: 50, totalTax: 0, looksVoided: false,
    });
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-stale", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
          billing_name: "Cust", invoice_display_number: 2002, invoice_date: "2026-08-12",
          qbo_invoice_id: "Q9", qbo_sync_token: "5",
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 50, line_subtotal: 50, sort_order: 1 }],
      },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-stale" });

    expect(result.status).toBe("synced");
    expect(updateQboInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ qboInvoiceId: "Q9", syncToken: "42", requestId: "esinvupd-inv-stale-42" }),
    );
  });

  it("takes the error path when the live SyncToken cannot be read", async () => {
    // Never fall back to the stored token — guessing it is how drift starts.
    findQboInvoiceById.mockResolvedValueOnce(null);
    const { builder, updates } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-gone", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
          billing_name: "Cust", invoice_display_number: 2002, invoice_date: "2026-08-12",
          qbo_invoice_id: "Q9", qbo_sync_token: "5",
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 50, line_subtotal: 50, sort_order: 1 }],
      },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-gone" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("no longer has invoice");
    expect(updateQboInvoice).not.toHaveBeenCalled();
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(false);
  });

  it("threads per-line taxability into the QuickBooks invoice body", async () => {
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-tax", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
          billing_name: "Cust", invoice_display_number: 2005, invoice_date: "2026-08-12", qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [
          { item_name_snapshot: "Part", quantity: 1, unit_price: 500, line_subtotal: 500, sort_order: 1, is_taxable: true },
          { item_name_snapshot: "Labor", quantity: 1, unit_price: 200, line_subtotal: 200, sort_order: 2, is_taxable: false },
        ],
      },
    });

    await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-tax" });

    expect(createQboInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoice: expect.objectContaining({
        lines: [
          expect.objectContaining({ isTaxable: true }),
          expect.objectContaining({ isTaxable: false }),
        ],
      }),
    }));
  });

  it("verifies an Automated Sales Tax invoice against the pre-tax subtotal", async () => {
    // QuickBooks adds its own tax; our tax_cents never travels. The expected
    // total stays the line sum, so AST tenants verify clean.
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q1", syncToken: "9", docNumber: "2006", balance: 755.83, totalAmount: 755.83,
      totalTax: 55.83, looksVoided: false,
    });
    const { builder } = makeSupabase({
      internal_invoices: {
        single: {
          id: "inv-ast", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
          billing_name: "Cust", invoice_display_number: 2006, invoice_date: "2026-08-12", qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: {
        list: [{ item_name_snapshot: "Part", quantity: 1, unit_price: 700, line_subtotal: 700, sort_order: 1, is_taxable: true }],
      },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-ast" });

    expect(result.status).toBe("synced");
  });

  it("adopts an exact QBO invoice created by an earlier timed-out request", async () => {
    findQboInvoiceByDocNumber.mockResolvedValueOnce({
      id: "Q-recovered",
      syncToken: "2",
      privateNote: "EveryStep invoice ID: inv-recover",
    });
    // Nothing is pushed on the adoption path, so the read-back is stated here.
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q-recovered", syncToken: "3", docNumber: "2008", balance: 50, totalAmount: 50, totalTax: 0, looksVoided: false,
    });
    const { builder, updates } = makeSupabase({
      internal_invoices: { single: {
        id: "inv-recover", status: "issued", account_owner_user_id: "acc", job_id: null,
        customer_id: null, billing_name: "Cust", invoice_display_number: 2008,
        invoice_date: "2026-07-10", qbo_invoice_id: null,
      } },
      internal_invoice_line_items: { list: [
        { item_name_snapshot: "Svc", quantity: 1, unit_price: 50, line_subtotal: 50, sort_order: 1 },
      ] },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-recover" });

    expect(result).toMatchObject({ status: "synced", qboInvoiceId: "Q-recovered" });
    expect(createQboInvoice).not.toHaveBeenCalled();
    expect((updates.internal_invoices ?? []).some((payload) => payload.qbo_invoice_id === "Q-recovered")).toBe(true);
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
    expect(findOrCreateEveryStepServicesItem).not.toHaveBeenCalled();
  });
});

describe("per-line QuickBooks item mapping", () => {
  const invoiceRow = (id: string) => ({
    id, status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
    billing_name: "Cust", invoice_display_number: 4001, invoice_date: "2026-08-11", qbo_invoice_id: null,
  });

  it("posts each line to its own mapped QuickBooks item", async () => {
    const { builder } = makeSupabase({
      internal_invoices: { single: invoiceRow("inv-mapped") },
      pricebook_items: { list: [
        { id: "pb-duct", item_name: "Duct Cleaning", qbo_item_id: "41", qbo_item_name: "Duct Cleaning (QBO)" },
        { id: "pb-filter", item_name: "Filter", qbo_item_id: "42", qbo_item_name: "Air Filter" },
      ] },
      internal_invoice_line_items: { list: [
        { source_pricebook_item_id: "pb-duct", item_name_snapshot: "Duct Cleaning", quantity: 3, unit_price: 100, line_subtotal: 300, sort_order: 1 },
        { source_pricebook_item_id: "pb-filter", item_name_snapshot: "Filter", quantity: 2, unit_price: 20, line_subtotal: 40, sort_order: 2 },
      ] },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-mapped" });

    expect(result.status).toBe("synced");
    expect(createQboInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoice: expect.objectContaining({
        lines: [
          expect.objectContaining({ itemRef: "41", quantity: 3 }),
          expect.objectContaining({ itemRef: "42", quantity: 2 }),
        ],
      }),
    }));
    // Nothing needed the catch-all, so none was created in the tenant's books.
    expect(findOrCreateEveryStepServicesItem).not.toHaveBeenCalled();
  });

  it("posts an unmapped line to EveryStep Services when there is no account default", async () => {
    const { builder } = makeSupabase({
      internal_invoices: { single: invoiceRow("inv-unmapped") },
      pricebook_items: { list: [] },
      internal_invoice_line_items: { list: [
        { source_pricebook_item_id: "pb-none", item_name_snapshot: "Repair", quantity: 1, unit_price: 100, line_subtotal: 100, sort_order: 1 },
        { source_pricebook_item_id: null, item_name_snapshot: "Ad hoc", quantity: 1, unit_price: 25, line_subtotal: 25, sort_order: 2 },
      ] },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-unmapped" });

    expect(result.status).toBe("synced");
    expect(createQboInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoice: expect.objectContaining({
        lines: [expect.objectContaining({ itemRef: "7" }), expect.objectContaining({ itemRef: "7" })],
      }),
    }));
    // Resolved once for the whole run, not once per line.
    expect(findOrCreateEveryStepServicesItem).toHaveBeenCalledTimes(1);
  });

  it("prefers the account default over the EveryStep Services fallback for unmapped lines", async () => {
    const { builder } = makeSupabase({
      internal_invoices: { single: invoiceRow("inv-default") },
      qbo_connections: { single: { default_qbo_item_id: "77", default_qbo_item_name: "Field Services" } },
      pricebook_items: { list: [
        { id: "pb-duct", item_name: "Duct Cleaning", qbo_item_id: "41", qbo_item_name: "Duct Cleaning (QBO)" },
      ] },
      internal_invoice_line_items: { list: [
        { source_pricebook_item_id: "pb-duct", item_name_snapshot: "Duct", quantity: 1, unit_price: 100, line_subtotal: 100, sort_order: 1 },
        { source_pricebook_item_id: null, item_name_snapshot: "Ad hoc", quantity: 1, unit_price: 25, line_subtotal: 25, sort_order: 2 },
      ] },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-default" });

    expect(result.status).toBe("synced");
    expect(createQboInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoice: expect.objectContaining({
        lines: [expect.objectContaining({ itemRef: "41" }), expect.objectContaining({ itemRef: "77" })],
      }),
    }));
    expect(findOrCreateEveryStepServicesItem).not.toHaveBeenCalled();
  });

  it("records an error naming the mapping when QuickBooks rejects a mapped item", async () => {
    createQboInvoice.mockRejectedValueOnce(new Error("Invalid Reference Id: Items element id 41 not found"));
    const { builder, updates } = makeSupabase({
      internal_invoices: { single: invoiceRow("inv-bad-map") },
      pricebook_items: { list: [
        { id: "pb-duct", item_name: "Duct Cleaning", qbo_item_id: "41", qbo_item_name: "Duct Cleaning (QBO)" },
      ] },
      internal_invoice_line_items: { list: [
        { source_pricebook_item_id: "pb-duct", item_name_snapshot: "Duct", quantity: 3, unit_price: 100, line_subtotal: 300, sort_order: 1 },
      ] },
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-bad-map" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("Items element id 41 not found");
    expect(result.error).toContain('pricebook item "Duct Cleaning"');
    expect(result.error).toContain("QuickBooks item 41");
    const errored = (updates.internal_invoices ?? []).find((p) => p.qbo_sync_status === "error");
    expect(errored.qbo_sync_error).toContain('pricebook item "Duct Cleaning"');
    // Never silently re-posted against the catch-all item.
    expect(findOrCreateEveryStepServicesItem).not.toHaveBeenCalled();
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(false);
  });
});

describe("invoice sync verify-after-write", () => {
  const invoiceRow = {
    id: "inv-verify", status: "issued", account_owner_user_id: "acc", job_id: null, customer_id: null,
    billing_name: "Cust", invoice_display_number: 5001, invoice_date: "2026-08-11", qbo_invoice_id: null,
  };
  const lineItems = { list: [
    { item_name_snapshot: "Svc", quantity: 2, unit_price: 150, line_subtotal: 300, sort_order: 1 },
  ] };

  function supabaseForVerify() {
    return makeSupabase({ internal_invoices: { single: invoiceRow }, internal_invoice_line_items: lineItems });
  }

  it("records synced only after a confirming read-back, storing the live sync token", async () => {
    const { builder, updates } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result).toMatchObject({ status: "synced", qboInvoiceId: "Q1" });
    expect(findQboInvoiceById).toHaveBeenCalledWith(expect.objectContaining({ qboInvoiceId: "Q1" }));
    const payloads = updates.internal_invoices ?? [];
    // Identity is durable before verification, so a failed read-back can never
    // orphan the QBO invoice into a duplicate on retry.
    expect(payloads.findIndex((p) => p.qbo_sync_status === "pending"))
      .toBeLessThan(payloads.findIndex((p) => p.qbo_sync_status === "synced"));
    expect(payloads.find((p) => p.qbo_sync_status === "pending")).toMatchObject({ qbo_invoice_id: "Q1" });
    expect(payloads.find((p) => p.qbo_sync_status === "synced")).toMatchObject({ qbo_sync_token: "9" });
  });

  it("records an error with observed values when the read-back total does not match", async () => {
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q1", syncToken: "9", docNumber: "5001", balance: 100, totalAmount: 100, totalTax: 0, looksVoided: false,
    });
    const { builder, updates } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("verified mismatch");
    expect(result.error).toContain("observed total $100.00");
    expect(result.error).toContain("expected $300.00");
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(false);
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "error")).toBe(true);
  });

  it("records an error when the read-back doc number does not match", async () => {
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q1", syncToken: "9", docNumber: "9999", balance: 300, totalAmount: 300, totalTax: 0, looksVoided: false,
    });
    const { builder, updates } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("observed doc number 9999");
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(false);
  });

  it("marks the row unverified — never synced — when the read-back itself fails", async () => {
    findQboInvoiceById.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    const { builder, updates } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("unverified — read-back failed");
    expect(result.error).toContain("ETIMEDOUT");
    expect(result.error).not.toContain("verified mismatch");
    const payloads = updates.internal_invoices ?? [];
    // The QBO id was still written, so the retry updates rather than duplicates.
    expect(payloads.find((p) => p.qbo_sync_status === "pending")).toMatchObject({ qbo_invoice_id: "Q1" });
    expect(payloads.some((p) => p.qbo_sync_status === "synced")).toBe(false);
  });

  it("does not fail an invoice with no document number on QuickBooks' own numbering", async () => {
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q1", syncToken: "9", docNumber: "1042", balance: 300, totalAmount: 300, totalTax: 0, looksVoided: false,
    });
    const { builder } = makeSupabase({
      internal_invoices: { single: { ...invoiceRow, invoice_display_number: null, invoice_number: null } },
      internal_invoice_line_items: lineItems,
    });

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("synced");
  });

  it("syncs an Automated Sales Tax invoice by comparing the pre-tax subtotal", async () => {
    // QuickBooks adds the tax on its own side; EveryStep never sends any. A raw
    // TotalAmt comparison would fail these tenants on every run forever.
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q1", syncToken: "9", docNumber: "5001", balance: 324.75, totalAmount: 324.75,
      totalTax: 24.75, looksVoided: false,
    });
    const { builder, updates } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("synced");
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(true);
  });

  it("still catches a real mismatch on a taxed invoice, and says it compared pre-tax", async () => {
    findQboInvoiceById.mockResolvedValueOnce({
      id: "Q1", syncToken: "9", docNumber: "5001", balance: 124.75, totalAmount: 124.75,
      totalTax: 24.75, looksVoided: false,
    });
    const { builder } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("observed total $100.00");
    expect(result.error).toContain("expected $300.00");
    expect(result.error).toContain("$24.75 sales tax");
  });

  it("stops at the unverified state when the identity write itself fails", async () => {
    const { builder, updates } = makeSupabase(
      { internal_invoices: { single: invoiceRow }, internal_invoice_line_items: lineItems },
      { updateFails: (table, payload) =>
          table === "internal_invoices" && payload.qbo_sync_status === "pending"
            ? { message: "deadlock detected" }
            : null },
    );

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("unverified — identity write failed");
    expect(result.error).toContain("QBO id Q1");
    // Never verified, and never reported as synced off a link that did not persist.
    expect(findQboInvoiceById).not.toHaveBeenCalled();
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(false);
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "error")).toBe(true);
  });

  it("does not report synced when the terminal write fails", async () => {
    const { builder, updates } = makeSupabase(
      { internal_invoices: { single: invoiceRow }, internal_invoice_line_items: lineItems },
      { updateFails: (table, payload) =>
          table === "internal_invoices" && payload.qbo_sync_status === "synced"
            ? { message: "connection reset" }
            : null },
    );

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("Failed to persist QBO invoice sync state");
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "error")).toBe(true);
  });

  it("records an error when the read-back finds no invoice at all", async () => {
    findQboInvoiceById.mockResolvedValueOnce(null);
    const { builder, updates } = supabaseForVerify();

    const result = await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-verify" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("no invoice with QBO id Q1");
    expect((updates.internal_invoices ?? []).some((p) => p.qbo_sync_status === "synced")).toBe(false);
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

  it("creates one QBO invoice with source-job context on each consolidated line", async () => {
    const { builder } = makeSupabase({
      internal_invoices: { single: {
        id: "inv-consolidated", status: "issued", account_owner_user_id: "acc", job_id: null,
        customer_id: null, billing_name: "Service Master", invoice_display_number: 3004,
        invoice_date: "2026-07-20", qbo_invoice_id: null,
      } },
      jobs: { list: [
        { id: "job-a", job_display_number: "1401", job_address: "10 A St", customer_first_name: "Amy", customer_last_name: "Able" },
        { id: "job-b", job_display_number: "1402", job_address: "20 B St", customer_first_name: "Ben", customer_last_name: "Baker" },
      ] },
      internal_invoice_line_items: { list: [
        { source_job_id: "job-a", item_name_snapshot: "A service", quantity: 1, unit_price: 10, line_subtotal: 10, sort_order: 1 },
        { source_job_id: "job-b", item_name_snapshot: "B service", quantity: 1, unit_price: 20, line_subtotal: 20, sort_order: 2 },
      ] },
    });

    await syncInvoiceToQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv-consolidated" });

    expect(createQboInvoice).toHaveBeenCalledTimes(1);
    expect(createQboInvoice).toHaveBeenCalledWith(expect.objectContaining({ invoice: expect.objectContaining({ lines: [
      expect.objectContaining({ description: expect.stringContaining("Job #1401") }),
      expect.objectContaining({ description: expect.stringContaining("Job #1402") }),
    ] }) }));
  });
});

describe("EveryStep Services fallback resolution across a bulk run", () => {
  const lineItems = { list: [{ item_name_snapshot: "Svc", quantity: 1, unit_price: 10, line_subtotal: 10, sort_order: 1 }] };

  function bulkSupabase(ids: string[]) {
    return makeSupabase({
      internal_invoices: {
        list: ids.map((id) => ({ id })),
        single: {
          id: ids[0], status: "issued", account_owner_user_id: "acc", issued_at: "2026-08-11T10:00:00Z",
          job_id: null, customer_id: null, billing_name: "X", invoice_display_number: 1,
          invoice_date: "2026-08-11", qbo_invoice_id: null,
        },
      },
      internal_invoice_line_items: lineItems,
    });
  }

  it("does not let one transient failure poison the rest of the run", async () => {
    // A cached rejected promise would fail every later invoice with this same
    // stale error, turning one blip into a whole-sweep outage.
    findOrCreateEveryStepServicesItem.mockRejectedValueOnce(new Error("QBO 429"));
    const { builder } = bulkSupabase(["inv-a", "inv-b"]);

    const res = await syncAllPendingInvoicesToQbo({ supabase: builder, accountOwnerUserId: "acc" });

    expect(res.errors).toBe(1);
    expect(res.synced).toBe(1);
    expect(res.results[0]).toMatchObject({ status: "error", error: expect.stringContaining("QBO 429") });
    expect(res.results[1].status).toBe("synced");
    expect(findOrCreateEveryStepServicesItem).toHaveBeenCalledTimes(2);
  });

  it("resolves the fallback once for a whole successful run", async () => {
    const { builder } = bulkSupabase(["inv-a", "inv-b", "inv-c"]);

    const res = await syncAllPendingInvoicesToQbo({ supabase: builder, accountOwnerUserId: "acc" });

    expect(res.synced).toBe(3);
    expect(findOrCreateEveryStepServicesItem).toHaveBeenCalledTimes(1);
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
