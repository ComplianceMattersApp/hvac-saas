import type { InternalInvoiceLineItemRecord, InternalInvoiceStatus } from "@/lib/business/internal-invoice";

export type InternalInvoiceDuplicateRisk = {
  invoiceId: string;
  jobId: string;
  jobTitle: string | null;
  invoiceDisplayNumber: string | null;
  invoiceNumber: string;
  status: InternalInvoiceStatus;
  billingName: string | null;
  totalCents: number;
  chargeNames: string[];
};

type CandidateInvoiceRow = {
  id: string;
  job_id: string;
  invoice_display_number?: string | null;
  invoice_number?: string | null;
  status?: string | null;
  billing_name?: string | null;
  total_cents?: number | null;
};

function normalizedAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

export function internalInvoiceChargeFingerprint(item: Pick<InternalInvoiceLineItemRecord,
  "source_pricebook_item_id" | "item_name_snapshot" | "quantity" | "unit_price" | "line_subtotal"
>) {
  const identity = String(item.source_pricebook_item_id ?? "").trim()
    || String(item.item_name_snapshot ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [identity, normalizedAmount(item.quantity), normalizedAmount(item.unit_price), normalizedAmount(item.line_subtotal)].join("|");
}

export function hasExactDuplicateChargeSet(
  currentItems: InternalInvoiceLineItemRecord[],
  candidateItems: InternalInvoiceLineItemRecord[],
) {
  if (currentItems.length === 0 || currentItems.length !== candidateItems.length) return false;
  const current = currentItems.map(internalInvoiceChargeFingerprint).sort();
  const candidate = candidateItems.map(internalInvoiceChargeFingerprint).sort();
  return current.every((fingerprint, index) => fingerprint === candidate[index]);
}

export async function resolveInternalInvoiceDuplicateRisks(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
  customerId: string | null;
  lineItems: InternalInvoiceLineItemRecord[];
}): Promise<InternalInvoiceDuplicateRisk[]> {
  const customerId = String(params.customerId ?? "").trim();
  if (!customerId || params.lineItems.length === 0) return [];

  const { data: candidateRows, error: candidateError } = await params.supabase
    .from("internal_invoices")
    .select("id, job_id, invoice_display_number, invoice_number, status, billing_name, total_cents")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("customer_id", customerId)
    .neq("id", params.invoiceId)
    .neq("status", "void");
  if (candidateError) throw candidateError;

  const candidates = (Array.isArray(candidateRows) ? candidateRows : []) as CandidateInvoiceRow[];
  if (candidates.length === 0) return [];
  const candidateIds = candidates.map((row) => row.id);
  const { data: lineRows, error: lineError } = await params.supabase
    .from("internal_invoice_line_items")
    .select("id, invoice_id, source_pricebook_item_id, item_name_snapshot, quantity, unit_price, line_subtotal")
    .in("invoice_id", candidateIds);
  if (lineError) throw lineError;

  const itemsByInvoice = new Map<string, InternalInvoiceLineItemRecord[]>();
  for (const row of Array.isArray(lineRows) ? lineRows : []) {
    const invoiceId = String(row?.invoice_id ?? "").trim();
    const list = itemsByInvoice.get(invoiceId) ?? [];
    list.push(row as InternalInvoiceLineItemRecord);
    itemsByInvoice.set(invoiceId, list);
  }

  const matches = candidates.filter((candidate) =>
    hasExactDuplicateChargeSet(params.lineItems, itemsByInvoice.get(candidate.id) ?? []),
  );
  if (matches.length === 0) return [];

  const jobIds = [...new Set(matches.map((row) => row.job_id).filter(Boolean))];
  const { data: jobRows, error: jobError } = jobIds.length
    ? await params.supabase.from("jobs").select("id, title").in("id", jobIds)
    : { data: [], error: null };
  if (jobError) throw jobError;
  const jobTitles = new Map((Array.isArray(jobRows) ? jobRows : []).map((row: any) => [String(row.id), String(row.title ?? "").trim() || null]));

  return matches.map((candidate) => ({
    invoiceId: candidate.id,
    jobId: candidate.job_id,
    jobTitle: jobTitles.get(candidate.job_id) ?? null,
    invoiceDisplayNumber: String(candidate.invoice_display_number ?? "").trim() || null,
    invoiceNumber: String(candidate.invoice_number ?? "").trim(),
    status: String(candidate.status ?? "draft").toLowerCase() === "issued" ? "issued" : "draft",
    billingName: String(candidate.billing_name ?? "").trim() || null,
    totalCents: Number(candidate.total_cents ?? 0) || 0,
    chargeNames: params.lineItems.map((item) => item.item_name_snapshot).filter(Boolean),
  }));
}
