import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EVERYSTEP_FALLBACK_QBO_ITEM_NAME,
  QboApiError,
  createQboInvoice,
  createQboPayment,
  findQboInvoiceByDocNumber,
  findQboPaymentById,
  findOrCreateQboCustomer,
  findOrCreateEveryStepServicesItem,
  getQboInvoicePaymentContext,
  listActiveQboItems,
  listQboPaymentsSince,
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
      requestId: "espay-payment-55",
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
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("requestid")).toBe("espay-payment-55");
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
      requestId: "esinv-invoice-1",
      invoice: {
        docNumber: "2001",
        txnDate: "2026-07-10",
        customerRef: "55",
        lines: [{ description: "AC repair", amount: 100, quantity: 1, unitPrice: 100, itemRef: "7" }],
        privateNote: null,
      },
    });
    expect(result).toEqual({ id: "100", syncToken: "0" });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.DocNumber).toBe("2001");
    expect(body.CustomerRef).toEqual({ value: "55" });
    expect(body.Line[0].SalesItemLineDetail.ItemRef).toEqual({ value: "7" });
    expect(body.Line[0].Amount).toBe(100);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("requestid")).toBe("esinv-invoice-1");
  });

  it("posts each line against its own ItemRef, not one catch-all item", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { Invoice: { Id: "101", SyncToken: "0" } } },
    ]);
    await createQboInvoice({
      ...base,
      invoice: {
        docNumber: "2002",
        txnDate: "2026-07-11",
        customerRef: "55",
        lines: [
          { description: "Duct cleaning", amount: 300, quantity: 3, unitPrice: 100, itemRef: "41" },
          { description: "Filter", amount: 40, quantity: 2, unitPrice: 20, itemRef: "42" },
          { description: "Misc", amount: 15, quantity: 1, unitPrice: 15, itemRef: "7" },
        ],
      },
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.Line.map((line: any) => line.SalesItemLineDetail.ItemRef.value)).toEqual(["41", "42", "7"]);
    expect(body.Line[0].SalesItemLineDetail.Qty).toBe(3);
    expect(body.Line[0].SalesItemLineDetail.UnitPrice).toBe(100);
  });

  it("matches only the namespaced fallback item, never a tenant's own 'Services'", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { QueryResponse: { Item: [{ Id: "88" }] } } },
    ]);
    await expect(findOrCreateEveryStepServicesItem({ ...base })).resolves.toBe("88");
    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("query");
    expect(query).toBe("select * from Item where Name = 'EveryStep Services'");
    expect(query).not.toContain("Name = 'Services'");
  });

  it("creates the fallback item under the namespaced name when QBO has none", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { QueryResponse: {} } },
      { status: 200, body: { QueryResponse: { Account: [{ Id: "12" }] } } },
      { status: 200, body: { Item: { Id: "99" } } },
    ]);
    await expect(findOrCreateEveryStepServicesItem({ ...base })).resolves.toBe("99");
    const createBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(createBody).toMatchObject({
      Name: EVERYSTEP_FALLBACK_QBO_ITEM_NAME,
      Type: "Service",
      IncomeAccountRef: { value: "12" },
    });
  });

  it("lists only active Service/NonInventory items for the mapping selectors", async () => {
    mockFetchSequence([
      { status: 200, body: { QueryResponse: { Item: [
        { Id: "3", Name: "Zone Balancing", Type: "Service" },
        { Id: "4", Name: "Air Filter", Type: "NonInventory" },
        { Id: "5", Name: "Stocked Compressor", Type: "Inventory" },
        { Id: "6", Name: "", Type: "Service" },
      ] } } },
    ]);
    await expect(listActiveQboItems({ ...base })).resolves.toEqual([
      { id: "4", name: "Air Filter", type: "NonInventory" },
      { id: "3", name: "Zone Balancing", type: "Service" },
    ]);
  });

  it("reads one payment back by id with its linked invoice allocations", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { QueryResponse: { Payment: [{
        Id: "P9",
        TotalAmt: 250,
        TxnDate: "2026-08-04",
        Line: [{ Amount: 250, LinkedTxn: [{ TxnId: "QI1", TxnType: "Invoice" }] }],
      }] } } },
    ]);
    await expect(findQboPaymentById({ ...base, qboPaymentId: "P9" })).resolves.toEqual({
      id: "P9",
      totalAmount: 250,
      txnDate: "2026-08-04",
      linkedInvoiceIds: ["QI1"],
      appliedAmountByInvoiceId: { QI1: 250 },
    });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("query")).toBe(
      "select * from Payment where Id = 'P9'",
    );
  });

  it("findQboPaymentById returns null when QBO has no such payment", async () => {
    mockFetchSequence([{ status: 200, body: { QueryResponse: {} } }]);
    await expect(findQboPaymentById({ ...base, qboPaymentId: "P-GONE" })).resolves.toBeNull();
  });

  it("findQboInvoiceByDocNumber returns an exact existing invoice", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { QueryResponse: { Invoice: [{ Id: "1727", SyncToken: "4" }] } } },
    ]);

    const result = await findQboInvoiceByDocNumber({ ...base, docNumber: "2001" });

    expect(result).toEqual({ id: "1727", syncToken: "4" });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("query")).toBe("select * from Invoice where DocNumber = '2001'");
  });

  it("findQboInvoiceByDocNumber returns null when the number is available", async () => {
    mockFetchSequence([{ status: 200, body: { QueryResponse: {} } }]);
    await expect(findQboInvoiceByDocNumber({ ...base, docNumber: "2001" })).resolves.toBeNull();
  });

  it("loads the current QBO invoice customer and open balance before payment", async () => {
    mockFetchSequence([{ status: 200, body: { QueryResponse: { Invoice: [{ Id: "4520", CustomerRef: { value: "315" }, Balance: 410, TotalAmt: 410 }] } } }]);
    await expect(getQboInvoicePaymentContext({ ...base, invoiceId: "4520" })).resolves.toEqual({ id: "4520", customerRef: "315", balance: 410, totalAmount: 410 });
  });

  it("preserves per-invoice allocations for multi-invoice QBO payments", async () => {
    mockFetchSequence([{ status: 200, body: { QueryResponse: { Payment: [{
      Id: "P-MULTI",
      TotalAmt: 1000,
      TxnDate: "2026-08-01",
      Line: [
        { Amount: 840, LinkedTxn: [{ TxnId: "I1", TxnType: "Invoice" }] },
        { Amount: 160, LinkedTxn: [{ TxnId: "I2", TxnType: "Invoice" }] },
      ],
    }] } } }]);

    await expect(listQboPaymentsSince({ ...base, fromDate: "2026-07-01" })).resolves.toEqual([{
      id: "P-MULTI",
      totalAmount: 1000,
      txnDate: "2026-08-01",
      linkedInvoiceIds: ["I1", "I2"],
      appliedAmountByInvoiceId: { I1: 840, I2: 160 },
    }]);
  });

  it("throws QboApiError with the fault message on a non-2xx response", async () => {
    mockFetchSequence([
      { status: 400, body: { Fault: { Error: [{ Message: "Invalid invoice" }], type: "ValidationFault" } } },
    ]);
    await expect(
      createQboInvoice({
        ...base,
        invoice: {
          docNumber: "2001",
          txnDate: "2026-07-10",
          customerRef: "55",
          lines: [{ description: "x", amount: 1, quantity: 1, unitPrice: 1, itemRef: "7" }],
        },
      }),
    ).rejects.toMatchObject({ name: "QboApiError", status: 400, message: "Invalid invoice" });
  });

  it("preserves Intuit validation detail when the headline is generic", async () => {
    mockFetchSequence([{ status: 400, body: { Fault: { Error: [{ Message: "A business validation error has occurred", Detail: "The payment amount cannot exceed the invoice balance." }] } } }]);
    await expect(createQboPayment({
      ...base,
      payment: { customerRef: "C1", invoiceRef: "I1", amount: 350, txnDate: "2026-07-16" },
    })).rejects.toMatchObject({
      message: "A business validation error has occurred: The payment amount cannot exceed the invoice balance.",
    });
  });

  it("QboApiError is an Error subclass", () => {
    const err = new QboApiError(500, "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
  });
});
