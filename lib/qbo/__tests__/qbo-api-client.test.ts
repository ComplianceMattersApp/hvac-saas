import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QboApiError,
  createQboInvoice,
  createQboPayment,
  findOrCreateQboCustomer,
} from "@/lib/qbo/qbo-api-client";

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: "",
      text: async () => JSON.stringify(r.body),
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const base = { accessToken: "AT", realmId: "R", baseUrl: "https://sandbox.example.com" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("qbo-api-client", () => {
  it("creates a payment linked to the synced invoice", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { Payment: { Id: "P55", SyncToken: "0" } } },
    ]);
    const result = await createQboPayment({
      ...base,
      payment: {
        customerRef: "C1",
        invoiceRef: "I1",
        amount: 720,
        txnDate: "2026-07-14",
        paymentRefNum: "CHK-104",
        privateNote: "Received in field",
      },
    });
    expect(result).toEqual({ id: "P55", syncToken: "0" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      CustomerRef: { value: "C1" },
      TotalAmt: 720,
      TxnDate: "2026-07-14",
      PaymentRefNum: "CHK-104",
      PrivateNote: "Received in field",
    });
    expect(body.Line[0]).toMatchObject({
      Amount: 720,
      LinkedTxn: [{ TxnId: "I1", TxnType: "Invoice" }],
    });
  });

  it("findOrCreateQboCustomer queries first, then creates when none found", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { QueryResponse: {} } },
      { status: 200, body: { Customer: { Id: "55", SyncToken: "0" } } },
    ]);
    const result = await findOrCreateQboCustomer({
      ...base,
      customer: {
        displayName: "Acme Co",
        email: "a@b.com",
        phone: null,
        billingAddressLine1: "1 Main",
        billingAddressLine2: "Ste 2",
        billingCity: "Austin",
        billingState: "TX",
        billingZip: "78701",
        billingCountry: "US",
      },
    });
    expect(result).toEqual({ id: "55", syncToken: "0" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("query");
    const createOpts = fetchMock.mock.calls[1][1] as RequestInit;
    expect(createOpts.method).toBe("POST");
    const createBody = JSON.parse(String(createOpts.body));
    expect(createBody.DisplayName).toBe("Acme Co");
    expect(createBody.BillAddr).toMatchObject({ Line1: "1 Main", Line2: "Ste 2", City: "Austin", PostalCode: "78701", Country: "US" });
  });

  it("findOrCreateQboCustomer returns the existing customer without creating", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { QueryResponse: { Customer: [{ Id: "9", SyncToken: "3" }] } } },
    ]);
    const result = await findOrCreateQboCustomer({
      ...base,
      customer: {
        displayName: "Existing",
        email: null,
        phone: null,
        billingAddressLine1: null,
        billingAddressLine2: null,
        billingCity: null,
        billingState: null,
        billingZip: null,
        billingCountry: null,
      },
    });
    expect(result).toEqual({ id: "9", syncToken: "3" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createQboInvoice sends the expected SalesItemLineDetail payload", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { Invoice: { Id: "100", SyncToken: "0" } } },
    ]);
    const result = await createQboInvoice({
      ...base,
      servicesItemRef: "7",
      invoice: {
        docNumber: "2001",
        txnDate: "2026-07-10",
        customerRef: "55",
        lines: [{ description: "AC repair", amount: 100, quantity: 1, unitPrice: 100 }],
        privateNote: null,
      },
    });
    expect(result).toEqual({ id: "100", syncToken: "0" });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.DocNumber).toBe("2001");
    expect(body.CustomerRef).toEqual({ value: "55" });
    expect(body.Line[0].SalesItemLineDetail.ItemRef).toEqual({ value: "7" });
    expect(body.Line[0].Amount).toBe(100);
  });

  it("throws QboApiError with the fault message on a non-2xx response", async () => {
    mockFetchSequence([
      { status: 400, body: { Fault: { Error: [{ Message: "Invalid invoice" }], type: "ValidationFault" } } },
    ]);
    await expect(
      createQboInvoice({
        ...base,
        servicesItemRef: "7",
        invoice: {
          docNumber: "2001",
          txnDate: "2026-07-10",
          customerRef: "55",
          lines: [{ description: "x", amount: 1, quantity: 1, unitPrice: 1 }],
        },
      }),
    ).rejects.toMatchObject({ name: "QboApiError", status: 400, message: "Invalid invoice" });
  });

  it("QboApiError is an Error subclass", () => {
    const err = new QboApiError(500, "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
  });
});
