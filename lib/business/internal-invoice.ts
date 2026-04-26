export const INTERNAL_INVOICE_STATUSES = ["draft", "issued", "void"] as const;
export const INTERNAL_INVOICE_ITEM_TYPES = ["service", "material", "diagnostic", "adjustment", "other"] as const;

export type InternalInvoiceStatus = (typeof INTERNAL_INVOICE_STATUSES)[number];
export type InternalInvoiceItemType = (typeof INTERNAL_INVOICE_ITEM_TYPES)[number];

export type InternalInvoiceLineItemRecord = {
  id: string;
  invoice_id: string;
  sort_order: number;
  item_name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: InternalInvoiceItemType;
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
  location_id: string | null;
  service_case_id: string | null;
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
  line_items: InternalInvoiceLineItemRecord[];
};

const INTERNAL_INVOICE_SELECT = [
  "id",
  "account_owner_user_id",
  "job_id",
  "customer_id",
  "location_id",
  "service_case_id",
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
].join(", ");

const INTERNAL_INVOICE_LINE_ITEM_SELECT = [
  "id",
  "invoice_id",
  "sort_order",
  "item_name_snapshot",
  "description_snapshot",
  "item_type_snapshot",
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

export function normalizeInternalInvoiceItemType(value: unknown): InternalInvoiceItemType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "material") return "material";
  if (normalized === "diagnostic") return "diagnostic";
  if (normalized === "adjustment") return "adjustment";
  if (normalized === "other") return "other";
  return "service";
}

function normalizeInternalInvoiceLineItemRow(row: any): InternalInvoiceLineItemRecord {
  return {
    id: String(row?.id ?? "").trim(),
    invoice_id: String(row?.invoice_id ?? "").trim(),
    sort_order: Number(row?.sort_order ?? 0) || 0,
    item_name_snapshot: String(row?.item_name_snapshot ?? "").trim(),
    description_snapshot: String(row?.description_snapshot ?? "").trim() || null,
    item_type_snapshot: normalizeInternalInvoiceItemType(row?.item_type_snapshot),
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
    .neq("status", "void")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lineItems = await listInternalInvoiceLineItems({
    supabase: params.supabase,
    invoiceId: String(data.id ?? ""),
  });

  return {
    ...data,
    status: normalizeInternalInvoiceStatus(data.status),
    subtotal_cents: Number(data.subtotal_cents ?? 0) || 0,
    total_cents: Number(data.total_cents ?? 0) || 0,
    line_items: lineItems,
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
    .eq("status", "void")
    .order("voided_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lineItems = await listInternalInvoiceLineItems({
    supabase: params.supabase,
    invoiceId: String(data.id ?? ""),
  });

  return {
    ...data,
    status: normalizeInternalInvoiceStatus(data.status),
    subtotal_cents: Number(data.subtotal_cents ?? 0) || 0,
    total_cents: Number(data.total_cents ?? 0) || 0,
    line_items: lineItems,
  } as InternalInvoiceRecord;
}