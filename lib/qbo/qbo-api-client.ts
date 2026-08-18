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
  /**
   * QBO Item.Id this line posts against. Per line, not per invoice: every line
   * used to share one catch-all item, which is why quantities showed up as
   * hours in files that already had an hours-based item named "Services".
   */
  itemRef: string;
  /**
   * Whether this line is subject to sales tax. Sent as the US semantic
   * TaxCodeRef (TAX/NON) so QuickBooks computes its own tax from its own rates;
   * EveryStep never sends TxnTaxDetail.
   */
  isTaxable?: boolean;
}

export interface QboInvoiceInput {
  docNumber: string; // invoice_display_number
  txnDate: string; // YYYY-MM-DD
  customerRef: string; // QBO Customer.Id
  lines: QboInvoiceLineInput[];
  privateNote?: string | null;
  /**
   * "EmailSent" when EveryStep already delivered this invoice by email, so
   * QuickBooks shows "Sent" instead of nagging to send it again. Never any
   * other value: delivery truth lives in EveryStep, and QBO must not be told
   * to send anything itself.
   */
  emailStatus?: "EmailSent" | null;
  /**
   * The address EveryStep actually delivered to. QuickBooks silently discards
   * EmailStatus=EmailSent on invoices with no BillEmail ("sent to whom?"), so
   * the sent flag only sticks when this accompanies it.
   */
  billEmail?: string | null;
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
  privateNote?: string | null;
}

export type QboInvoicePaymentContext = {
  id: string;
  customerRef: string;
  balance: number;
  totalAmount: number;
};

export async function getQboInvoicePaymentContext(
  params: QboRequestBase & { invoiceId: string },
): Promise<QboInvoicePaymentContext | null> {
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!invoiceId) return null;
  const found = await qboFetch({
    accessToken: params.accessToken,
    realmId: params.realmId,
    baseUrl: params.baseUrl,
    path: "query",
    method: "GET",
    query: `select * from Invoice where Id = '${escapeQboQueryValue(invoiceId)}'`,
  });
  const invoice = found?.QueryResponse?.Invoice?.[0];
  if (!invoice?.Id) return null;
  return {
    id: String(invoice.Id),
    customerRef: String(invoice.CustomerRef?.value ?? "").trim(),
    balance: Number(invoice.Balance ?? 0),
    totalAmount: Number(invoice.TotalAmt ?? 0),
  };
}

export type QboLinkedInvoicePayment = {
  id: string;
  totalAmount: number;
  /**
   * The portion of this payment applied to the requested invoice. A payment's
   * TotalAmt can span several invoices, so matching must use this, not the total.
   */
  appliedToInvoiceAmount: number;
  paymentRefNum: string | null;
  txnDate: string | null;
};

/**
 * QBO's query language cannot filter Payment by LinkedTxn, so this pulls the
 * customer's payments (newest first — the settling payment is typically recent
 * and the window is capped at 100) and filters client-side for lines applied
 * to the invoice.
 */
export async function findQboPaymentsLinkedToInvoice(
  params: QboRequestBase & { customerRef: string; invoiceId: string },
): Promise<QboLinkedInvoicePayment[]> {
  const customerRef = String(params.customerRef ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!customerRef || !invoiceId) return [];
  const found = await qboFetch({
    accessToken: params.accessToken,
    realmId: params.realmId,
    baseUrl: params.baseUrl,
    path: "query",
    method: "GET",
    query: `select * from Payment where CustomerRef = '${escapeQboQueryValue(customerRef)}' orderby TxnDate desc maxresults 100`,
  });
  const payments: any[] = found?.QueryResponse?.Payment ?? [];
  const lineLinksInvoice = (line: any) => (line?.LinkedTxn ?? []).some((txn: any) =>
    String(txn?.TxnType ?? "") === "Invoice" && String(txn?.TxnId ?? "") === invoiceId,
  );
  return payments
    .filter((payment) => (payment?.Line ?? []).some(lineLinksInvoice))
    .map((payment) => ({
      id: String(payment.Id),
      totalAmount: Number(payment.TotalAmt ?? 0),
      appliedToInvoiceAmount: (payment?.Line ?? []).reduce(
        (sum: number, line: any) => (lineLinksInvoice(line) ? sum + Number(line?.Amount ?? 0) : sum),
        0,
      ),
      paymentRefNum: String(payment.PaymentRefNum ?? "").trim() || null,
      txnDate: String(payment.TxnDate ?? "").trim() || null,
    }));
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
    query: `select * from Invoice where DocNumber = '${escapeQboQueryValue(normalizedDocNumber)}'`,
  });
  const existing = found?.QueryResponse?.Invoice?.[0];
  if (!existing?.Id) return null;
  const privateNote = String(existing.PrivateNote ?? "").trim();
  return {
    id: String(existing.Id),
    syncToken: String(existing.SyncToken ?? "0"),
    ...(privateNote ? { privateNote } : {}),
  };
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
  /** Intuit duplicate-request guard. Must be stable across retries and <= 50 chars. */
  requestId?: string;
  /**
   * QBO operation selector, e.g. void on POST /invoice. The parameter NAME is
   * explicit because Intuit is inconsistent about it: `operation=` appears in
   * the entity docs and in node-quickbooks, `operate=` in other examples. Using
   * the wrong one is silent — QBO ignores it and processes the request as a full
   * update instead, which is what broke invoice 2109 in production.
   */
  operation?: { name: "operation" | "operate"; value: string };
}): Promise<any> {
  const { accessToken, realmId, baseUrl, path, method, body, query, requestId, operation } = opts;
  const url = new URL(`${baseUrl}/v3/company/${realmId}/${path}`);
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  if (query) url.searchParams.set("query", query);
  if (requestId) url.searchParams.set("requestid", requestId.slice(0, 50));
  if (operation) url.searchParams.set(operation.name, operation.value);

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

/** The app-owned catch-all item. Deliberately namespaced — see below. */
export const EVERYSTEP_FALLBACK_QBO_ITEM_NAME = "EveryStep Services";

/**
 * Find (or create) the app-owned fallback item every unmapped invoice line
 * posts against.
 *
 * The name is namespaced on purpose. This used to find-or-create a bare
 * "Services" item, which meant any QuickBooks file that already had an item by
 * that name — commonly an hours-based service item — silently absorbed every
 * EveryStep line, rendering our quantities as hours. Matching only the
 * namespaced name means we adopt an item we created, never the tenant's own.
 */
export async function findOrCreateEveryStepServicesItem(
  params: QboRequestBase,
): Promise<string> {
  const { accessToken, realmId, baseUrl } = params;

  const found = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "query",
    method: "GET",
    query: `select * from Item where Name = '${escapeQboQueryValue(EVERYSTEP_FALLBACK_QBO_ITEM_NAME)}'`,
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
    throw new QboApiError(
      0,
      `No QBO income account available to attach the ${EVERYSTEP_FALLBACK_QBO_ITEM_NAME} item to`,
    );
  }

  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "item",
    method: "POST",
    body: {
      Name: EVERYSTEP_FALLBACK_QBO_ITEM_NAME,
      Type: "Service",
      IncomeAccountRef: { value: String(incomeAccount.Id) },
    },
  });
  const item = created?.Item;
  if (!item?.Id) throw new QboApiError(0, "QBO item creation returned no Id");
  return String(item.Id);
}

export type QboItemOption = {
  id: string;
  name: string;
  type: string;
};

/**
 * Active QBO items an invoice line can post against, for the mapping selectors.
 *
 * Only Service and NonInventory are offered: those are the types QBO accepts on
 * a SalesItemLineDetail without inventory tracking, so anything else would be a
 * mapping that fails at push time. Both filters run server-side, and the walk is
 * paginated — a mature catalog runs past QBO's 1000-row response cap, and a
 * truncated list would silently hide items an operator needs to map.
 */
export async function listActiveQboItems(params: QboRequestBase): Promise<QboItemOption[]> {
  const rows = await queryQboAll({
    ...params,
    entity: "Item",
    where: "Active = true and Type in ('Service', 'NonInventory')",
  });
  return rows
    .map((row) => ({
      id: String(row?.Id ?? "").trim(),
      name: String(row?.Name ?? "").trim(),
      type: String(row?.Type ?? "").trim(),
    }))
    .filter((row) => row.id && row.name)
    .sort((a, b) => a.name.localeCompare(b.name));
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

function buildInvoiceBody(invoice: QboInvoiceInput): Record<string, unknown> {
  return {
    DocNumber: invoice.docNumber,
    TxnDate: invoice.txnDate,
    CustomerRef: { value: invoice.customerRef },
    Line: invoice.lines.map((line) => ({
      DetailType: "SalesItemLineDetail",
      Amount: round2(line.amount),
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: line.itemRef },
        Qty: line.quantity,
        UnitPrice: round2(line.unitPrice),
        // TAX/NON are QuickBooks' US semantic tax codes: they say whether the
        // line is taxable and let QBO apply its own rate. We deliberately send
        // no TxnTaxDetail — QuickBooks owns the tax amount on its side, and our
        // tax_cents never travels as a number.
        TaxCodeRef: { value: line.isTaxable ? "TAX" : "NON" },
      },
    })),
    ...(invoice.privateNote ? { PrivateNote: invoice.privateNote } : {}),
    // Included on full updates too: QBO's full-update semantics clear omitted
    // writable fields, so leaving this out of a later re-sync would flip an
    // already-sent invoice back to "Not sent". BillEmail rides along because
    // QBO silently drops EmailStatus on invoices with no email address.
    ...(invoice.emailStatus === "EmailSent"
      ? {
          EmailStatus: "EmailSent",
          ...(invoice.billEmail ? { BillEmail: { Address: invoice.billEmail } } : {}),
        }
      : {}),
  };
}

export async function createQboInvoice(
  params: QboRequestBase & { invoice: QboInvoiceInput; requestId?: string | null },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, invoice } = params;
  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "invoice",
    method: "POST",
    requestId: String(params.requestId ?? "").trim() || undefined,
    body: buildInvoiceBody(invoice),
  });
  const inv = created?.Invoice;
  if (!inv?.Id) throw new QboApiError(0, "QBO invoice creation returned no Id");
  // A 2xx is NOT proof the invoice landed as sent — callers confirm by re-reading.
  return { id: String(inv.Id), syncToken: String(inv.SyncToken) };
}

export async function updateQboInvoice(
  params: QboRequestBase & {
    qboInvoiceId: string;
    syncToken: string;
    invoice: QboInvoiceInput;
    requestId?: string | null;
  },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, qboInvoiceId, syncToken, invoice } = params;
  const updated = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "invoice",
    method: "POST",
    requestId: String(params.requestId ?? "").trim() || undefined,
    body: {
      ...buildInvoiceBody(invoice),
      Id: qboInvoiceId,
      SyncToken: syncToken,
    },
  });
  const inv = updated?.Invoice;
  if (!inv?.Id) throw new QboApiError(0, "QBO invoice update returned no Id");
  return { id: String(inv.Id), syncToken: String(inv.SyncToken) };
}

export interface QboInvoiceSnapshot {
  id: string;
  syncToken: string;
  docNumber: string | null;
  balance: number;
  /** TotalAmt — INCLUDES sales tax when the company has it enabled. */
  totalAmount: number;
  /**
   * TxnTaxDetail.TotalTax. QuickBooks' Automated Sales Tax adds this on its own
   * side, so it is present on the read-back even though EveryStep never sends
   * tax. Anything comparing our line total against QuickBooks must subtract it.
   */
  totalTax: number;
  /**
   * QBO exposes no explicit "voided" flag on Invoice — voiding zeroes every line,
   * so TotalAmt and Balance both land on 0. An invoice can only reach EveryStep's
   * QBO sync with a positive total (the zero_or_invalid_total eligibility gate),
   * so a zeroed synced invoice means it was voided in QBO already.
   */
  looksVoided: boolean;
  /**
   * QuickBooks' own record of whether this invoice was emailed ("EmailSent",
   * "NeedToSend", "NotSet"). QBO silently drops EmailStatus writes it dislikes
   * while returning 2xx, so anything asserting "marked sent" must confirm
   * against this read-back value, never the write response.
   */
  emailStatus: string | null;
}

function toQboInvoiceSnapshot(invoice: any): QboInvoiceSnapshot {
  const balance = Number(invoice.Balance ?? 0);
  const totalAmount = Number(invoice.TotalAmt ?? 0);
  return {
    id: String(invoice.Id),
    syncToken: String(invoice.SyncToken ?? "0"),
    docNumber: String(invoice.DocNumber ?? "").trim() || null,
    balance,
    totalAmount,
    totalTax: Number(invoice.TxnTaxDetail?.TotalTax ?? 0),
    looksVoided: totalAmount === 0 && balance === 0,
    emailStatus: String(invoice.EmailStatus ?? "").trim() || null,
  };
}

/**
 * Read one QBO invoice by its QBO Id. Returns null when QBO has no such invoice
 * (deleted there, or the stored id is stale).
 *
 * The live SyncToken matters: applying a payment or editing in QBO bumps it, so
 * the token stored at push time goes stale and any write using it fails with a
 * 5010 stale-object fault. Callers that mutate should always re-read first.
 */
export async function findQboInvoiceById(
  params: QboRequestBase & { qboInvoiceId: string },
): Promise<QboInvoiceSnapshot | null> {
  const { accessToken, realmId, baseUrl } = params;
  const qboInvoiceId = String(params.qboInvoiceId ?? "").trim();
  if (!qboInvoiceId) return null;

  const found = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "query",
    method: "GET",
    query: `select * from Invoice where Id = '${escapeQboQueryValue(qboInvoiceId)}'`,
  });
  const invoice = found?.QueryResponse?.Invoice?.[0];
  if (!invoice?.Id) return null;
  return toQboInvoiceSnapshot(invoice);
}

/**
 * Void a QBO invoice (POST /invoice?operate=void with a sparse Id + SyncToken).
 *
 * Void, not delete: QBO keeps the invoice, its number, and its audit trail, and
 * zeroes the amounts — which matches EveryStep's own "voiding keeps the invoice
 * in history" semantics. `syncToken` must be the live one, not the stored one.
 */
/**
 * Paginated QBO query. QBO caps a response at 1000 rows and offers no cursor, so
 * pages are walked with STARTPOSITION until a short page comes back.
 *
 * Reconciliation reads in bulk through this rather than looking up rows one at a
 * time: QBO throttles hard, and a per-row loop over a few hundred invoices is
 * both slow and far more likely to trip a rate limit mid-run.
 */
async function queryQboAll(
  params: QboRequestBase & { entity: "Invoice" | "Payment" | "Item"; where: string },
): Promise<any[]> {
  const { accessToken, realmId, baseUrl, entity, where } = params;
  const PAGE_SIZE = 500;
  const rows: any[] = [];

  for (let start = 1; ; start += PAGE_SIZE) {
    const page = await qboFetch({
      accessToken,
      realmId,
      baseUrl,
      path: "query",
      method: "GET",
      query: `select * from ${entity} where ${where} startposition ${start} maxresults ${PAGE_SIZE}`,
    });
    const batch: any[] = page?.QueryResponse?.[entity] ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    // Hard stop: a runaway page walk would hammer a throttled API.
    if (rows.length >= 10000) return rows;
  }
}

/** Every QBO invoice with a transaction date on/after `fromDate` (YYYY-MM-DD). */
export async function listQboInvoicesSince(
  params: QboRequestBase & { fromDate: string },
): Promise<QboInvoiceSnapshot[]> {
  const rows = await queryQboAll({
    ...params,
    entity: "Invoice",
    where: `TxnDate >= '${escapeQboQueryValue(params.fromDate)}'`,
  });
  return rows.map(toQboInvoiceSnapshot);
}

export type QboPaymentSnapshot = {
  id: string;
  totalAmount: number;
  txnDate: string | null;
  /** Invoice ids this payment is applied to. */
  linkedInvoiceIds: string[];
  /** Dollars applied to each linked invoice, keyed by QuickBooks invoice id. */
  appliedAmountByInvoiceId: Record<string, number>;
};

function toQboPaymentSnapshot(payment: any): QboPaymentSnapshot {
  const appliedAmountByInvoiceId: Record<string, number> = {};
  for (const line of payment?.Line ?? []) {
    const amount = Number(line?.Amount ?? 0);
    for (const transaction of line?.LinkedTxn ?? []) {
      if (String(transaction?.TxnType ?? "") !== "Invoice") continue;
      const invoiceId = String(transaction?.TxnId ?? "").trim();
      if (!invoiceId) continue;
      appliedAmountByInvoiceId[invoiceId] = round2((appliedAmountByInvoiceId[invoiceId] ?? 0) + amount);
    }
  }
  return {
    id: String(payment.Id),
    totalAmount: Number(payment.TotalAmt ?? 0),
    txnDate: String(payment.TxnDate ?? "").trim() || null,
    linkedInvoiceIds: [
      ...new Set(
        (payment?.Line ?? []).flatMap((line: any) =>
          (line?.LinkedTxn ?? [])
            .filter((txn: any) => String(txn?.TxnType ?? "") === "Invoice")
            .map((txn: any) => String(txn?.TxnId ?? "").trim())
            .filter(Boolean),
        ),
      ),
    ] as string[],
    appliedAmountByInvoiceId,
  };
}

/** Every QBO payment with a transaction date on/after `fromDate` (YYYY-MM-DD). */
export async function listQboPaymentsSince(
  params: QboRequestBase & { fromDate: string },
): Promise<QboPaymentSnapshot[]> {
  const rows = await queryQboAll({
    ...params,
    entity: "Payment",
    where: `TxnDate >= '${escapeQboQueryValue(params.fromDate)}'`,
  });
  return rows.map(toQboPaymentSnapshot);
}

/**
 * Read one QBO payment by its QBO Id. Returns null when QBO has no such payment.
 *
 * This is the confirming read for the payment push: a 2xx from the create call
 * is not proof the payment landed, nor that it applied to the invoice we asked
 * for, so callers compare TotalAmt and the linked invoice against what was sent.
 */
export async function findQboPaymentById(
  params: QboRequestBase & { qboPaymentId: string },
): Promise<QboPaymentSnapshot | null> {
  const qboPaymentId = String(params.qboPaymentId ?? "").trim();
  if (!qboPaymentId) return null;
  const found = await qboFetch({
    accessToken: params.accessToken,
    realmId: params.realmId,
    baseUrl: params.baseUrl,
    path: "query",
    method: "GET",
    query: `select * from Payment where Id = '${escapeQboQueryValue(qboPaymentId)}'`,
  });
  const payment = found?.QueryResponse?.Payment?.[0];
  if (!payment?.Id) return null;
  return toQboPaymentSnapshot(payment);
}

export async function voidQboInvoice(
  params: QboRequestBase & { qboInvoiceId: string; syncToken: string; requestId?: string | null },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, qboInvoiceId, syncToken } = params;

  // The body is exactly {Id, SyncToken} and must stay that way. It is also the
  // safety property of this call: with no Line, an unrecognized operation makes
  // QBO validate the request as a full update, which fails with 400 and cannot
  // mutate anything. Adding Line to satisfy that validator was tried and is
  // WRONG — a full update rewrites the invoice, clearing every field omitted
  // (DocNumber, TxnDate, PrivateNote), without ever voiding it.
  const body = { Id: qboInvoiceId, SyncToken: syncToken };
  const post = (name: "operation" | "operate") =>
    qboFetch({
      accessToken, realmId, baseUrl, path: "invoice", method: "POST",
      requestId: String(params.requestId ?? "").trim() || undefined,
      operation: { name, value: "void" }, body,
    });

  // `operation=void` is what the Intuit entity docs and node-quickbooks use.
  // `operate=void` appears in other Intuit examples; production rejected it with
  // "Required parameter Line is missing", i.e. QBO ignored it and fell through to
  // full-update validation. Try the documented spelling, keep the other as a
  // fallback, and let any unrelated fault surface immediately.
  let voided: any;
  try {
    voided = await post("operation");
  } catch (error) {
    if (!isMissingRequiredLineFault(error)) throw error;
    voided = await post("operate");
  }

  const inv = voided?.Invoice;
  if (!inv?.Id) throw new QboApiError(0, "QBO invoice void returned no Id");
  // A 2xx is NOT proof of a void — callers must confirm by re-reading.
  return { id: String(inv.Id), syncToken: String(inv.SyncToken ?? syncToken) };
}

/**
 * QBO ignored the operation selector and validated the request as a full update.
 * Surfaces as "Required parameter Line is missing in the request".
 */
function isMissingRequiredLineFault(error: unknown): boolean {
  if (!(error instanceof QboApiError)) return false;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("required") && message.includes("line");
}

export async function createQboPayment(
  params: QboRequestBase & { payment: QboPaymentInput; requestId?: string | null },
): Promise<QboSyncedEntity> {
  const { accessToken, realmId, baseUrl, payment } = params;
  const created = await qboFetch({
    accessToken,
    realmId,
    baseUrl,
    path: "payment",
    method: "POST",
    requestId: String(params.requestId ?? "").trim() || undefined,
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
