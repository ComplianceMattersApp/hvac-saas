import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQboAvailability, syncInvoiceToQbo, createAdminClient } = vi.hoisted(() => ({
  getQboAvailability: vi.fn(),
  syncInvoiceToQbo: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/qbo/qbo-env", () => ({ getQboAvailability }));
vi.mock("@/lib/qbo/qbo-sync", () => ({ syncInvoiceToQbo }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient }));

import { autoSyncIssuedInvoiceToQbo } from "@/lib/qbo/qbo-auto-sync";

beforeEach(() => {
  vi.clearAllMocks();
  createAdminClient.mockReturnValue({ __admin: true });
  syncInvoiceToQbo.mockResolvedValue({ invoiceId: "inv1", status: "synced" });
});

describe("autoSyncIssuedInvoiceToQbo", () => {
  it("no-ops when QBO is not configured for the environment", async () => {
    getQboAvailability.mockReturnValue({ available: false, missingKeys: ["QBO_CLIENT_ID"] });
    await autoSyncIssuedInvoiceToQbo({ accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(syncInvoiceToQbo).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("syncs the invoice via an admin (service-role) client when QBO is configured", async () => {
    getQboAvailability.mockReturnValue({ available: true, missingKeys: [] });
    await autoSyncIssuedInvoiceToQbo({ accountOwnerUserId: "acc", invoiceId: "inv1" });
    expect(createAdminClient).toHaveBeenCalled();
    expect(syncInvoiceToQbo).toHaveBeenCalledWith({
      supabase: { __admin: true },
      accountOwnerUserId: "acc",
      invoiceId: "inv1",
    });
  });

  it("never throws when the sync fails — issuance must not be blocked", async () => {
    getQboAvailability.mockReturnValue({ available: true, missingKeys: [] });
    syncInvoiceToQbo.mockRejectedValue(new Error("QBO down"));
    await expect(
      autoSyncIssuedInvoiceToQbo({ accountOwnerUserId: "acc", invoiceId: "inv1" }),
    ).resolves.toBeUndefined();
  });
});

describe("invoice-issue → QBO auto-sync wiring", () => {
  const src = readFileSync(resolve(__dirname, "../../actions/internal-invoice-actions.ts"), "utf-8");

  it("imports and invokes autoSyncIssuedInvoiceToQbo", () => {
    expect(src).toContain("import { autoSyncIssuedInvoiceToQbo }");
    expect(src).toContain("autoSyncIssuedInvoiceToQbo({");
  });

  it("invokes it inside the shared issue mutation (before the issue entry points)", () => {
    const call = src.indexOf("autoSyncIssuedInvoiceToQbo({");
    const issueFn = src.indexOf("export async function issueInternalInvoiceFromForm");
    expect(call).toBeGreaterThanOrEqual(0);
    expect(issueFn).toBeGreaterThan(0);
    // The single hook lives in applyInternalInvoiceIssueMutation, which is defined
    // above the issue entry points — so both Issue and Issue & Send inherit it.
    expect(call).toBeLessThan(issueFn);
  });
});
