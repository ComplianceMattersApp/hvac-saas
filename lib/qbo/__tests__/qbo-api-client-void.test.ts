import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findQboInvoiceById, voidQboInvoice } from "@/lib/qbo/qbo-api-client";

const BASE = { accessToken: "AT", realmId: "R", baseUrl: "https://qbo.example.com" };

/** The exact fault production returned for invoice 4534. */
const MISSING_LINE_FAULT = {
  Fault: {
    Error: [{
      Message: "Required param missing, need to supply the required value for the API",
      Detail: "Required parameter Line is missing in the request",
    }],
  },
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Bad Request", text: async () => JSON.stringify(body) };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function bodyOf(callIndex: number) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body);
}
function urlOf(callIndex: number) {
  return String(fetchMock.mock.calls[callIndex][0]);
}

describe("voidQboInvoice", () => {
  it("posts exactly {Id, SyncToken} to operate=void", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "4676", SyncToken: "2" } }));

    const result = await voidQboInvoice({ ...BASE, qboInvoiceId: "4676", syncToken: "1" });

    expect(result).toEqual({ id: "4676", syncToken: "2" });
    expect(urlOf(0)).toContain("operate=void");
    expect(bodyOf(0)).toEqual({ Id: "4676", SyncToken: "1" });
  });

  it("never sends Line — echoing lines back makes QBO rewrite the invoice instead of voiding it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "4534", SyncToken: "6" } }));

    await voidQboInvoice({ ...BASE, qboInvoiceId: "4534", syncToken: "5" });

    const body = bodyOf(0);
    expect(body).not.toHaveProperty("Line");
    expect(body).not.toHaveProperty("CustomerRef");
    expect(body).not.toHaveProperty("TotalAmt");
  });

  it("fails loudly on the missing-Line fault rather than retrying as a full update", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MISSING_LINE_FAULT, false, 400));

    await expect(voidQboInvoice({ ...BASE, qboInvoiceId: "4534", syncToken: "5" }))
      .rejects.toThrow(/Line is missing/);
    // One attempt only. A second, line-bearing attempt would mutate the invoice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an unrelated fault as-is", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ Fault: { Error: [{ Message: "Stale Object Error", Detail: "" }] } }, false, 400),
    );
    await expect(voidQboInvoice({ ...BASE, qboInvoiceId: "4534", syncToken: "0" }))
      .rejects.toThrow("Stale Object Error");
  });
});

describe("findQboInvoiceById", () => {
  it("reports an open invoice", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      QueryResponse: { Invoice: [{ Id: "4534", SyncToken: "5", DocNumber: "2109", TotalAmt: 840, Balance: 840 }] },
    }));

    const snapshot = await findQboInvoiceById({ ...BASE, qboInvoiceId: "4534" });

    expect(snapshot).toEqual({
      id: "4534", syncToken: "5", docNumber: "2109", balance: 840, totalAmount: 840, looksVoided: false,
    });
  });

  it("treats a zeroed invoice as already voided", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      QueryResponse: { Invoice: [{ Id: "4676", SyncToken: "3", TotalAmt: 0, Balance: 0 }] },
    }));
    const snapshot = await findQboInvoiceById({ ...BASE, qboInvoiceId: "4676" });
    expect(snapshot?.looksVoided).toBe(true);
  });
});
