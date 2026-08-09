import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValidQboAccessToken, findQboInvoiceById, voidQboInvoice } = vi.hoisted(() => ({
  getValidQboAccessToken: vi.fn(),
  findQboInvoiceById: vi.fn(),
  voidQboInvoice: vi.fn(),
}));
vi.mock("@/lib/qbo/qbo-connection", () => ({ getValidQboAccessToken }));
vi.mock("@/lib/qbo/qbo-api-client", () => ({ findQboInvoiceById, voidQboInvoice }));
vi.mock("@/lib/qbo/qbo-env", () => ({
  getQboBaseUrl: () => "https://sandbox.example.com",
  getQboAvailability: () => ({ available: true, missingKeys: [] }),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

import { voidAllPendingInvoiceVoidsInQbo, voidInvoiceInQbo } from "@/lib/qbo/qbo-void-sync";

/** Fake supabase serving one invoice row and recording update payloads. */
function makeSupabase(row: any | null, options?: { listRows?: any[]; selectError?: any }) {
  const updates: any[] = [];
  const builder: any = {};
  Object.assign(builder, {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: options?.selectError ?? null })),
    update: vi.fn((payload: any) => {
      updates.push(payload);
      return builder;
    }),
    then: (resolve: (v: any) => void) =>
      resolve({ data: options?.listRows ?? [], error: null }),
  });
  return { builder, updates };
}

const VOIDED_ROW = {
  id: "inv1",
  status: "void",
  qbo_invoice_id: "Q1",
  qbo_void_status: null,
  invoice_display_number: "1042",
  invoice_number: "1042",
};

const OPEN = { id: "Q1", syncToken: "3", docNumber: "1042", balance: 500, totalAmount: 500, looksVoided: false };
const CONFIRMED_VOID = { id: "Q1", syncToken: "4", docNumber: "1042", balance: 0, totalAmount: 0, looksVoided: true };

beforeEach(() => {
  vi.clearAllMocks();
  getValidQboAccessToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  // Two reads per successful void: the pre-void snapshot, then the confirmation.
  findQboInvoiceById.mockReset();
  findQboInvoiceById.mockResolvedValueOnce(OPEN).mockResolvedValue(CONFIRMED_VOID);
  voidQboInvoice.mockResolvedValue({ id: "Q1", syncToken: "4" });
});

describe("voidInvoiceInQbo", () => {
  it("voids the QBO invoice using the LIVE sync token, not the stored one", async () => {
    const { builder, updates } = makeSupabase({ ...VOIDED_ROW, qbo_sync_token: "0" });
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });

    expect(result.status).toBe("voided");
    expect(voidQboInvoice).toHaveBeenCalledWith(expect.objectContaining({ qboInvoiceId: "Q1", syncToken: "3" }));
    expect(updates.at(-1)).toMatchObject({ qbo_void_status: "voided", qbo_void_error: null, qbo_sync_token: "4" });
  });

  it("marks pending BEFORE calling QBO so a crash mid-call stays retryable", async () => {
    const { builder, updates } = makeSupabase(VOIDED_ROW);
    await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(updates[0]).toMatchObject({ qbo_void_status: "pending" });
  });

  it("records an error when QBO reports the invoice still open after accepting the void", async () => {
    // Production behavior: the void endpoint returned 2xx and the invoice stayed
    // open. Claiming success here would retire the row from the sweep and the
    // attention center, making the drift invisible again.
    findQboInvoiceById.mockReset();
    findQboInvoiceById.mockResolvedValue(OPEN);
    const { builder, updates } = makeSupabase(VOIDED_ROW);

    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });

    expect(result.status).toBe("error");
    expect(updates.at(-1)).toMatchObject({ qbo_void_status: "error" });
    expect(updates.at(-1).qbo_void_error).toContain("still open");
  });

  it("refuses to void a QBO invoice with payments applied and records it blocked", async () => {
    findQboInvoiceById.mockReset();
    findQboInvoiceById.mockResolvedValue({
      id: "Q1", syncToken: "3", docNumber: "1042", balance: 200, totalAmount: 500, looksVoided: false,
    });
    const { builder, updates } = makeSupabase(VOIDED_ROW);
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });

    expect(result.status).toBe("blocked");
    expect(voidQboInvoice).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ qbo_void_status: "blocked" });
    expect(updates.at(-1).qbo_void_error).toContain("$300.00");
  });

  it("is idempotent when QBO already shows the invoice voided", async () => {
    findQboInvoiceById.mockReset();
    findQboInvoiceById.mockResolvedValue({
      id: "Q1", syncToken: "9", docNumber: "1042", balance: 0, totalAmount: 0, looksVoided: true,
    });
    const { builder, updates } = makeSupabase(VOIDED_ROW);
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });

    expect(result.status).toBe("voided");
    expect(voidQboInvoice).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ qbo_void_status: "voided" });
  });

  it("treats an invoice missing from QBO as nothing left to void", async () => {
    findQboInvoiceById.mockReset();
    findQboInvoiceById.mockResolvedValue(null);
    const { builder } = makeSupabase(VOIDED_ROW);
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(result.status).toBe("voided");
    expect(voidQboInvoice).not.toHaveBeenCalled();
  });

  it("never voids in QBO when EveryStep does not consider the invoice void", async () => {
    const { builder } = makeSupabase({ ...VOIDED_ROW, status: "issued" });
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(result.status).toBe("skipped");
    expect(findQboInvoiceById).not.toHaveBeenCalled();
    expect(voidQboInvoice).not.toHaveBeenCalled();
  });

  it("skips an invoice that was never pushed to QBO", async () => {
    const { builder } = makeSupabase({ ...VOIDED_ROW, qbo_invoice_id: null });
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(result.status).toBe("skipped");
    expect(voidQboInvoice).not.toHaveBeenCalled();
  });

  it("stays retryable (pending) when QBO is not connected", async () => {
    getValidQboAccessToken.mockResolvedValue(null);
    const { builder, updates } = makeSupabase(VOIDED_ROW);
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(result.status).toBe("skipped");
    expect(updates.at(-1)).toMatchObject({ qbo_void_status: "pending" });
  });

  it("records an error instead of throwing when the QBO call fails", async () => {
    voidQboInvoice.mockRejectedValue(new Error("Stale Object Error"));
    const { builder, updates } = makeSupabase(VOIDED_ROW);
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });

    expect(result.status).toBe("error");
    // The fault, plus what QuickBooks actually holds — the only view into the
    // live record, since prod QBO secrets cannot be read outside the deployed app.
    expect(result.error).toContain("Stale Object Error");
    expect(result.error).toContain("doc number 1042");
    expect(result.error).toContain("total $500.00");
    expect(updates.at(-1)).toMatchObject({ qbo_void_status: "error" });
  });

  it("degrades to a skip when the qbo_void_* columns are not deployed", async () => {
    const { builder } = makeSupabase(null, {
      selectError: { code: "42703", message: 'column internal_invoices.qbo_void_status does not exist' },
    });
    const result = await voidInvoiceInQbo({ supabase: builder, accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(result.status).toBe("skipped");
    expect(voidQboInvoice).not.toHaveBeenCalled();
  });
});

describe("voidAllPendingInvoiceVoidsInQbo", () => {
  it("sweeps candidates and tallies outcomes", async () => {
    // Each invoice reads twice: open snapshot, then voided confirmation.
    findQboInvoiceById.mockReset();
    let reads = 0;
    findQboInvoiceById.mockImplementation(async () => ((reads += 1) % 2 === 1 ? OPEN : CONFIRMED_VOID));
    const { builder } = makeSupabase(VOIDED_ROW, { listRows: [{ id: "inv1" }, { id: "inv2" }] });
    const result = await voidAllPendingInvoiceVoidsInQbo({ supabase: builder, accountOwnerUserId: "acc" });

    expect(result.voided).toBe(2);
    expect(result.blocked).toBe(0);
    expect(result.errors).toBe(0);
    expect(voidQboInvoice).toHaveBeenCalledTimes(2);
  });

  it("returns zeros rather than throwing when the candidate read fails", async () => {
    const builder: any = {};
    Object.assign(builder, {
      from: vi.fn(() => builder), select: vi.fn(() => builder), eq: vi.fn(() => builder),
      not: vi.fn(() => builder), or: vi.fn(() => builder),
      then: (resolve: (v: any) => void) => resolve({ data: null, error: { message: "boom" } }),
    });
    const result = await voidAllPendingInvoiceVoidsInQbo({ supabase: builder, accountOwnerUserId: "acc" });
    expect(result).toMatchObject({ voided: 0, blocked: 0, errors: 0 });
  });
});
