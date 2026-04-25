export const INTERNAL_INVOICE_PAYMENT_STATUSES = [
  "recorded",
  "pending",
  "failed",
  "reversed",
] as const;

export const INTERNAL_INVOICE_PAYMENT_METHODS = [
  "cash",
  "check",
  "ach_off_platform",
  "card_off_platform",
  "bank_transfer",
  "other",
] as const;

export type InternalInvoicePaymentStatus =
  (typeof INTERNAL_INVOICE_PAYMENT_STATUSES)[number];

export type InternalInvoicePaymentMethod =
  (typeof INTERNAL_INVOICE_PAYMENT_METHODS)[number];

export type InternalInvoicePaymentRow = {
  id: string;
  account_owner_user_id: string;
  invoice_id: string;
  job_id: string;
  payment_status: InternalInvoicePaymentStatus;
  payment_method: InternalInvoicePaymentMethod;
  amount_cents: number;
  paid_at: string;
  received_reference: string | null;
  notes: string | null;
  recorded_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type InternalInvoiceCollectedPaymentSummary = {
  invoiceId: string;
  invoiceTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
};

const INTERNAL_INVOICE_PAYMENT_SELECT = [
  "id",
  "account_owner_user_id",
  "invoice_id",
  "job_id",
  "payment_status",
  "payment_method",
  "amount_cents",
  "paid_at",
  "received_reference",
  "notes",
  "recorded_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

function normalizePaymentStatus(value: unknown): InternalInvoicePaymentStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "failed") return "failed";
  if (normalized === "reversed") return "reversed";
  return "recorded";
}

function normalizePaymentMethod(value: unknown): InternalInvoicePaymentMethod {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "check") return "check";
  if (normalized === "ach_off_platform") return "ach_off_platform";
  if (normalized === "card_off_platform") return "card_off_platform";
  if (normalized === "bank_transfer") return "bank_transfer";
  if (normalized === "other") return "other";
  return "cash";
}

function normalizePaymentRow(row: any): InternalInvoicePaymentRow {
  return {
    id: String(row?.id ?? "").trim(),
    account_owner_user_id: String(row?.account_owner_user_id ?? "").trim(),
    invoice_id: String(row?.invoice_id ?? "").trim(),
    job_id: String(row?.job_id ?? "").trim(),
    payment_status: normalizePaymentStatus(row?.payment_status),
    payment_method: normalizePaymentMethod(row?.payment_method),
    amount_cents: Number(row?.amount_cents ?? 0) || 0,
    paid_at: String(row?.paid_at ?? "").trim(),
    received_reference: String(row?.received_reference ?? "").trim() || null,
    notes: String(row?.notes ?? "").trim() || null,
    recorded_by_user_id: String(row?.recorded_by_user_id ?? "").trim(),
    created_at: String(row?.created_at ?? "").trim(),
    updated_at: String(row?.updated_at ?? "").trim(),
  };
}

export async function listInvoicePaymentRows(
  accountOwnerUserId: string,
  invoiceId: string,
  supabase: any,
): Promise<InternalInvoicePaymentRow[]> {
  const normalizedOwnerId = String(accountOwnerUserId ?? "").trim();
  const normalizedInvoiceId = String(invoiceId ?? "").trim();

  if (!normalizedOwnerId || !normalizedInvoiceId) return [];

  const { data, error } = await supabase
    .from("internal_invoice_payments")
    .select(INTERNAL_INVOICE_PAYMENT_SELECT)
    .eq("account_owner_user_id", normalizedOwnerId)
    .eq("invoice_id", normalizedInvoiceId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to list internal invoice payments: ${error.message ?? "unknown error"}`,
    );
  }

  return Array.isArray(data) ? data.map(normalizePaymentRow) : [];
}

export async function resolveInvoiceCollectedPaymentSummary(
  accountOwnerUserId: string,
  invoiceId: string,
  supabase: any,
): Promise<InternalInvoiceCollectedPaymentSummary> {
  const normalizedOwnerId = String(accountOwnerUserId ?? "").trim();
  const normalizedInvoiceId = String(invoiceId ?? "").trim();

  if (!normalizedOwnerId || !normalizedInvoiceId) {
    return {
      invoiceId: normalizedInvoiceId,
      invoiceTotalCents: 0,
      amountPaidCents: 0,
      balanceDueCents: 0,
      paymentStatus: "unpaid",
    };
  }

  const { data: invoice, error: invoiceErr } = await supabase
    .from("internal_invoices")
    .select("id, total_cents")
    .eq("id", normalizedInvoiceId)
    .eq("account_owner_user_id", normalizedOwnerId)
    .maybeSingle();

  if (invoiceErr) {
    throw new Error(
      `Failed to resolve internal invoice payment summary: ${invoiceErr.message ?? "unknown error"}`,
    );
  }

  const invoiceTotalCents = Number(invoice?.total_cents ?? 0) || 0;

  const paymentRows = await listInvoicePaymentRows(
    normalizedOwnerId,
    normalizedInvoiceId,
    supabase,
  );

  const amountPaidCents = paymentRows.reduce((sum, row) => {
    if (row.payment_status !== "recorded") return sum;
    return sum + (Number(row.amount_cents ?? 0) || 0);
  }, 0);

  const balanceDueCents = Math.max(0, invoiceTotalCents - amountPaidCents);

  const paymentStatus =
    amountPaidCents <= 0
      ? "unpaid"
      : amountPaidCents >= invoiceTotalCents
        ? "paid"
        : "partial";

  return {
    invoiceId: normalizedInvoiceId,
    invoiceTotalCents,
    amountPaidCents,
    balanceDueCents,
    paymentStatus,
  };
}

export async function resolveInvoiceCollectedPaymentLedger(
  accountOwnerUserId: string,
  invoiceId: string,
  supabase: any,
): Promise<{
  summary: InternalInvoiceCollectedPaymentSummary;
  rows: InternalInvoicePaymentRow[];
}> {
  const [summary, rows] = await Promise.all([
    resolveInvoiceCollectedPaymentSummary(accountOwnerUserId, invoiceId, supabase),
    listInvoicePaymentRows(accountOwnerUserId, invoiceId, supabase),
  ]);

  return {
    summary,
    rows,
  };
}
