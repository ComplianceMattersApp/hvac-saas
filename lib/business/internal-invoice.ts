import { resolveInvoiceCollectedPaymentSummary } from "@/lib/business/internal-invoice-payments";

export const INTERNAL_INVOICE_STATUSES = ["draft", "issued", "void"] as const;
export const INTERNAL_INVOICE_ITEM_TYPES = ["service", "material", "diagnostic", "adjustment", "other"] as const;
export const INTERNAL_INVOICE_KINDS = ["primary", "supplemental"] as const;

export type InternalInvoiceStatus = (typeof INTERNAL_INVOICE_STATUSES)[number];
export type InternalInvoiceItemType = (typeof INTERNAL_INVOICE_ITEM_TYPES)[number];
export type InternalInvoiceKind = (typeof INTERNAL_INVOICE_KINDS)[number];
export type InternalInvoiceBillToKind = "customer" | "contractor" | "other";

export type InternalInvoiceLineItemRecord = {
  id: string;
  invoice_id: string;
  source_job_id?: string | null;
  sort_order: number;
  source_kind: 'manual' | 'pricebook' | 'visit_scope' | null;
  source_pricebook_item_id: string | null;
  source_visit_scope_item_id: string | null;
  item_name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: InternalInvoiceItemType;
  category_snapshot: string | null;
  unit_label_snapshot: string | null;
  quantity: number;
  unit_price: number;
  line_subtotal: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type InternalInvoiceRecord = {
  id: string;
  account_owner_user_id: string;
  job_id: string;
  customer_id: string | null;
  bill_to_kind: InternalInvoiceBillToKind | null;
  bill_to_contractor_id: string | null;
  location_id: string | null;
  service_case_id: string | null;
  invoice_kind: InternalInvoiceKind;
  original_internal_invoice_id: string | null;
  supplemental_reason: string | null;
  invoice_display_number: string | null;
  invoice_number: string;
  status: InternalInvoiceStatus;
  invoice_date: string;
  issued_at: string | null;
  issued_by_user_id: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  void_reason: string | null;
  source_type: string;
  subtotal_cents: number;
  total_cents: number;
  notes: string | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
  qbo_invoice_id: string | null;
  qbo_customer_id: string | null;
  qbo_sync_status: "pending" | "synced" | "error" | "skipped" | null;
  qbo_sync_error: string | null;
  line_items: InternalInvoiceLineItemRecord[];
  member_job_ids?: string[];
};

export type InternalInvoiceJobMembership = {
  internal_invoice_id: string;
  job_id: string;
  inclusion_order: number;
};

export type InternalInvoiceFamilySummaryRecord = {
  id: string;
  job_id: string;
  invoice_kind: InternalInvoiceKind;
  invoice_display_number: string | null;
  invoice_number: string;
  status: InternalInvoiceStatus;
  total_cents: number;
  amount_paid_cents: number;
  balance_due_cents: number;
  supplemental_reason: string | null;
  bill_to_kind: InternalInvoiceBillToKind | null;
  bill_to_contractor_id: string | null;
  billing_name: string | null;
  original_internal_invoice_id: string | null;
  created_at: string;
};

const INTERNAL_INVOICE_SELECT = [
  "id",
  "account_owner_user_id",
  "job_id",
  "customer_id",
  "bill_to_kind",
  "bill_to_contractor_id",
  "location_id",
  "service_case_id",
  "invoice_kind",
  "original_internal_invoice_id",
  "supplemental_reason",
  "invoice_display_number",
  "invoice_number",
  "status",
  "invoice_date",
  "issued_at",
  "issued_by_user_id",
  "voided_at",
  "voided_by_user_id",
  "void_reason",
  "source_type",
  "subtotal_cents",
  "total_cents",
  "notes",
  "billing_name",
  "billing_email",
  "billing_phone",
  "billing_address_line1",
  "billing_address_line2",
  "billing_city",
  "billing_state",
  "billing_zip",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "qbo_invoice_id",
  "qbo_customer_id",
  "qbo_sync_status",
  "qbo_sync_error",
].join(", ");

const INTERNAL_INVOICE_LINE_ITEM_SELECT = [
  "id",
  "invoice_id",
  "source_job_id",
  "sort_order",
  "source_kind",
  "source_pricebook_item_id",
  "source_visit_scope_item_id",
  "item_name_snapshot",
  "description_snapshot",
  "item_type_snapshot",
  "category_snapshot",
  "unit_label_snapshot",
  "quantity",
  "unit_price",
  "line_subtotal",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

export function normalizeInternalInvoiceStatus(value: unknown): InternalInvoiceStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "issued") return "issued";
  if (normalized === "void") return "void";
  return "draft";
}

export function normalizeInternalInvoiceKind(value: unknown): InternalInvoiceKind {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "supplemental") return "supplemental";
  return "primary";
}

export function normalizeInternalInvoiceItemType(value: unknown): InternalInvoiceItemType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "material") return "material";
  if (normalized === "diagnostic") return "diagnostic";
  if (normalized === "adjustment") return "adjustment";
  if (normalized === "other") return "other";
  return "service";
}

export function resolveInternalInvoiceJobShareCents(
  invoice: Pick<InternalInvoiceRecord, "job_id" | "total_cents" | "line_items" | "member_job_ids">,
  jobId: string,
): number {
  const normalizedJobId = String(jobId ?? "").trim();
  const memberJobIds = invoice.member_job_ids ?? [];
  if (!normalizedJobId || memberJobIds.length <= 1) {
    return Number(invoice.total_cents ?? 0) || 0;
  }

  return (invoice.line_items ?? [])
    .filter((lineItem) => String(lineItem.source_job_id ?? "").trim() === normalizedJobId)
    .reduce((total, lineItem) => total + (Number(lineItem.line_subtotal ?? 0) || 0), 0);
}

function normalizeInternalInvoiceLineItemRow(row: any): InternalInvoiceLineItemRecord {
  const sourceKindRaw = String(row?.source_kind ?? '').trim().toLowerCase();
  const sourceKind = sourceKindRaw === 'manual' || sourceKindRaw === 'pricebook' || sourceKindRaw === 'visit_scope'
    ? (sourceKindRaw as 'manual' | 'pricebook' | 'visit_scope')
    : null;

  return {
    id: String(row?.id ?? "").trim(),
    invoice_id: String(row?.invoice_id ?? "").trim(),
    source_job_id: String(row?.source_job_id ?? "").trim() || null,
    sort_order: Number(row?.sort_order ?? 0) || 0,
    source_kind: sourceKind,
    source_pricebook_item_id: String(row?.source_pricebook_item_id ?? '').trim() || null,
    source_visit_scope_item_id: String(row?.source_visit_scope_item_id ?? '').trim() || null,
    item_name_snapshot: String(row?.item_name_snapshot ?? "").trim(),
    description_snapshot: String(row?.description_snapshot ?? "").trim() || null,
    item_type_snapshot: normalizeInternalInvoiceItemType(row?.item_type_snapshot),
    category_snapshot: String(row?.category_snapshot ?? '').trim() || null,
    unit_label_snapshot: String(row?.unit_label_snapshot ?? '').trim() || null,
    quantity: Number(row?.quantity ?? 0) || 0,
    unit_price: Number(row?.unit_price ?? 0) || 0,
    line_subtotal: Number(row?.line_subtotal ?? 0) || 0,
    created_by_user_id: String(row?.created_by_user_id ?? "").trim(),
    updated_by_user_id: String(row?.updated_by_user_id ?? "").trim(),
    created_at: String(row?.created_at ?? "").trim(),
    updated_at: String(row?.updated_at ?? "").trim(),
  };
}

export async function listInternalInvoiceLineItems(params: {
  supabase: any;
  invoiceId: string;
}): Promise<InternalInvoiceLineItemRecord[]> {
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!invoiceId) return [];

  const { data, error } = await params.supabase
    .from("internal_invoice_line_items")
    .select(INTERNAL_INVOICE_LINE_ITEM_SELECT)
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeInternalInvoiceLineItemRow) : [];
}

export async function resolveInternalInvoiceById(params: {
  supabase: any;
  invoiceId: string;
}): Promise<InternalInvoiceRecord | null> {
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!invoiceId) return null;

  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select(INTERNAL_INVOICE_SELECT)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lineItems = await listInternalInvoiceLineItems({
    supabase: params.supabase,
    invoiceId: String(data.id ?? ""),
  });
  const memberships = await listInternalInvoiceJobMemberships({ supabase: params.supabase, invoiceId });

  return {
    ...data,
    invoice_kind: normalizeInternalInvoiceKind(data.invoice_kind),
    original_internal_invoice_id: String(data.original_internal_invoice_id ?? "").trim() || null,
    supplemental_reason: String(data.supplemental_reason ?? "").trim() || null,
    status: normalizeInternalInvoiceStatus(data.status),
    subtotal_cents: Number(data.subtotal_cents ?? 0) || 0,
    total_cents: Number(data.total_cents ?? 0) || 0,
    line_items: lineItems,
    member_job_ids: memberships.map((row) => row.job_id),
  } as InternalInvoiceRecord;
}

export async function resolveInternalInvoiceByJobId(params: {
  supabase: any;
  jobId: string;
}): Promise<InternalInvoiceRecord | null> {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) return null;

  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select(INTERNAL_INVOICE_SELECT)
    .eq("job_id", jobId)
    .eq("invoice_kind", "primary")
    .neq("status", "void")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const { data: membership, error: membershipError } = await params.supabase
      .from("internal_invoice_jobs")
      .select("internal_invoice_id, inclusion_order, internal_invoices!inner(status, invoice_kind)")
      .eq("job_id", jobId)
      .eq("internal_invoices.invoice_kind", "primary")
      .neq("internal_invoices.status", "void")
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    const invoiceId = String(membership?.internal_invoice_id ?? "").trim();
    if (!invoiceId) return null;
    const invoice = await resolveInternalInvoiceById({ supabase: params.supabase, invoiceId });
    if (!invoice) return null;
    const memberships = await listInternalInvoiceJobMemberships({ supabase: params.supabase, invoiceId });
    return { ...invoice, member_job_ids: memberships.map((row) => row.job_id) };
  }

  const lineItems = await listInternalInvoiceLineItems({
    supabase: params.supabase,
    invoiceId: String(data.id ?? ""),
  });
  const memberships = await listInternalInvoiceJobMemberships({
    supabase: params.supabase,
    invoiceId: String(data.id ?? ""),
  });

  return {
    ...data,
    invoice_kind: normalizeInternalInvoiceKind(data.invoice_kind),
    original_internal_invoice_id: String(data.original_internal_invoice_id ?? "").trim() || null,
    supplemental_reason: String(data.supplemental_reason ?? "").trim() || null,
    status: normalizeInternalInvoiceStatus(data.status),
    subtotal_cents: Number(data.subtotal_cents ?? 0) || 0,
    total_cents: Number(data.total_cents ?? 0) || 0,
    line_items: lineItems,
    member_job_ids: memberships.map((row) => row.job_id),
  } as InternalInvoiceRecord;
}

export async function resolveLatestVoidedInternalInvoiceByJobId(params: {
  supabase: any;
  jobId: string;
}): Promise<InternalInvoiceRecord | null> {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) return null;

  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select(INTERNAL_INVOICE_SELECT)
    .eq("job_id", jobId)
    .eq("invoice_kind", "primary")
    .eq("status", "void")
    .order("voided_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const { data: memberships, error: membershipError } = await params.supabase
      .from("internal_invoice_jobs")
      .select("internal_invoice_id, inclusion_order, internal_invoices!inner(status, invoice_kind, voided_at, created_at)")
      .eq("job_id", jobId)
      .eq("internal_invoices.invoice_kind", "primary")
      .eq("internal_invoices.status", "void");
    if (membershipError) throw membershipError;
    const candidates = Array.isArray(memberships) ? memberships : [];
    const latest = candidates.sort((left: any, right: any) => {
      const leftInvoice = Array.isArray(left.internal_invoices) ? left.internal_invoices[0] : left.internal_invoices;
      const rightInvoice = Array.isArray(right.internal_invoices) ? right.internal_invoices[0] : right.internal_invoices;
      return String(rightInvoice?.voided_at ?? rightInvoice?.created_at ?? "").localeCompare(String(leftInvoice?.voided_at ?? leftInvoice?.created_at ?? ""));
    })[0];
    const invoiceId = String(latest?.internal_invoice_id ?? "").trim();
    return invoiceId ? resolveInternalInvoiceById({ supabase: params.supabase, invoiceId }) : null;
  }

  const lineItems = await listInternalInvoiceLineItems({
    supabase: params.supabase,
    invoiceId: String(data.id ?? ""),
  });

  return {
    ...data,
    invoice_kind: normalizeInternalInvoiceKind(data.invoice_kind),
    original_internal_invoice_id: String(data.original_internal_invoice_id ?? "").trim() || null,
    supplemental_reason: String(data.supplemental_reason ?? "").trim() || null,
    status: normalizeInternalInvoiceStatus(data.status),
    subtotal_cents: Number(data.subtotal_cents ?? 0) || 0,
    total_cents: Number(data.total_cents ?? 0) || 0,
    line_items: lineItems,
  } as InternalInvoiceRecord;
}

export async function listInternalInvoicesByJobId(params: {
  supabase: any;
  jobId: string;
}): Promise<InternalInvoiceRecord[]> {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) return [];

  const { data, error } = await params.supabase
    .from("internal_invoices")
    .select(INTERNAL_INVOICE_SELECT)
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const invoices = await Promise.all(
    rows.map(async (row) => {
      const lineItems = await listInternalInvoiceLineItems({
        supabase: params.supabase,
        invoiceId: String(row?.id ?? ""),
      });

      return {
        ...row,
        invoice_kind: normalizeInternalInvoiceKind(row?.invoice_kind),
        original_internal_invoice_id: String(row?.original_internal_invoice_id ?? "").trim() || null,
        supplemental_reason: String(row?.supplemental_reason ?? "").trim() || null,
        status: normalizeInternalInvoiceStatus(row?.status),
        subtotal_cents: Number(row?.subtotal_cents ?? 0) || 0,
        total_cents: Number(row?.total_cents ?? 0) || 0,
        line_items: lineItems,
      } as InternalInvoiceRecord;
    }),
  );

  return invoices.sort((left, right) => {
    if (left.invoice_kind !== right.invoice_kind) {
      return left.invoice_kind === "primary" ? -1 : 1;
    }

    return String(left.created_at).localeCompare(String(right.created_at));
  });
}

export async function resolveInternalInvoiceFamilyByJobId(params: {
  supabase: any;
  jobId: string;
}): Promise<{
  currentPrimaryInvoice: InternalInvoiceRecord | null;
  supplementalInvoices: InternalInvoiceRecord[];
  allInvoices: InternalInvoiceRecord[];
}> {
  const allInvoices = await listInternalInvoicesByJobId(params);

  return {
    currentPrimaryInvoice:
      allInvoices.find((invoice) => invoice.invoice_kind === "primary" && invoice.status !== "void") ?? null,
    supplementalInvoices: allInvoices.filter((invoice) => invoice.invoice_kind === "supplemental"),
    allInvoices,
  };
}

export async function resolveInternalInvoiceFamilySummaryByJobId(params: {
  supabase: any;
  accountOwnerUserId: string;
  jobId: string;
}): Promise<{
  currentPrimaryInvoice: InternalInvoiceFamilySummaryRecord | null;
  supplementalInvoices: InternalInvoiceFamilySummaryRecord[];
  allInvoices: InternalInvoiceFamilySummaryRecord[];
}> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) {
    return {
      currentPrimaryInvoice: null,
      supplementalInvoices: [],
      allInvoices: [],
    };
  }

  const family = await resolveInternalInvoiceFamilyByJobId({
    supabase: params.supabase,
    jobId: params.jobId,
  });

  const allInvoices = await Promise.all(
    family.allInvoices.map(async (invoice) => {
      const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
        accountOwnerUserId,
        invoice.id,
        params.supabase,
      );

      return {
        id: invoice.id,
        job_id: invoice.job_id,
        invoice_kind: invoice.invoice_kind,
        invoice_display_number: invoice.invoice_display_number,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        total_cents: Number(invoice.total_cents ?? 0) || 0,
        amount_paid_cents: Number(paymentSummary.amountPaidCents ?? 0) || 0,
        balance_due_cents: Number(paymentSummary.balanceDueCents ?? 0) || 0,
        supplemental_reason: invoice.supplemental_reason,
        bill_to_kind: invoice.bill_to_kind,
        bill_to_contractor_id: invoice.bill_to_contractor_id,
        billing_name: invoice.billing_name,
        original_internal_invoice_id: invoice.original_internal_invoice_id,
        created_at: invoice.created_at,
      } satisfies InternalInvoiceFamilySummaryRecord;
    }),
  );

  return {
    currentPrimaryInvoice:
      allInvoices.find((invoice) => invoice.invoice_kind === "primary" && invoice.status !== "void") ?? null,
    supplementalInvoices: allInvoices.filter((invoice) => invoice.invoice_kind === "supplemental"),
    allInvoices,
  };
}

export async function listInternalInvoiceJobMemberships(params: {
  supabase: any;
  invoiceId: string;
}): Promise<InternalInvoiceJobMembership[]> {
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!invoiceId) return [];
  const { data, error } = await params.supabase
    .from("internal_invoice_jobs")
    .select("internal_invoice_id, job_id, inclusion_order")
    .eq("internal_invoice_id", invoiceId)
    .order("inclusion_order", { ascending: true });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    internal_invoice_id: String(row.internal_invoice_id),
    job_id: String(row.job_id),
    inclusion_order: Number(row.inclusion_order),
  }));
}
