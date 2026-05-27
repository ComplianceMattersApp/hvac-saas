import { formatBusinessDateUS } from "@/lib/utils/schedule-la";

export const MAINTENANCE_AGREEMENT_BILLING_PERIOD_PAYMENT_DISPLAY_STATES = [
  "not_invoice_backed",
  "invoice_draft",
  "unpaid",
  "partially_paid",
  "paid",
  "invoice_void",
  "payment_attention",
] as const;

export const MAINTENANCE_AGREEMENT_BILLING_PERIOD_POSTURES = [
  "internal_invoice",
  "external_off_platform",
  "manual",
  "no_charge",
  "waived",
  "not_billed_through_compliance_matters",
] as const;

export const MAINTENANCE_AGREEMENT_BILLING_PERIOD_STATUSES = [
  "draft",
  "pending_billing",
  "invoice_linked",
  "externally_billed",
  "no_charge",
  "waived",
  "not_billed",
  "cancelled",
] as const;

export type MaintenanceAgreementBillingPeriodPaymentDisplayState =
  (typeof MAINTENANCE_AGREEMENT_BILLING_PERIOD_PAYMENT_DISPLAY_STATES)[number];

export type MaintenanceAgreementBillingPeriodPosture =
  (typeof MAINTENANCE_AGREEMENT_BILLING_PERIOD_POSTURES)[number];

export type MaintenanceAgreementBillingPeriodStatus =
  (typeof MAINTENANCE_AGREEMENT_BILLING_PERIOD_STATUSES)[number];

export type MaintenanceAgreementBillingPeriodRow = {
  id: string;
  account_owner_user_id: string;
  maintenance_agreement_id: string;
  customer_id: string | null;
  coverage_start_date: string;
  coverage_end_date: string;
  billing_due_date: string | null;
  billing_cadence: string;
  amount_due_cents: number;
  currency: string;
  billing_posture: MaintenanceAgreementBillingPeriodPosture | string;
  billing_period_status: MaintenanceAgreementBillingPeriodStatus | string;
  internal_invoice_id: string | null;
  external_reference: string | null;
  external_notes: string | null;
  status_reason: string | null;
  created_at: string;
  created_by_user_id: string | null;
  updated_at: string;
  updated_by_user_id: string | null;
};

export type MaintenanceAgreementBillingPeriodInvoiceSummary = {
  invoice_id: string;
  invoice_number: string | null;
  invoice_status: string;
  invoice_total_cents: number;
  amount_paid_cents: number;
  balance_due_cents: number;
  payment_status: "unpaid" | "partial" | "paid";
  payment_attention: boolean;
};

export type MaintenanceAgreementBillingPeriodReadModelRow = {
  id: string;
  maintenance_agreement_id: string;
  customer_id: string | null;
  internal_invoice_id: string | null;
  coverage_start_date: string;
  coverage_end_date: string;
  coverage_label: string;
  billing_due_date: string | null;
  billing_cadence: string;
  amount_due_cents: number;
  currency: string;
  amount_label: string;
  billing_posture: string;
  billing_period_status: string;
  posture_label: string;
  lifecycle_label: string;
  external_reference: string | null;
  external_notes: string | null;
  status_reason: string | null;
  invoice_summary: MaintenanceAgreementBillingPeriodInvoiceSummary | null;
  payment_display_state: MaintenanceAgreementBillingPeriodPaymentDisplayState;
  amount_paid_cents?: number;
  balance_due_cents?: number;
  created_at: string;
  created_by_user_id: string | null;
  updated_at: string;
  updated_by_user_id: string | null;
};

type SupabaseLike = {
  from(table: string): any;
};

type ListParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
};

type ListForAgreementParams = ListParams & {
  agreementId: string | null | undefined;
};

type ListForCustomerParams = ListParams & {
  customerId: string | null | undefined;
};

type BillingPeriodInvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_cents: number;
};

type BillingPeriodPaymentRow = {
  invoice_id: string;
  amount_cents: number;
  payment_status: string;
  paid_at: string | null;
};

const BILLING_PERIOD_SELECT = [
  "id",
  "maintenance_agreement_id",
  "customer_id",
  "coverage_start_date",
  "coverage_end_date",
  "billing_due_date",
  "billing_cadence",
  "amount_due_cents",
  "currency",
  "billing_posture",
  "billing_period_status",
  "internal_invoice_id",
  "external_reference",
  "external_notes",
  "status_reason",
  "created_at",
  "created_by_user_id",
  "updated_at",
  "updated_by_user_id",
].join(", ");

function toCleanString(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function isValidYmd(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(toCleanString(value));
}

function normalizeCurrencyLabel(currency: string | null | undefined) {
  return toCleanString(currency).toUpperCase() || "USD";
}

function formatCurrencyCents(value: number | null | undefined, currency: string | null | undefined) {
  const amount = (Number(value ?? 0) || 0) / 100;
  const normalizedCurrency = normalizeCurrencyLabel(currency);

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
}

function formatCoverageLabel(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) {
    return "-";
  }

  return `Coverage ${formatBusinessDateUS(startDate)} - ${formatBusinessDateUS(endDate)}`;
}

function formatPostureLabel(value: string | null | undefined) {
  const normalized = toCleanString(value).toLowerCase();
  if (normalized === "internal_invoice") return "Internal invoice";
  if (normalized === "external_off_platform") return "External off-platform";
  if (normalized === "manual") return "Manual";
  if (normalized === "no_charge") return "No charge";
  if (normalized === "waived") return "Waived";
  if (normalized === "not_billed_through_compliance_matters") {
    return "Not billed through Compliance Matters";
  }
  return "-";
}

function formatLifecycleLabel(value: string | null | undefined) {
  const normalized = toCleanString(value).toLowerCase();
  if (normalized === "draft") return "Draft";
  if (normalized === "pending_billing") return "Pending billing";
  if (normalized === "invoice_linked") return "Invoice linked";
  if (normalized === "externally_billed") return "Externally billed";
  if (normalized === "no_charge") return "No charge";
  if (normalized === "waived") return "Waived";
  if (normalized === "not_billed") return "Not billed";
  if (normalized === "cancelled") return "Cancelled";
  return "-";
}

function normalizeBillingPeriodRow(row: MaintenanceAgreementBillingPeriodRow): MaintenanceAgreementBillingPeriodRow {
  return {
    ...row,
    customer_id: toCleanString(row.customer_id) || null,
    billing_due_date: toCleanString(row.billing_due_date) || null,
    billing_cadence: toCleanString(row.billing_cadence),
    billing_posture: toCleanString(row.billing_posture),
    billing_period_status: toCleanString(row.billing_period_status),
    internal_invoice_id: toCleanString(row.internal_invoice_id) || null,
    external_reference: toCleanString(row.external_reference) || null,
    external_notes: toCleanString(row.external_notes) || null,
    status_reason: toCleanString(row.status_reason) || null,
    created_by_user_id: toCleanString(row.created_by_user_id) || null,
    updated_by_user_id: toCleanString(row.updated_by_user_id) || null,
  };
}

function derivePaymentDisplayState(input: {
  internalInvoiceId: string | null;
  invoiceSummary: MaintenanceAgreementBillingPeriodInvoiceSummary | null;
}): MaintenanceAgreementBillingPeriodPaymentDisplayState {
  if (!toCleanString(input.internalInvoiceId)) {
    return "not_invoice_backed";
  }

  if (!input.invoiceSummary) {
    return "payment_attention";
  }

  const status = toCleanString(input.invoiceSummary.invoice_status).toLowerCase();
  if (status === "void") return "invoice_void";
  if (status === "draft") return "invoice_draft";
  if (status !== "issued") return "payment_attention";

  if (input.invoiceSummary.payment_attention) {
    return "payment_attention";
  }

  if (input.invoiceSummary.payment_status === "paid") return "paid";
  if (input.invoiceSummary.payment_status === "partial") return "partially_paid";
  return "unpaid";
}

async function runBillingPeriodQuery(query: any) {
  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return ((data ?? []) as MaintenanceAgreementBillingPeriodRow[]).map(normalizeBillingPeriodRow);
}

async function loadBillingPeriodInvoiceSummaryMap(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  internalInvoiceIds: string[];
}): Promise<Map<string, MaintenanceAgreementBillingPeriodInvoiceSummary>> {
  const summaryMap = new Map<string, MaintenanceAgreementBillingPeriodInvoiceSummary>();
  const normalizedInvoiceIds = Array.from(
    new Set(params.internalInvoiceIds.map((value) => toCleanString(value)).filter(Boolean)),
  );

  if (!normalizedInvoiceIds.length) {
    return summaryMap;
  }

  const [invoicesResult, paymentsResult] = await Promise.all([
    params.supabase
      .from("internal_invoices")
      .select("id, invoice_number, status, total_cents")
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .in("id", normalizedInvoiceIds),
    params.supabase
      .from("internal_invoice_payments")
      .select("invoice_id, amount_cents, payment_status, paid_at")
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .in("invoice_id", normalizedInvoiceIds),
  ]);

  if (invoicesResult.error) {
    throw new Error(
      `Failed to fetch billing period invoice summaries: ${invoicesResult.error.message ?? "unknown error"}`,
    );
  }

  if (paymentsResult.error) {
    throw new Error(
      `Failed to fetch billing period invoice payment truth: ${paymentsResult.error.message ?? "unknown error"}`,
    );
  }

  const invoices = ((invoicesResult.data ?? []) as BillingPeriodInvoiceRow[]).map((row) => ({
    id: toCleanString(row?.id),
    invoice_number: toCleanString(row?.invoice_number) || null,
    status: toCleanString(row?.status).toLowerCase() || "draft",
    total_cents: Number(row?.total_cents ?? 0) || 0,
  }));

  const paymentsByInvoiceId = new Map<string, BillingPeriodPaymentRow[]>();
  for (const row of (paymentsResult.data ?? []) as BillingPeriodPaymentRow[]) {
    const invoiceId = toCleanString(row?.invoice_id);
    if (!invoiceId) continue;
    if (!paymentsByInvoiceId.has(invoiceId)) {
      paymentsByInvoiceId.set(invoiceId, []);
    }
    paymentsByInvoiceId.get(invoiceId)!.push({
      invoice_id: invoiceId,
      amount_cents: Number(row?.amount_cents ?? 0) || 0,
      payment_status: toCleanString(row?.payment_status).toLowerCase(),
      paid_at: toCleanString(row?.paid_at) || null,
    });
  }

  for (const invoice of invoices) {
    const paymentRows = paymentsByInvoiceId.get(invoice.id) ?? [];
    let amountPaidCents = 0;
    let attentionRowsPresent = false;

    for (const payment of paymentRows) {
      if (payment.payment_status === "recorded") {
        amountPaidCents += Number(payment.amount_cents ?? 0) || 0;
      } else if (
        payment.payment_status === "pending" ||
        payment.payment_status === "failed" ||
        payment.payment_status === "reversed"
      ) {
        attentionRowsPresent = true;
      }
    }

    const balanceDueCents = Math.max(0, invoice.total_cents - amountPaidCents);
    const payment_status =
      amountPaidCents <= 0 ? "unpaid" : amountPaidCents >= invoice.total_cents ? "paid" : "partial";

    summaryMap.set(invoice.id, {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_status: invoice.status,
      invoice_total_cents: invoice.total_cents,
      amount_paid_cents: amountPaidCents,
      balance_due_cents: balanceDueCents,
      payment_status,
      payment_attention: attentionRowsPresent,
    });
  }

  return summaryMap;
}

function buildBillingPeriodReadModelRow(input: {
  row: MaintenanceAgreementBillingPeriodRow;
  invoiceSummary: MaintenanceAgreementBillingPeriodInvoiceSummary | null;
}): MaintenanceAgreementBillingPeriodReadModelRow {
  const paymentDisplayState = derivePaymentDisplayState({
    internalInvoiceId: input.row.internal_invoice_id,
    invoiceSummary: input.invoiceSummary,
  });

  const base: MaintenanceAgreementBillingPeriodReadModelRow = {
    id: input.row.id,
    maintenance_agreement_id: input.row.maintenance_agreement_id,
    customer_id: input.row.customer_id,
    internal_invoice_id: input.row.internal_invoice_id,
    coverage_start_date: input.row.coverage_start_date,
    coverage_end_date: input.row.coverage_end_date,
    coverage_label: formatCoverageLabel(input.row.coverage_start_date, input.row.coverage_end_date),
    billing_due_date: input.row.billing_due_date,
    billing_cadence: input.row.billing_cadence,
    amount_due_cents: input.row.amount_due_cents,
    currency: input.row.currency,
    amount_label: formatCurrencyCents(input.row.amount_due_cents, input.row.currency),
    billing_posture: input.row.billing_posture,
    billing_period_status: input.row.billing_period_status,
    posture_label: formatPostureLabel(input.row.billing_posture),
    lifecycle_label: formatLifecycleLabel(input.row.billing_period_status),
    external_reference: input.row.external_reference,
    external_notes: input.row.external_notes,
    status_reason: input.row.status_reason,
    invoice_summary: input.invoiceSummary,
    payment_display_state: paymentDisplayState,
    created_at: input.row.created_at,
    created_by_user_id: input.row.created_by_user_id,
    updated_at: input.row.updated_at,
    updated_by_user_id: input.row.updated_by_user_id,
  };

  if (input.invoiceSummary) {
    base.amount_paid_cents = input.invoiceSummary.amount_paid_cents;
    base.balance_due_cents = input.invoiceSummary.balance_due_cents;
  }

  return base;
}

async function resolveBillingPeriods(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  query: any;
}) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  const rows = await runBillingPeriodQuery(params.query);
  const invoiceSummaryMap = await loadBillingPeriodInvoiceSummaryMap({
    supabase: params.supabase,
    accountOwnerUserId,
    internalInvoiceIds: rows.map((row) => row.internal_invoice_id).filter(Boolean) as string[],
  });

  return rows.map((row) =>
    buildBillingPeriodReadModelRow({
      row,
      invoiceSummary: row.internal_invoice_id ? invoiceSummaryMap.get(row.internal_invoice_id) ?? null : null,
    }),
  );
}

export function formatMaintenanceAgreementBillingPeriodCoverageLabel(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
) {
  return formatCoverageLabel(startDate, endDate);
}

export function formatMaintenanceAgreementBillingPeriodAmountLabel(
  amountDueCents: number | null | undefined,
  currency: string | null | undefined,
) {
  return formatCurrencyCents(amountDueCents, currency);
}

export function formatMaintenanceAgreementBillingPeriodPostureLabel(
  value: string | null | undefined,
) {
  return formatPostureLabel(value);
}

export function formatMaintenanceAgreementBillingPeriodLifecycleLabel(
  value: string | null | undefined,
) {
  return formatLifecycleLabel(value);
}

export function deriveMaintenanceAgreementBillingPeriodPaymentDisplayState(input: {
  internalInvoiceId: string | null | undefined;
  invoiceSummary: MaintenanceAgreementBillingPeriodInvoiceSummary | null | undefined;
}) {
  return derivePaymentDisplayState({
    internalInvoiceId: input.internalInvoiceId ? toCleanString(input.internalInvoiceId) : null,
    invoiceSummary: input.invoiceSummary ?? null,
  });
}

export async function listMaintenanceAgreementBillingPeriodsForAccount(params: ListParams) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  const query = params.supabase
    .from("maintenance_agreement_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .order("coverage_start_date", { ascending: false })
    .order("created_at", { ascending: false });

  return resolveBillingPeriods({
    supabase: params.supabase,
    accountOwnerUserId,
    query,
  });
}

export async function listMaintenanceAgreementBillingPeriodsForAgreement(
  params: ListForAgreementParams,
) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const agreementId = toCleanString(params.agreementId);
  if (!accountOwnerUserId || !agreementId) return [];

  const query = params.supabase
    .from("maintenance_agreement_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("maintenance_agreement_id", agreementId)
    .order("coverage_start_date", { ascending: false })
    .order("created_at", { ascending: false });

  return resolveBillingPeriods({
    supabase: params.supabase,
    accountOwnerUserId,
    query,
  });
}

export async function listMaintenanceAgreementBillingPeriodsForCustomer(
  params: ListForCustomerParams,
) {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const customerId = toCleanString(params.customerId);
  if (!accountOwnerUserId || !customerId) return [];

  const query = params.supabase
    .from("maintenance_agreement_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .order("coverage_start_date", { ascending: false })
    .order("created_at", { ascending: false });

  return resolveBillingPeriods({
    supabase: params.supabase,
    accountOwnerUserId,
    query,
  });
}
