/**
 * Thin typed fetch wrapper for QBO REST API v3.
 * No SDK dependencies — direct fetch with typed request/response shapes.
 * Every call throws QboApiError on a non-2xx response; the sync orchestrator
 * owns graceful degradation, this layer never swallows errors.
 */

const QBO_MINOR_VERSION = "65";

export class QboApiError extends Error {
  readonly status: number;
  readonly fault?: unknown;
  constructor(status: number, message: string, fault?: unknown) {
    super(message);
    this.name = "QboApiError";
    this.status = status;
    this.fault = fault;
  }
}

export interface QboCustomerInput {
  displayName: string;
  email: string | null;
  phone: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  billingCountry: string | null;
}

export interface QboInvoiceLineInput {
  description: string;
  amount: number; // dollars, 2 decimal places
  quantity: number;
  unitPrice: number;
}

export interface QboInvoiceInput {
  docNumber: string; // invoice_display_number
  txnDate: string; // YYYY-MM-DD
  customerRef: string; // QBO Customer.Id
  lines: QboInvoiceLineInput[];
  privateNote?: string | null;
}

export interface QboPaymentInput {
  customerRef: string;
  invoiceRef: string;
  amount: number;
  txnDate: string;
  paymentRefNum?: string | null;
  privateNote?: string | null;
}

export interface QboSyncedEntity {
  id: string;
  syncToken: string;
}

export async function findQboInvoiceByDocNumber(
  params: QboRequestBase & { docNumber: string },
): Promise<QboSyncedEntity | null> {
  const { accessToken, realmId, baseUrl, docNumber } = params;
  const normalizedDocNumber = docNumber.trim();
  if (!normalizedDocNumber) return null;

  const found = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "query",
    method: "GET",
    query: `select Id, SyncToken from Invoice where DocNumber = '${escapeQboQueryValue(normalizedDocNumber)}'`,
  });
  const existing = found?.QueryResponse?.Invoice?.[0];
  if (!existing?.Id) return null;
  return { id: String(existing.Id), syncToken: String(existing.SyncToken ?? "0") };
}

interface QboRequestBase {
  accessToken: string;
  realmId: string;
  baseUrl: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** QBO query language escapes single quotes with a backslash. */
function escapeQboQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function qboFetch(opts: {
  accessToken: string;
  realmId: string;
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  query?: string;
}): Promise<any> {
  const { accessToken, realmId, baseUrl, path, method, body, query } = opts;
  const url = new URL(`${baseUrl}/v3/company/${realmId}/${path}`);
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  if (query) url.searchParams.set("query", query);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const faultError = json?.Fault?.Error?.[0];
    const faultMessage = String(faultError?.Message ?? "").trim();
    const faultDetail = String(faultError?.Detail ?? "").trim();
    const combinedFault = faultMessage && faultDetail && faultDetail !== faultMessage
      ? `${faultMessage}: ${faultDetail}`
      : faultDetail || faultMessage;
    const message =
      combinedFault ||
      (text && text.length <= 500 ? text : response.statusText) ||
      `QBO request failed (${response.status})`;
    throw new QboApiError(response.status, message, json?.Fault);
  }

  return json;
}

export async function findOrCreateQboServicesItem(
  params: QboRequestBase,
): Promise<string> {
  const { accessToken, realmId, baseUrl } = params;

  const found = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "query",
    method: "GET",
    query: "select * from Item where Name = 'Services'",
  });
  const existing = found?.QueryResponse?.Item?.[0];
  if (existing?.Id) return String(existing.Id);

  const accounts = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "query",
    method: "GET",
    query: "select * from Account where AccountType = 'Income'",
  });
  const incomeAccount = accounts?.QueryResponse?.Account?.[0];
  if (!incomeAccount?.Id) {
    throw new QboApiError(0, "No QBO income account available to attach the Services item to");
  }

  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "item",
    method: "POST",
    body: {
      Name: "Services",
      Type: "Service",
      IncomeAccountRef: { value: String(incomeAccount.Id) },
    },
  });
  const item = created?.Item;
  if (!item?.Id) throw new QboApiError(0, "QBO item creation returned no Id");
  return String(item.Id);
}

export async function findOrCreateQboCustomer(
  params: QboRequestBase & { customer: QboCustomerInput },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, customer } = params;

  const found = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "query",
    method: "GET",
    query: `select * from Customer where DisplayName = '${escapeQboQueryValue(customer.displayName)}'`,
  });
  const existing = found?.QueryResponse?.Customer?.[0];
  if (existing?.Id) {
    return { id: String(existing.Id), syncToken: String(existing.SyncToken) };
  }

  const body: Record<string, unknown> = { DisplayName: customer.displayName };
  if (customer.email) body.PrimaryEmailAddr = { Address: customer.email };
  if (customer.phone) body.PrimaryPhone = { FreeFormNumber: customer.phone };
  const billAddr: Record<string, unknown> = {};
  if (customer.billingAddressLine1) billAddr.Line1 = customer.billingAddressLine1;
  if (customer.billingAddressLine2) billAddr.Line2 = customer.billingAddressLine2;
  if (customer.billingCity) billAddr.City = customer.billingCity;
  if (customer.billingState) billAddr.CountrySubDivisionCode = customer.billingState;
  if (customer.billingZip) billAddr.PostalCode = customer.billingZip;
  if (customer.billingCountry) billAddr.Country = customer.billingCountry;
  if (Object.keys(billAddr).length > 0) body.BillAddr = billAddr;

  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "customer",
    method: "POST",
    body,
  });
  const createdCustomer = created?.Customer;
  if (!createdCustomer?.Id) throw new QboApiError(0, "QBO customer creation returned no Id");
  return { id: String(createdCustomer.Id), syncToken: String(createdCustomer.SyncToken) };
}

function buildInvoiceBody(invoice: QboInvoiceInput, servicesItemRef: string): Record<string, unknown> {
  return {
    DocNumber: invoice.docNumber,
    TxnDate: invoice.txnDate,
    CustomerRef: { value: invoice.customerRef },
    Line: invoice.lines.map((line) => ({
      DetailType: "SalesItemLineDetail",
      Amount: round2(line.amount),
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: servicesItemRef },
        Qty: line.quantity,
        UnitPrice: round2(line.unitPrice),
      },
    })),
    ...(invoice.privateNote ? { PrivateNote: invoice.privateNote } : {}),
  };
}

export async function createQboInvoice(
  params: QboRequestBase & { invoice: QboInvoiceInput; servicesItemRef: string },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, invoice, servicesItemRef } = params;
  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "invoice",
    method: "POST",
    body: buildInvoiceBody(invoice, servicesItemRef),
  });
  const inv = created?.Invoice;
  if (!inv?.Id) throw new QboApiError(0, "QBO invoice creation returned no Id");
  return { id: String(inv.Id), syncToken: String(inv.SyncToken) };
}

export async function updateQboInvoice(
  params: QboRequestBase & {
    qboInvoiceId: string;
    syncToken: string;
    invoice: QboInvoiceInput;
    servicesItemRef: string;
  },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, qboInvoiceId, syncToken, invoice, servicesItemRef } = params;
  const updated = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "invoice",
    method: "POST",
    body: {
      ...buildInvoiceBody(invoice, servicesItemRef),
      Id: qboInvoiceId,
      SyncToken: syncToken,
    },
  });
  const inv = updated?.Invoice;
  if (!inv?.Id) throw new QboApiError(0, "QBO invoice update returned no Id");
  return { id: String(inv.Id), syncToken: String(inv.SyncToken) };
}

export async function createQboPayment(
  params: QboRequestBase & { payment: QboPaymentInput },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, payment } = params;
  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "payment",
    method: "POST",
    body: {
      CustomerRef: { value: payment.customerRef },
      TotalAmt: round2(payment.amount),
      TxnDate: payment.txnDate,
      Line: [{
        Amount: round2(payment.amount),
        LinkedTxn: [{ TxnId: payment.invoiceRef, TxnType: "Invoice" }],
      }],
      ...(payment.paymentRefNum ? { PaymentRefNum: payment.paymentRefNum } : {}),
      ...(payment.privateNote ? { PrivateNote: payment.privateNote } : {}),
    },
  });
  const paymentRow = created?.Payment;
  if (!paymentRow?.Id) throw new QboApiError(0, "QBO payment creation returned no Id");
  return { id: String(paymentRow.Id), syncToken: String(paymentRow.SyncToken ?? "0") };
}
