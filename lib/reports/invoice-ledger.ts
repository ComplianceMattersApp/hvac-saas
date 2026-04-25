import { formatBusinessDateUS, laDateToUtcMidnightIso } from "@/lib/utils/schedule-la";

export const INVOICE_LEDGER_PAGE_LIMIT = 250;
export const INVOICE_LEDGER_EXPORT_LIMIT = 5000;

export const INVOICE_LEDGER_DATE_FIELD_OPTIONS = [
  { value: "created", label: "Created date" },
  { value: "invoice", label: "Invoice date" },
  { value: "issued", label: "Issued date" },
] as const;

export const INVOICE_LEDGER_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "void", label: "Void" },
] as const;

export const INVOICE_LEDGER_SOURCE_TYPE_OPTIONS = [
  { value: "job", label: "Job" },
  { value: "manual", label: "Manual" },
  { value: "estimate", label: "Estimate" },
] as const;

export const INVOICE_LEDGER_COMMUNICATION_STATE_OPTIONS = [
  { value: "none", label: "No communication" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "resent", label: "Resent" },
  { value: "failed", label: "Failed" },
] as const;

export const INVOICE_LEDGER_SORT_OPTIONS = [
  { value: "created_desc", label: "Created newest first" },
  { value: "invoice_date_desc", label: "Invoice date newest first" },
  { value: "issued_desc", label: "Issued newest first" },
  { value: "total_desc", label: "Total highest first" },
  { value: "total_asc", label: "Total lowest first" },
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type InvoiceLedgerDateField = (typeof INVOICE_LEDGER_DATE_FIELD_OPTIONS)[number]["value"];
export type InvoiceLedgerSort = (typeof INVOICE_LEDGER_SORT_OPTIONS)[number]["value"];

export type InvoiceLedgerFilters = {
  status: string;
  dateField: InvoiceLedgerDateField;
  fromDate: string;
  toDate: string;
  customerId: string;
  contractorId: string;
  sourceType: string;
  communicationState: string;
  sort: InvoiceLedgerSort;
};

export type InvoiceLedgerFilterOptions = {
  customers: Array<{ id: string; name: string }>;
  contractors: Array<{ id: string; name: string }>;
};

export type InvoiceLedgerRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatusLabel: string;
  sourceTypeLabel: string;
  customerDisplay: string;
  locationDisplay: string;
  jobReference: string;
  jobHref: string | null;
  serviceCaseReference: string;
  contractorDisplay: string;
  invoiceDateDisplay: string;
  issuedDateDisplay: string;
  lastCommunicationDateDisplay: string;
  recipientDisplay: string;
  communicationStateLabel: string;
  subtotalDisplay: string;
  totalDisplay: string;
  voidedDateDisplay: string;
  amountPaidDisplay: string;
  balanceDueDisplay: string;
  paymentStatusLabel: string;
  lastPaymentDateDisplay: string;
  paymentCountDisplay: string;
};

export type InvoiceLedgerResult = {
  rows: InvoiceLedgerRow[];
  totalCount: number;
  truncated: boolean;
};

type InvoiceRow = {
  id: string;
  job_id: string;
  customer_id: string | null;
  location_id: string | null;
  service_case_id: string | null;
  invoice_number: string;
  status: string;
  invoice_date: string;
  issued_at: string | null;
  voided_at: string | null;
  source_type: string;
  subtotal_cents: number;
  total_cents: number;
  billing_name: string | null;
  billing_email: string | null;
  billing_address_line1: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  created_at: string;
};

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type LocationRow = {
  id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  contractor_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  job_address: string | null;
  city: string | null;
  contractors?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type InvoiceDeliverySnapshot = {
  invoiceId: string;
  recipientEmail: string | null;
  status: string;
  attemptKind: string;
  sentAt: string | null;
  createdAt: string | null;
};

function readParam(source: FilterSource, key: string) {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeChoice<T extends readonly { value: string }[]>(
  value: string | undefined,
  options: T,
  fallback: T[number]["value"],
) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return options.some((option) => option.value === normalized) ? normalized : fallback;
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

function formatCurrencyCents(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(value ?? 0) || 0) / 100);
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatTimestampDisplay(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";

  const ymdMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (ymdMatch?.[1]) {
    return formatBusinessDateUS(ymdMatch[1]);
  }

  return formatBusinessDateUS(normalized);
}

function shortReference(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  return normalized.slice(0, 8);
}

function buildCustomerName(row: CustomerRow | null | undefined) {
  const fullName = String(row?.full_name ?? "").trim();
  if (fullName) return fullName;

  const first = String(row?.first_name ?? "").trim();
  const last = String(row?.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function buildLocationDisplay(row: LocationRow | null | undefined) {
  const address = String(row?.address_line1 ?? "").trim();
  const city = String(row?.city ?? "").trim();
  const state = String(row?.state ?? "").trim();
  const zip = String(row?.zip ?? "").trim();
  return [address, [city, state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ").trim() || null;
}

function extractContractorName(job: JobRow | null | undefined) {
  const related = Array.isArray(job?.contractors)
    ? (job?.contractors.find((row) => row) ?? null)
    : (job?.contractors ?? null);
  return String(related?.name ?? "").trim() || null;
}

function formatInvoiceStatusLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "issued") return "Issued";
  if (normalized === "void") return "Void";
  return "Draft";
}

function formatSourceTypeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "manual") return "Manual";
  if (normalized === "estimate") return "Estimate";
  return "Job";
}

function normalizeCommunicationState(delivery: InvoiceDeliverySnapshot | null) {
  if (!delivery) return "none";

  const status = String(delivery.status ?? "").trim().toLowerCase();
  const attemptKind = String(delivery.attemptKind ?? "").trim().toLowerCase();

  if (status === "failed") return "failed";
  if (status === "queued") return "queued";
  if (status === "sent" && attemptKind === "resent") return "resent";
  if (status === "sent") return "sent";
  return "queued";
}

function formatCommunicationStateLabel(delivery: InvoiceDeliverySnapshot | null) {
  const state = normalizeCommunicationState(delivery);
  if (state === "resent") return "Resent";
  if (state === "sent") return "Sent";
  if (state === "queued") return "Queued";
  if (state === "failed") return "Failed";
  return "None";
}

function deliveryMoment(delivery: InvoiceDeliverySnapshot | null) {
  return String(delivery?.sentAt ?? delivery?.createdAt ?? "").trim() || null;
}

async function resolveContractorJobIds(params: {
  supabase: any;
  contractorId: string;
}): Promise<string[] | null> {
  const contractorId = String(params.contractorId ?? "").trim();
  if (!contractorId) return null;

  const { data, error } = await params.supabase
    .from("jobs")
    .select("id")
    .eq("contractor_id", contractorId)
    .is("deleted_at", null);

  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => String(row?.id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function applyInvoiceLedgerFilters(query: any, filters: InvoiceLedgerFilters, contractorJobIds: string[] | null) {
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters.sourceType) {
    query = query.eq("source_type", filters.sourceType);
  }

  if (contractorJobIds) {
    query = query.in(
      "job_id",
      contractorJobIds.length ? contractorJobIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  if (filters.dateField === "invoice") {
    if (filters.fromDate) query = query.gte("invoice_date", filters.fromDate);
    if (filters.toDate) query = query.lte("invoice_date", filters.toDate);
  } else {
    const column = filters.dateField === "issued" ? "issued_at" : "created_at";
    if (filters.fromDate) query = query.gte(column, laDateToUtcMidnightIso(filters.fromDate));
    if (filters.toDate) query = query.lt(column, laDateToUtcMidnightIso(addOneDay(filters.toDate)));
  }

  if (filters.sort === "invoice_date_desc") {
    query = query.order("invoice_date", { ascending: false }).order("created_at", { ascending: false });
  } else if (filters.sort === "issued_desc") {
    query = query.order("issued_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  } else if (filters.sort === "total_desc") {
    query = query.order("total_cents", { ascending: false }).order("created_at", { ascending: false });
  } else if (filters.sort === "total_asc") {
    query = query.order("total_cents", { ascending: true }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  return query;
}

export function parseInvoiceLedgerFilters(source: FilterSource): InvoiceLedgerFilters {
  return {
    status: normalizeChoice(
      readParam(source, "status"),
      [{ value: "" }, ...INVOICE_LEDGER_STATUS_OPTIONS],
      "",
    ),
    dateField: normalizeChoice(
      readParam(source, "date_field"),
      INVOICE_LEDGER_DATE_FIELD_OPTIONS,
      "created",
    ) as InvoiceLedgerDateField,
    fromDate: normalizeYmd(readParam(source, "from")),
    toDate: normalizeYmd(readParam(source, "to")),
    customerId: String(readParam(source, "customer") ?? "").trim(),
    contractorId: String(readParam(source, "contractor") ?? "").trim(),
    sourceType: normalizeChoice(
      readParam(source, "source_type"),
      [{ value: "" }, ...INVOICE_LEDGER_SOURCE_TYPE_OPTIONS],
      "",
    ),
    communicationState: normalizeChoice(
      readParam(source, "communication_state"),
      [{ value: "" }, ...INVOICE_LEDGER_COMMUNICATION_STATE_OPTIONS],
      "",
    ),
    sort: normalizeChoice(
      readParam(source, "sort"),
      INVOICE_LEDGER_SORT_OPTIONS,
      "created_desc",
    ) as InvoiceLedgerSort,
  };
}

export function buildInvoiceLedgerSearchParams(filters: InvoiceLedgerFilters) {
  const searchParams = new URLSearchParams();

  if (filters.status) searchParams.set("status", filters.status);
  if (filters.dateField !== "created") searchParams.set("date_field", filters.dateField);
  if (filters.fromDate) searchParams.set("from", filters.fromDate);
  if (filters.toDate) searchParams.set("to", filters.toDate);
  if (filters.customerId) searchParams.set("customer", filters.customerId);
  if (filters.contractorId) searchParams.set("contractor", filters.contractorId);
  if (filters.sourceType) searchParams.set("source_type", filters.sourceType);
  if (filters.communicationState) searchParams.set("communication_state", filters.communicationState);
  if (filters.sort !== "created_desc") searchParams.set("sort", filters.sort);

  return searchParams;
}

export async function getInvoiceLedgerFilterOptions(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<InvoiceLedgerFilterOptions> {
  const [customersResult, contractorsResult] = await Promise.all([
    params.supabase
      .from("customers")
      .select("id, full_name, first_name, last_name")
      .eq("owner_user_id", params.accountOwnerUserId)
      .order("full_name", { ascending: true })
      .limit(500),
    params.supabase
      .from("contractors")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (customersResult.error) throw customersResult.error;
  if (contractorsResult.error) throw contractorsResult.error;

  return {
    customers: (customersResult.data ?? [])
      .map((row: any) => ({
        id: String(row?.id ?? "").trim(),
        name: buildCustomerName(row) ?? "",
      }))
      .filter((row: { id: string; name: string }) => row.id && row.name),
    contractors: (contractorsResult.data ?? [])
      .map((row: any) => ({
        id: String(row?.id ?? "").trim(),
        name: String(row?.name ?? "").trim(),
      }))
      .filter((row: { id: string; name: string }) => row.id && row.name),
  };
}

type InvoicePaymentSummary = {
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
  lastPaymentDate: string | null;
  paymentCount: number;
};

type PaymentRow = {
  invoice_id: string;
  amount_cents: number;
  payment_status: string;
  paid_at: string;
};

async function buildInvoicePaymentSummaryMap(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceIds: string[];
  invoiceTotalsByCents: Map<string, number>;
}): Promise<Map<string, InvoicePaymentSummary>> {
  const summaryMap = new Map<string, InvoicePaymentSummary>();

  if (params.invoiceIds.length === 0) {
    return summaryMap;
  }

  const { data, error } = await params.supabase
    .from("internal_invoice_payments")
    .select("invoice_id, amount_cents, payment_status, paid_at")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .in("invoice_id", params.invoiceIds);

  if (error) {
    throw new Error(
      `Failed to fetch invoice payment summaries: ${error.message ?? "unknown error"}`
    );
  }

  const paymentsByInvoiceId = new Map<string, PaymentRow[]>();
  for (const row of data ?? []) {
    const invoiceId = String(row?.invoice_id ?? "").trim();
    if (!invoiceId) continue;
    if (!paymentsByInvoiceId.has(invoiceId)) {
      paymentsByInvoiceId.set(invoiceId, []);
    }
    paymentsByInvoiceId.get(invoiceId)!.push(row as PaymentRow);
  }

  for (const invoiceId of params.invoiceIds) {
    const invoiceTotalCents = params.invoiceTotalsByCents.get(invoiceId) ?? 0;
    const payments = paymentsByInvoiceId.get(invoiceId) ?? [];

    let amountPaidCents = 0;
    let lastPaymentDate: string | null = null;
    let recordedPaymentCount = 0;

    for (const payment of payments) {
      const status = String(payment.payment_status ?? "").trim().toLowerCase();
      if (status === "recorded") {
        const amountCents = Number(payment.amount_cents ?? 0) || 0;
        amountPaidCents += amountCents;
        recordedPaymentCount += 1;

        const paidAt = String(payment.paid_at ?? "").trim();
        if (paidAt && (!lastPaymentDate || paidAt > lastPaymentDate)) {
          lastPaymentDate = paidAt;
        }
      }
    }

    const balanceDueCents = Math.max(0, invoiceTotalCents - amountPaidCents);
    const paymentStatus =
      amountPaidCents <= 0
        ? "unpaid"
        : amountPaidCents >= invoiceTotalCents
          ? "paid"
          : "partial";

    summaryMap.set(invoiceId, {
      amountPaidCents,
      balanceDueCents,
      paymentStatus,
      lastPaymentDate,
      paymentCount: recordedPaymentCount,
    });
  }

  return summaryMap;
}

export async function listInvoiceLedgerRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: InvoiceLedgerFilters;
  limit?: number;
}): Promise<InvoiceLedgerResult> {
  const limit = params.limit ?? INVOICE_LEDGER_PAGE_LIMIT;
  const contractorJobIds = await resolveContractorJobIds({
    supabase: params.supabase,
    contractorId: params.filters.contractorId,
  });

  if (contractorJobIds && contractorJobIds.length === 0) {
    return { rows: [], totalCount: 0, truncated: false };
  }

  let query = params.supabase
    .from("internal_invoices")
    .select(
      "id, job_id, customer_id, location_id, service_case_id, invoice_number, status, invoice_date, issued_at, voided_at, source_type, subtotal_cents, total_cents, billing_name, billing_email, billing_address_line1, billing_city, billing_state, billing_zip, created_at"
    )
    .eq("account_owner_user_id", params.accountOwnerUserId);

  query = applyInvoiceLedgerFilters(query, params.filters, contractorJobIds);

  const { data, error } = await query.limit(INVOICE_LEDGER_EXPORT_LIMIT + 1);

  if (error) throw error;

  const rawInvoices = (data ?? []) as InvoiceRow[];
  const scanTruncated = rawInvoices.length > INVOICE_LEDGER_EXPORT_LIMIT;
  const invoices = rawInvoices.slice(0, INVOICE_LEDGER_EXPORT_LIMIT);

  if (!invoices.length) {
    return { rows: [], totalCount: 0, truncated: false };
  }

  const invoiceIds = invoices.map((invoice) => String(invoice.id ?? "").trim()).filter(Boolean);
  const jobIds = Array.from(new Set(invoices.map((invoice) => String(invoice.job_id ?? "").trim()).filter(Boolean)));
  const customerIds = Array.from(new Set(invoices.map((invoice) => String(invoice.customer_id ?? "").trim()).filter(Boolean)));
  const locationIds = Array.from(new Set(invoices.map((invoice) => String(invoice.location_id ?? "").trim()).filter(Boolean)));

  const invoiceTotalsByCents = new Map<string, number>();
  for (const invoice of invoices) {
    const id = String(invoice.id ?? "").trim();
    if (id) invoiceTotalsByCents.set(id, Number(invoice.total_cents ?? 0) || 0);
  }

  const [jobsResult, customersResult, locationsResult, deliveriesResult, paymentSummaryMap] = await Promise.all([
    params.supabase
      .from("jobs")
      .select("id, title, contractor_id, customer_first_name, customer_last_name, job_address, city, contractors(name)")
      .in("id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"]),
    params.supabase
      .from("customers")
      .select("id, full_name, first_name, last_name")
      .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]),
    params.supabase
      .from("locations")
      .select("id, address_line1, city, state, zip")
      .in("id", locationIds.length ? locationIds : ["00000000-0000-0000-0000-000000000000"]),
    params.supabase
      .from("notifications")
      .select("job_id, payload, status, sent_at, created_at")
      .eq("channel", "email")
      .eq("notification_type", "internal_invoice_email")
      .in("job_id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false }),
    buildInvoicePaymentSummaryMap({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
      invoiceIds,
      invoiceTotalsByCents,
    }),
  ]);

  if (jobsResult.error) throw jobsResult.error;
  if (customersResult.error) throw customersResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (deliveriesResult.error) throw deliveriesResult.error;

  const jobById = new Map<string, JobRow>();
  for (const row of jobsResult.data ?? []) {
    const id = String((row as any)?.id ?? "").trim();
    if (id) jobById.set(id, row as JobRow);
  }

  const customerById = new Map<string, CustomerRow>();
  for (const row of customersResult.data ?? []) {
    const id = String((row as any)?.id ?? "").trim();
    if (id) customerById.set(id, row as CustomerRow);
  }

  const locationById = new Map<string, LocationRow>();
  for (const row of locationsResult.data ?? []) {
    const id = String((row as any)?.id ?? "").trim();
    if (id) locationById.set(id, row as LocationRow);
  }

  const latestDeliveryByInvoiceId = new Map<string, InvoiceDeliverySnapshot>();
  for (const row of deliveriesResult.data ?? []) {
    const payload = ((row as any)?.payload ?? {}) as Record<string, unknown>;
    const invoiceId = String(payload.invoice_id ?? "").trim();
    if (!invoiceId || !invoiceIds.includes(invoiceId) || latestDeliveryByInvoiceId.has(invoiceId)) continue;

    latestDeliveryByInvoiceId.set(invoiceId, {
      invoiceId,
      recipientEmail: String(payload.recipient_email ?? "").trim().toLowerCase() || null,
      status: String((row as any)?.status ?? "").trim().toLowerCase(),
      attemptKind: String(payload.attempt_kind ?? "").trim().toLowerCase(),
      sentAt: String((row as any)?.sent_at ?? "").trim() || null,
      createdAt: String((row as any)?.created_at ?? "").trim() || null,
    });
  }

  const filteredInvoices = invoices.filter((invoice) => {
    if (!params.filters.communicationState) return true;
    const delivery = latestDeliveryByInvoiceId.get(String(invoice.id ?? "").trim()) ?? null;
    return normalizeCommunicationState(delivery) === params.filters.communicationState;
  });

  const rows = filteredInvoices.map((invoice) => {
    const invoiceId = String(invoice.id ?? "").trim();
    const jobId = String(invoice.job_id ?? "").trim();
    const customer = customerById.get(String(invoice.customer_id ?? "").trim()) ?? null;
    const location = locationById.get(String(invoice.location_id ?? "").trim()) ?? null;
    const job = jobById.get(jobId) ?? null;
    const delivery = latestDeliveryByInvoiceId.get(invoiceId) ?? null;
    const paymentSummary = paymentSummaryMap.get(invoiceId);

    const customerDisplay =
      buildCustomerName(customer) ||
      String(invoice.billing_name ?? "").trim() ||
      [String(job?.customer_first_name ?? "").trim(), String(job?.customer_last_name ?? "").trim()].filter(Boolean).join(" ") ||
      "-";

    const locationDisplay =
      buildLocationDisplay(location) ||
      [
        String(invoice.billing_address_line1 ?? "").trim(),
        [String(invoice.billing_city ?? "").trim(), String(invoice.billing_state ?? "").trim(), String(invoice.billing_zip ?? "").trim()].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ") ||
      [String(job?.job_address ?? "").trim(), String(job?.city ?? "").trim()].filter(Boolean).join(", ") ||
      "-";

    const formatPaymentStatusLabel = (status: string) => {
      if (status === "partial") return "Partial";
      if (status === "paid") return "Paid";
      return "Unpaid";
    };

    return {
      invoiceId,
      invoiceNumber: String(invoice.invoice_number ?? "").trim() || "-",
      invoiceStatusLabel: formatInvoiceStatusLabel(invoice.status),
      sourceTypeLabel: formatSourceTypeLabel(invoice.source_type),
      customerDisplay,
      locationDisplay,
      jobReference: shortReference(jobId),
      jobHref: jobId ? `/jobs/${jobId}` : null,
      serviceCaseReference: shortReference(String(invoice.service_case_id ?? "").trim()),
      contractorDisplay: extractContractorName(job) || "-",
      invoiceDateDisplay: formatTimestampDisplay(invoice.invoice_date),
      issuedDateDisplay: formatTimestampDisplay(invoice.issued_at),
      lastCommunicationDateDisplay: formatTimestampDisplay(deliveryMoment(delivery)),
      recipientDisplay: delivery?.recipientEmail || String(invoice.billing_email ?? "").trim() || "-",
      communicationStateLabel: formatCommunicationStateLabel(delivery),
      subtotalDisplay: formatCurrencyCents(invoice.subtotal_cents),
      totalDisplay: formatCurrencyCents(invoice.total_cents),
      voidedDateDisplay: formatTimestampDisplay(invoice.voided_at),
      amountPaidDisplay: formatCurrencyCents(paymentSummary?.amountPaidCents ?? 0),
      balanceDueDisplay: formatCurrencyCents(paymentSummary?.balanceDueCents ?? 0),
      paymentStatusLabel: formatPaymentStatusLabel(paymentSummary?.paymentStatus ?? "unpaid"),
      lastPaymentDateDisplay: formatTimestampDisplay(paymentSummary?.lastPaymentDate ?? null),
      paymentCountDisplay: paymentSummary && paymentSummary.paymentCount > 0 ? String(paymentSummary.paymentCount) : "-",
    } satisfies InvoiceLedgerRow;
  });

  return {
    rows: rows.slice(0, limit),
    totalCount: rows.length,
    truncated: scanTruncated || rows.length > limit,
  };
}

export function buildInvoiceLedgerCsv(rows: InvoiceLedgerRow[]) {
  const header = [
    "Invoice Number",
    "Status",
    "Source Type",
    "Customer",
    "Location",
    "Job Ref",
    "Service Case Ref",
    "Contractor",
    "Invoice Date",
    "Issued Date",
    "Last Communication",
    "Recipient",
    "Communication State",
    "Subtotal",
    "Total",
    "Voided Date",
    "Amount Paid",
    "Balance Due",
    "Payment Status",
    "Last Payment Date",
    "Payment Count",
  ];

  const lines = rows.map((row) => [
    row.invoiceNumber,
    row.invoiceStatusLabel,
    row.sourceTypeLabel,
    row.customerDisplay,
    row.locationDisplay,
    row.jobReference,
    row.serviceCaseReference,
    row.contractorDisplay,
    row.invoiceDateDisplay,
    row.issuedDateDisplay,
    row.lastCommunicationDateDisplay,
    row.recipientDisplay,
    row.communicationStateLabel,
    row.subtotalDisplay,
    row.totalDisplay,
    row.voidedDateDisplay,
    row.amountPaidDisplay,
    row.balanceDueDisplay,
    row.paymentStatusLabel,
    row.lastPaymentDateDisplay,
    row.paymentCountDisplay,
  ].map((value) => csvEscape(String(value ?? ""))).join(","));

  return [header.map(csvEscape).join(","), ...lines].join("\r\n");
}