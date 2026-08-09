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
  it("posts a sparse void to operate=void and returns the new sync token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "4676", SyncToken: "2" } }));

    const result = await voidQboInvoice({ ...BASE, qboInvoiceId: "4676", syncToken: "1" });

    expect(result).toEqual({ id: "4676", syncToken: "2" });
    expect(urlOf(0)).toContain("operate=void");
    expect(bodyOf(0)).toEqual({ Id: "4676", SyncToken: "1", sparse: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries with the live lines when QBO rejects the sparse void as a full update", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(MISSING_LINE_FAULT, false, 400))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "4534", SyncToken: "6" } }));

    const raw = {
      Id: "4534",
      SyncToken: "5",
      TotalAmt: 840,
      Balance: 840,
      CustomerRef: { value: "77" },
      Line: [{ Amount: 840, DetailType: "SalesItemLineDetail" }],
    };
    const result = await voidQboInvoice({ ...BASE, qboInvoiceId: "4534", syncToken: "5", invoice: raw });

    expect(result).toEqual({ id: "4534", syncToken: "6" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(1)).toContain("operate=void");
    expect(bodyOf(1)).toEqual({
      Id: "4534",
      SyncToken: "5",
      Line: [{ Amount: 840, DetailType: "SalesItemLineDetail" }],
      CustomerRef: { value: "77" },
    });
  });

  it("never echoes QBO-computed fields back on the retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(MISSING_LINE_FAULT, false, 400))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "4534", SyncToken: "6" } }));

    await voidQboInvoice({
      ...BASE,
      qboInvoiceId: "4534",
      syncToken: "5",
      invoice: { TotalAmt: 840, Balance: 840, MetaData: { CreateTime: "x" }, Line: [{ Amount: 840 }] },
    });

    const retry = bodyOf(1);
    expect(retry).not.toHaveProperty("TotalAmt");
    expect(retry).not.toHaveProperty("Balance");
    expect(retry).not.toHaveProperty("MetaData");
  });

  it("does not retry on an unrelated fault", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ Fault: { Error: [{ Message: "Stale Object Error", Detail: "" }] } }, false, 400),
    );

    await expect(voidQboInvoice({
      ...BASE, qboInvoiceId: "4534", syncToken: "0", invoice: { Line: [{ Amount: 1 }] },
    })).rejects.toThrow("Stale Object Error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when there are no lines to echo", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MISSING_LINE_FAULT, false, 400));

    await expect(voidQboInvoice({ ...BASE, qboInvoiceId: "4534", syncToken: "0" })).rejects.toThrow(/Line is missing/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("findQboInvoiceById", () => {
  it("exposes the raw payload so a void retry can echo the lines back", async () => {
    const invoice = {
      Id: "4534", SyncToken: "5", DocNumber: "2109", TotalAmt: 840, Balance: 840,
      Line: [{ Amount: 840 }], CustomerRef: { value: "77" },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ QueryResponse: { Invoice: [invoice] } }));

    const snapshot = await findQboInvoiceById({ ...BASE, qboInvoiceId: "4534" });

    expect(snapshot).toMatchObject({
      id: "4534", syncToken: "5", docNumber: "2109", balance: 840, totalAmount: 840, looksVoided: false,
    });
    expect(snapshot?.raw).toEqual(invoice);
  });

  it("treats a zeroed invoice as already voided", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      QueryResponse: { Invoice: [{ Id: "4676", SyncToken: "3", TotalAmt: 0, Balance: 0, Line: [] }] },
    }));
    const snapshot = await findQboInvoiceById({ ...BASE, qboInvoiceId: "4676" });
    expect(snapshot?.looksVoided).toBe(true);
  });
});
