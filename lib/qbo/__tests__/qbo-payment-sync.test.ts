import { beforeEach, describe, expect, it, vi } from "vitest";

const { createQboPayment, getValidQboAccessToken, syncInvoiceToQbo } = vi.hoisted(() => ({
  createQboPayment: vi.fn(),
  getValidQboAccessToken: vi.fn(),
  syncInvoiceToQbo: vi.fn(),
}));

vi.mock("@/lib/qbo/qbo-api-client", () => ({ createQboPayment }));
vi.mock("@/lib/qbo/qbo-connection", () => ({ getValidQboAccessToken }));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboBaseUrl: () => "https://sandbox.example.com" }));
vi.mock("@/lib/qbo/qbo-sync", () => ({ syncInvoiceToQbo }));

import { normalizeQboPaymentRefNum, syncPaymentToQbo } from "@/lib/qbo/qbo-payment-sync";

function makeSupabase(params: { payment: any; invoice: any }) {
  const updates: any[] = [];
  const supabase = {
    from(table: string) {
      const state: any = { table, mode: "select", patch: null };
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        update(patch: any) { state.mode = "update"; state.patch = patch; updates.push(patch); return builder; },
        async maybeSingle() {
          return { data: table === "internal_invoice_payments" ? params.payment : params.invoice, error: null };
        },
        then(resolve: (value: any) => void) { resolve({ data: null, error: null }); },
      };
      return builder;
    },
  };
  return { supabase, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  getValidQboAccessToken.mockResolvedValue({ accessToken: "AT", realmId: "R" });
  createQboPayment.mockResolvedValue({ id: "QP1", syncToken: "0" });
});

describe("syncPaymentToQbo", () => {
  it("keeps short references and compacts long processor references to QBO's 21-character limit", () => {
    expect(normalizeQboPaymentRefNum("CHK-104")).toBe("CHK-104");
    expect(normalizeQboPaymentRefNum("py_3Ttdi56n7KVk2y2H1wLvnOXz")).toBe("ES-6n7KVk2y2H1wLvnOXz");
    expect(normalizeQboPaymentRefNum("py_3Ttdi56n7KVk2y2H1wLvnOXz")).toHaveLength(21);
  });

  it("creates and records a QBO payment against the synced invoice", async () => {
    const { supabase, updates } = makeSupabase({
      payment: {
        id: "pay-1", payment_status: "recorded", invoice_id: "inv-1", amount_cents: 72000,
        paid_at: "2026-07-14T18:00:00.000Z", received_reference: "CHK-104", notes: "Received in field",
      },
      invoice: { id: "inv-1", qbo_invoice_id: "QI1", qbo_customer_id: "QC1" },
    });
    const result = await syncPaymentToQbo({ supabase, accountOwnerUserId: "owner-1", paymentId: "pay-1" });
    expect(result).toEqual({ paymentId: "pay-1", status: "synced", qboPaymentId: "QP1" });
    expect(createQboPayment).toHaveBeenCalledWith(expect.objectContaining({
      payment: expect.objectContaining({ customerRef: "QC1", invoiceRef: "QI1", amount: 720, paymentRefNum: "CHK-104", privateNote: expect.stringContaining("EveryStep payment reference: CHK-104") }),
    }));
    expect(updates).toContainEqual(expect.objectContaining({ qbo_sync_status: "pending" }));
    expect(updates).toContainEqual(expect.objectContaining({ qbo_sync_status: "synced", qbo_payment_id: "QP1" }));
  });

  it("does not duplicate a payment that already has a QBO id", async () => {
    const { supabase } = makeSupabase({
      payment: { id: "pay-1", payment_status: "recorded", qbo_payment_id: "QP1" },
      invoice: null,
    });
    const result = await syncPaymentToQbo({ supabase, accountOwnerUserId: "owner-1", paymentId: "pay-1" });
    expect(result.status).toBe("synced");
    expect(createQboPayment).not.toHaveBeenCalled();
  });

  it("persists a retryable failure when the QBO connection is unavailable", async () => {
    getValidQboAccessToken.mockResolvedValueOnce(null);
    const { supabase, updates } = makeSupabase({
      payment: { id: "pay-1", payment_status: "recorded", invoice_id: "inv-1", amount_cents: 35000 },
      invoice: null,
    });
    const result = await syncPaymentToQbo({ supabase, accountOwnerUserId: "owner-1", paymentId: "pay-1" });
    expect(result).toMatchObject({ status: "error", error: expect.stringContaining("Reconnect QuickBooks") });
    expect(updates).toContainEqual(expect.objectContaining({ qbo_sync_status: "failed" }));
    expect(createQboPayment).not.toHaveBeenCalled();
  });
});
