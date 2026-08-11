import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQboAvailability, getQboInvoicePaymentContext, getValidQboAccessToken } = vi.hoisted(() => ({
  getQboAvailability: vi.fn(),
  getQboInvoicePaymentContext: vi.fn(),
  getValidQboAccessToken: vi.fn(),
}));

vi.mock("@/lib/qbo/qbo-api-client", () => ({ getQboInvoicePaymentContext }));
vi.mock("@/lib/qbo/qbo-connection", () => ({ getValidQboAccessToken }));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboAvailability, getQboBaseUrl: () => "https://qbo.example.com" }));

import { checkQboBalanceBeforeCollection } from "@/lib/qbo/qbo-collection-preflight";

function supabaseWithInvoice(invoice: any, error: any = null) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: invoice, error }),
  };
  return { from: vi.fn(() => builder) };
}

const baseParams = {
  accountOwnerUserId: "owner-1",
  invoiceId: "inv-1",
  collectAmountCents: 25000,
};

beforeEach(() => {
  vi.clearAllMocks();
  getQboAvailability.mockReturnValue({ available: true });
  getValidQboAccessToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  getQboInvoicePaymentContext.mockResolvedValue({ id: "4548", customerRef: "5", balance: 250, totalAmount: 250 });
});

describe("checkQboBalanceBeforeCollection", () => {
  it("clears when QBO shows enough open balance for the requested amount", async () => {
    const supabase = supabaseWithInvoice({ id: "inv-1", invoice_display_number: 2116, invoice_number: "INV-1", qbo_invoice_id: "4548" });
    const result = await checkQboBalanceBeforeCollection({ ...baseParams, supabase });
    expect(result).toEqual({ blocked: false, checked: true });
  });

  it("blocks when QBO shows less open balance than the requested amount", async () => {
    getQboInvoicePaymentContext.mockResolvedValueOnce({ id: "4548", customerRef: "5", balance: 0, totalAmount: 250 });
    const supabase = supabaseWithInvoice({ id: "inv-1", invoice_display_number: 2116, invoice_number: "INV-1", qbo_invoice_id: "4548" });
    const result = await checkQboBalanceBeforeCollection({ ...baseParams, supabase });
    expect(result).toMatchObject({ blocked: true, qboBalanceCents: 0 });
    expect((result as any).message).toContain("invoice 2116");
    expect((result as any).message).toContain("$0.00");
    expect((result as any).message).toContain("$250.00");
  });

  it("fails open when the invoice never synced to QBO", async () => {
    const supabase = supabaseWithInvoice({ id: "inv-1", invoice_display_number: 2116, invoice_number: "INV-1", qbo_invoice_id: null });
    const result = await checkQboBalanceBeforeCollection({ ...baseParams, supabase });
    expect(result).toEqual({ blocked: false, checked: false });
    expect(getValidQboAccessToken).not.toHaveBeenCalled();
  });

  it("fails closed when a QBO-linked invoice cannot be checked because QBO is disconnected", async () => {
    getValidQboAccessToken.mockResolvedValueOnce(null);
    const supabase = supabaseWithInvoice({ id: "inv-1", invoice_display_number: 2116, invoice_number: "INV-1", qbo_invoice_id: "4548" });
    const result = await checkQboBalanceBeforeCollection({ ...baseParams, supabase });
    expect(result).toMatchObject({ blocked: true, qboBalanceCents: null });
    expect((result as any).message).toContain("reconnected");
    expect(getQboInvoicePaymentContext).not.toHaveBeenCalled();
  });

  it("skips the QBO gate when QBO is not configured for the deployment", async () => {
    getQboAvailability.mockReturnValueOnce({ available: false });
    const supabase = supabaseWithInvoice({ id: "inv-1", qbo_invoice_id: "4548" });
    const result = await checkQboBalanceBeforeCollection({ ...baseParams, supabase });
    expect(result).toEqual({ blocked: false, checked: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("fails closed when the QBO balance lookup errors", async () => {
    getQboInvoicePaymentContext.mockRejectedValueOnce(new Error("QBO 500"));
    const supabase = supabaseWithInvoice({ id: "inv-1", invoice_display_number: 2116, invoice_number: "INV-1", qbo_invoice_id: "4548" });
    const result = await checkQboBalanceBeforeCollection({ ...baseParams, supabase });
    expect(result).toMatchObject({ blocked: true, qboBalanceCents: null });
    expect((result as any).message).toContain("paused");
  });
});
