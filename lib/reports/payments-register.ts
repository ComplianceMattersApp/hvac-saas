import { formatBusinessDateUS, laDateToUtcMidnightIso } from "@/lib/utils/schedule-la";
import { preferredInvoiceReference, preferredJobReference } from "@/lib/utils/display-references";

export const PAYMENTS_REGISTER_PAGE_LIMIT = 250;

export const PAYMENTS_REGISTER_STATUS_OPTIONS = [
  { value: "recorded", label: "Recorded" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "reversed", label: "Reversed" },
] as const;

export const PAYMENTS_REGISTER_METHOD_OPTIONS = [
  { value: "online_stripe", label: "Online / Stripe" },
  { value: "card", label: "Card" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "digital", label: "Digital" },
  { value: "other", label: "Other" },
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type PaymentsRegisterStatus = (typeof PAYMENTS_REGISTER_STATUS_OPTIONS)[number]["value"];
export type PaymentsRegisterMethod = (typeof PAYMENTS_REGISTER_METHOD_OPTIONS)[number]["value"];

export type PaymentsRegisterFilters = {
  status: "" | PaymentsRegisterStatus;
  method: "" | PaymentsRegisterMethod;
  fromDate: string;
  toDate: string;
  query: string;
};

type InternalInvoicePaymentRow = {
  id: string;
  invoice_id: string;
  job_id: string;
  payment_status: string;
  payment_method: string;
  amount_cents: number;
  paid_at: string;
  received_reference: string | null;
  notes: string | null;
  created_at: string;
};

type InternalInvoiceRow = {
  id: string;
  invoice_display_number: string | null;
  invoice_number: string | null;
  customer_id: string | null;
};

type JobRow = {
  id: string;
  job_display_number: string | null;
  title: string | null;
};

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type PaymentsRegisterRow = {
  paymentId: string;
  paidAtDisplay: string;
  status: PaymentsRegisterStatus;
  statusLabel: string;
  method: PaymentsRegisterMethod;
  methodLabel: string;
  amountCents: number;
  amountDisplay: string;
  customerName: string;
  customerHref: string | null;
  invoiceNumber: string;
  invoiceHref: string | null;
  jobReference: string;
  jobTitle: string;
  jobHref: string | null;
  reference: string;
  notes: string;
};

export type PaymentsRegisterResult = {
  rows: PaymentsRegisterRow[];
  totalCount: number;
  truncated: boolean;
};

export type CustomerPaymentHistoryRow = {
  paymentId: string;
  paidAtDisplay: string;
  status: PaymentsRegisterStatus;
  statusLabel: string;
  method: PaymentsRegisterMethod;
  methodLabel: string;
  amountCents: number;
  amountDisplay: string;
  invoiceNumber: string;
  invoiceHref: string | null;
  jobReference: string;
  jobTitle: string;
  jobHref: string | null;
  reference: string;
  notes: string;
};

export type PaymentsRegisterMethodMixRow = {
  method: PaymentsRegisterMethod;
  methodLabel: string;
  count: number;
  amountCents: number;
  amountDisplay: string;
};

export type PaymentsRegisterViewSnapshot = {
  failedAttemptsCount: number;
  recentRecordedCount: number;
  recentRecordedAmountCents: number;
  recentRecordedAmountDisplay: string;
  methodMix: PaymentsRegisterMethodMixRow[];
};

export type PaymentsRegisterHeadlineSnapshot = {
  receivedThisMonthCents: number;
  receivedThisMonthDisplay: string;
  receivedLast30DaysCents: number;
  receivedLast30DaysDisplay: string;
};

function readParam(source: FilterSource, key: string) {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeYmd(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function addOneDay(dateYmd: string) {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function shiftYmdByDays(dateYmd: string, days: number) {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return shifted.toISOString().slice(0, 10);
}

function monthStartYmd(dateYmd: string) {
  return `${dateYmd.slice(0, 7)}-01`;
}

function nextMonthStartYmd(dateYmd: string) {
  const [year, month] = dateYmd.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  return shifted.toISOString().slice(0, 10);
}

function dateYmdInLa(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function normalizeStatus(value: unknown): PaymentsRegisterStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "failed") return "failed";
  if (normalized === "pending") return "pending";
  if (normalized === "reversed") return "reversed";
  return "recorded";
}

export function normalizeMethodForRegister(value: unknown): PaymentsRegisterMethod {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "card_stripe_online") return "online_stripe";
  if (normalized === "card_off_platform") return "card";
  if (normalized === "check") return "check";
  if (normalized === "cash") return "cash";
  if (normalized === "bank_transfer") return "digital";
  // Keep ACH hidden from register taxonomy in V1 by folding it into Other.
  return "other";
}

function formatStatusLabel(value: PaymentsRegisterStatus) {
  if (value === "failed") return "Failed";
  if (value === "pending") return "Pending";
  if (value === "reversed") return "Reversed";
  return "Recorded";
}

function formatMethodLabel(value: PaymentsRegisterMethod) {
  if (value === "online_stripe") return "Online / Stripe";
  if (value === "card") return "Card";
  if (value === "check") return "Check";
  if (value === "cash") return "Cash";
  if (value === "digital") return "Digital";
  return "Other";
}

function formatCurrencyCents(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(value ?? 0) || 0) / 100);
}

function formatTimestampDisplay(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";

  const ymdMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (ymdMatch?.[1]) return formatBusinessDateUS(ymdMatch[1]);
  return formatBusinessDateUS(normalized);
}

function buildCustomerName(row: CustomerRow | null | undefined) {
  const fullName = String(row?.full_name ?? "").trim();
  if (fullName) return fullName;
  const first = String(row?.first_name ?? "").trim();
  const last = String(row?.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function shortReference(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 8) : "-";
}

export function parsePaymentsRegisterFilters(source: FilterSource): PaymentsRegisterFilters {
  const rawStatus = String(readParam(source, "status") ?? "").trim().toLowerCase();
  const rawMethod = String(readParam(source, "method") ?? "").trim().toLowerCase();

  return {
    status: PAYMENTS_REGISTER_STATUS_OPTIONS.some((option) => option.value === rawStatus)
      ? (rawStatus as PaymentsRegisterStatus)
      : "",
    method: PAYMENTS_REGISTER_METHOD_OPTIONS.some((option) => option.value === rawMethod)
      ? (rawMethod as PaymentsRegisterMethod)
      : "",
    fromDate: normalizeYmd(readParam(source, "from")),
    toDate: normalizeYmd(readParam(source, "to")),
    query: String(readParam(source, "q") ?? "").trim(),
  };
}

export function buildPaymentsRegisterSearchParams(filters: PaymentsRegisterFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.method) params.set("method", filters.method);
  if (filters.fromDate) params.set("from", filters.fromDate);
  if (filters.toDate) params.set("to", filters.toDate);
  if (filters.query) params.set("q", filters.query);
  return params;
}

function sumAmountCents(rows: Array<{ amount_cents: number | null | undefined }>) {
  return rows.reduce((sum, row) => sum + (Number(row.amount_cents ?? 0) || 0), 0);
}

export function buildPaymentsRegisterViewSnapshot(params: {
  rows: PaymentsRegisterRow[];
  recentLimit?: number;
}): PaymentsRegisterViewSnapshot {
  const recentLimit = params.recentLimit ?? 10;

  const recordedRows = params.rows.filter((row) => row.status === "recorded");
  const failedRows = params.rows.filter((row) => row.status === "failed");
  const recentRecordedRows = recordedRows.slice(0, Math.max(0, recentLimit));

  const methodMix = PAYMENTS_REGISTER_METHOD_OPTIONS.map((option) => {
    const methodRows = recordedRows.filter((row) => row.method === option.value);
    const amountCents = methodRows.reduce((sum, row) => sum + row.amountCents, 0);
    return {
      method: option.value,
      methodLabel: option.label,
      count: methodRows.length,
      amountCents,
      amountDisplay: formatCurrencyCents(amountCents),
    };
  });

  const recentRecordedAmountCents = recentRecordedRows.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    failedAttemptsCount: failedRows.length,
    recentRecordedCount: recentRecordedRows.length,
    recentRecordedAmountCents,
    recentRecordedAmountDisplay: formatCurrencyCents(recentRecordedAmountCents),
    methodMix,
  };
}

export async function readPaymentsRegisterHeadlineSnapshot(params: {
  supabase: any;
  accountOwnerUserId: string;
  now?: Date;
}): Promise<PaymentsRegisterHeadlineSnapshot> {
  const nowYmd = dateYmdInLa(params.now);
  const monthStart = monthStartYmd(nowYmd);
  const nextMonthStart = nextMonthStartYmd(nowYmd);
  const last30DaysStart = shiftYmdByDays(nowYmd, -29);
  const tomorrow = addOneDay(nowYmd);

  const [monthResult, last30Result] = await Promise.all([
    params.supabase
      .from("internal_invoice_payments")
      .select("amount_cents")
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .eq("payment_status", "recorded")
      .gte("paid_at", laDateToUtcMidnightIso(monthStart))
      .lt("paid_at", laDateToUtcMidnightIso(nextMonthStart)),
    params.supabase
      .from("internal_invoice_payments")
      .select("amount_cents")
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .eq("payment_status", "recorded")
      .gte("paid_at", laDateToUtcMidnightIso(last30DaysStart))
      .lt("paid_at", laDateToUtcMidnightIso(tomorrow)),
  ]);

  if (monthResult.error) throw monthResult.error;
  if (last30Result.error) throw last30Result.error;

  const receivedThisMonthCents = sumAmountCents((monthResult.data ?? []) as Array<{ amount_cents: number | null }>);
  const receivedLast30DaysCents = sumAmountCents((last30Result.data ?? []) as Array<{ amount_cents: number | null }>);

  return {
    receivedThisMonthCents,
    receivedThisMonthDisplay: formatCurrencyCents(receivedThisMonthCents),
    receivedLast30DaysCents,
    receivedLast30DaysDisplay: formatCurrencyCents(receivedLast30DaysCents),
  };
}

function matchesQuery(row: PaymentsRegisterRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return [
    row.invoiceNumber,
    row.customerName,
    row.jobReference,
    row.jobTitle,
    row.reference,
    row.notes,
    row.statusLabel,
    row.methodLabel,
  ].some((value) => String(value ?? "").toLowerCase().includes(q));
}

export async function listPaymentsRegisterRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: PaymentsRegisterFilters;
  limit?: number;
}): Promise<PaymentsRegisterResult> {
  const limit = params.limit ?? PAYMENTS_REGISTER_PAGE_LIMIT;

  let query = params.supabase
    .from("internal_invoice_payments")
    .select("id, invoice_id, job_id, payment_status, payment_method, amount_cents, paid_at, received_reference, notes, created_at")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (params.filters.status) {
    query = query.eq("payment_status", params.filters.status);
  }
  if (params.filters.fromDate) {
    query = query.gte("paid_at", laDateToUtcMidnightIso(params.filters.fromDate));
  }
  if (params.filters.toDate) {
    query = query.lt("paid_at", laDateToUtcMidnightIso(addOneDay(params.filters.toDate)));
  }

  const { data, error } = await query.limit(limit + 1);
  if (error) throw error;

  const rawRows = ((data ?? []) as InternalInvoicePaymentRow[]);
  const truncated = rawRows.length > limit;
  const payments = rawRows.slice(0, limit);
  if (!payments.length) return { rows: [], totalCount: 0, truncated: false };

  const invoiceIds = Array.from(new Set(payments.map((row) => String(row.invoice_id ?? "").trim()).filter(Boolean)));
  const jobIds = Array.from(new Set(payments.map((row) => String(row.job_id ?? "").trim()).filter(Boolean)));

  const [invoicesResult, jobsResult] = await Promise.all([
    params.supabase
      .from("internal_invoices")
      .select("id, invoice_display_number, invoice_number, customer_id")
      .in("id", invoiceIds.length ? invoiceIds : ["00000000-0000-0000-0000-000000000000"]),
    params.supabase
      .from("jobs")
      .select("id, job_display_number, title")
      .in("id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  if (invoicesResult.error) throw invoicesResult.error;
  if (jobsResult.error) throw jobsResult.error;

  const invoices = (invoicesResult.data ?? []) as InternalInvoiceRow[];
  const customerIds = Array.from(new Set(invoices.map((row) => String(row.customer_id ?? "").trim()).filter(Boolean)));

  const customersResult = await params.supabase
    .from("customers")
    .select("id, full_name, first_name, last_name")
    .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);

  if (customersResult.error) throw customersResult.error;

  const invoiceById = new Map<string, InternalInvoiceRow>();
  for (const row of invoices) {
    const id = String(row.id ?? "").trim();
    if (id) invoiceById.set(id, row);
  }

  const jobById = new Map<string, JobRow>();
  for (const row of (jobsResult.data ?? []) as JobRow[]) {
    const id = String(row.id ?? "").trim();
    if (id) jobById.set(id, row);
  }

  const customerById = new Map<string, CustomerRow>();
  for (const row of (customersResult.data ?? []) as CustomerRow[]) {
    const id = String(row.id ?? "").trim();
    if (id) customerById.set(id, row);
  }

  const rows = payments
    .map((payment) => {
      const paymentId = String(payment.id ?? "").trim();
      const invoiceId = String(payment.invoice_id ?? "").trim();
      const jobId = String(payment.job_id ?? "").trim();
      const invoice = invoiceById.get(invoiceId) ?? null;
      const customerId = String(invoice?.customer_id ?? "").trim();
      const customer = customerById.get(customerId) ?? null;
      const method = normalizeMethodForRegister(payment.payment_method);
      const status = normalizeStatus(payment.payment_status);

      const row: PaymentsRegisterRow = {
        paymentId,
        paidAtDisplay: formatTimestampDisplay(payment.paid_at),
        status,
        statusLabel: formatStatusLabel(status),
        method,
        methodLabel: formatMethodLabel(method),
        amountCents: Number(payment.amount_cents ?? 0) || 0,
        amountDisplay: formatCurrencyCents(payment.amount_cents),
        customerName: buildCustomerName(customer) || "-",
        customerHref: customerId ? `/customers/${customerId}` : null,
        invoiceNumber: preferredInvoiceReference({
          invoiceDisplayNumber: invoice?.invoice_display_number,
          invoiceNumber: invoice?.invoice_number,
          invoiceId,
        }),
        invoiceHref: jobId ? `/jobs/${jobId}/invoice` : null,
        jobReference: preferredJobReference({
          jobDisplayNumber: jobById.get(jobId)?.job_display_number,
          jobId,
        }),
        jobTitle: String(jobById.get(jobId)?.title ?? "").trim() || "-",
        jobHref: jobId ? `/jobs/${jobId}` : null,
        reference: String(payment.received_reference ?? "").trim() || "-",
        notes: String(payment.notes ?? "").trim() || "-",
      };

      return row;
    })
    .filter((row) => !params.filters.method || row.method === params.filters.method)
    .filter((row) => matchesQuery(row, params.filters.query));

  return {
    rows,
    totalCount: rows.length,
    truncated,
  };
}

export async function listCustomerPaymentHistory(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
  limit?: number;
}): Promise<CustomerPaymentHistoryRow[]> {
  const limit = params.limit ?? 50;

  // First, find all invoices for this customer
  const { data: customerInvoices, error: invoiceError } = await params.supabase
    .from("internal_invoices")
    .select("id, invoice_display_number, invoice_number, customer_id")
    .eq("customer_id", params.customerId);

  if (invoiceError) throw invoiceError;

  const invoiceIds = (customerInvoices ?? [])
    .map((row: InternalInvoiceRow) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (!invoiceIds.length) {
    return [];
  }

  // Query payments for these invoices, scoped to account
  const { data: paymentRows, error: paymentError } = await params.supabase
    .from("internal_invoice_payments")
    .select("id, invoice_id, job_id, payment_status, payment_method, amount_cents, paid_at, received_reference, notes, created_at")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .in("invoice_id", invoiceIds)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (paymentError) throw paymentError;

  const payments = (paymentRows ?? []) as InternalInvoicePaymentRow[];
  if (!payments.length) return [];

  // Fetch related invoices and jobs
  const jobIds = Array.from(new Set(payments.map((row) => String(row.job_id ?? "").trim()).filter(Boolean)));
  const invoicesToFetch = Array.from(new Set(payments.map((row) => String(row.invoice_id ?? "").trim()).filter(Boolean)));

  const [jobsResult, invoicesResult] = await Promise.all([
    params.supabase
      .from("jobs")
      .select("id, job_display_number, title")
      .in("id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"]),
    params.supabase
      .from("internal_invoices")
      .select("id, invoice_display_number, invoice_number")
      .in("id", invoicesToFetch.length ? invoicesToFetch : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  if (jobsResult.error) throw jobsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;

  const jobById = new Map<string, JobRow>();
  for (const row of (jobsResult.data ?? []) as JobRow[]) {
    const id = String(row.id ?? "").trim();
    if (id) jobById.set(id, row);
  }

  const invoiceById = new Map<string, InternalInvoiceRow>();
  for (const row of (invoicesResult.data ?? []) as InternalInvoiceRow[]) {
    const id = String(row.id ?? "").trim();
    if (id) invoiceById.set(id, row);
  }

  // Build history rows
  const rows = payments.map((payment) => {
    const paymentId = String(payment.id ?? "").trim();
    const invoiceId = String(payment.invoice_id ?? "").trim();
    const jobId = String(payment.job_id ?? "").trim();
    const method = normalizeMethodForRegister(payment.payment_method);
    const status = normalizeStatus(payment.payment_status);
    const invoice = invoiceById.get(invoiceId);

    const row: CustomerPaymentHistoryRow = {
      paymentId,
      paidAtDisplay: formatTimestampDisplay(payment.paid_at),
      status,
      statusLabel: formatStatusLabel(status),
      method,
      methodLabel: formatMethodLabel(method),
      amountCents: Number(payment.amount_cents ?? 0) || 0,
      amountDisplay: formatCurrencyCents(payment.amount_cents),
      invoiceNumber: preferredInvoiceReference({
        invoiceDisplayNumber: invoice?.invoice_display_number,
        invoiceNumber: invoice?.invoice_number,
        invoiceId,
      }),
      invoiceHref: jobId ? `/jobs/${jobId}/invoice` : null,
      jobReference: preferredJobReference({
        jobDisplayNumber: jobById.get(jobId)?.job_display_number,
        jobId,
      }),
      jobTitle: String(jobById.get(jobId)?.title ?? "").trim() || "-",
      jobHref: jobId ? `/jobs/${jobId}` : null,
      reference: String(payment.received_reference ?? "").trim() || "-",
      notes: String(payment.notes ?? "").trim() || "-",
    };

    return row;
  });

  return rows;
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPaymentsRegisterCsv(rows: PaymentsRegisterRow[]) {
  const header = [
    "Paid Date",
    "Amount",
    "Status",
    "Method",
    "Customer",
    "Invoice",
    "Job Reference",
    "Job Title",
    "Reference",
    "Notes",
  ];

  const lines = rows.map((row) => [
    row.paidAtDisplay,
    row.amountDisplay,
    row.statusLabel,
    row.methodLabel,
    row.customerName,
    row.invoiceNumber,
    row.jobReference,
    row.jobTitle,
    row.reference,
    row.notes,
  ].map((value) => csvEscape(String(value ?? ""))).join(","));

  return [header.map(csvEscape).join(","), ...lines].join("\r\n");
}
