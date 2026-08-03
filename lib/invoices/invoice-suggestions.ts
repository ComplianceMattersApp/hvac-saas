import { resolveCustomerVisibilityScope } from "@/lib/customers/visibility";
import {
  formatInvoiceDisplayReference,
  formatJobDisplayReference,
  normalizeDisplayNumber,
} from "@/lib/utils/display-references";

export type InvoiceSuggestion = {
  invoice_id: string;
  job_id: string | null;
  invoice_reference: string;
  status: string;
  invoice_date: string | null;
  total_cents: number;
  bill_to_display: string | null;
  job_reference: string | null;
  href: string | null;
};

type InvoiceSuggestionRow = {
  id?: string;
  job_id?: string | null;
  invoice_display_number?: unknown;
  invoice_number?: unknown;
  status?: string | null;
  invoice_date?: string | null;
  total_cents?: number | null;
  billing_name?: string | null;
};

type InvoiceSuggestionJobRow = {
  id?: string;
  job_display_number?: unknown;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
};

const INVOICE_SUGGESTION_SELECT =
  "id, job_id, invoice_display_number, invoice_number, status, invoice_date, total_cents, billing_name";

// Display numbers are tenant-scoped bigints seeded at 2001; anything longer than
// this is a mistyped query rather than a real invoice.
const MAX_DISPLAY_NUMBER_DIGITS = 12;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function escapeLikePattern(raw: string) {
  return raw.replace(/[%_]/g, "\\$&");
}

/**
 * Splits a raw search box query into the two ways an invoice can be addressed:
 * the short display number people actually read off a PDF ("2043", "#2043",
 * "invoice 2043"), and the opaque legacy `invoice_number` text ("INV-20260530-A1B2").
 */
export function parseInvoiceSearchQuery(raw: string | null | undefined): {
  displayNumber: number | null;
  legacyNumberText: string | null;
} {
  const trimmed = normalizeText(raw);
  if (!trimmed) return { displayNumber: null, legacyNumberText: null };

  const stripped = trimmed.replace(/^(?:invoices?|inv)?\s*#?\s*/i, "").trim();

  let displayNumber: number | null = null;
  if (/^\d+$/.test(stripped) && stripped.length <= MAX_DISPLAY_NUMBER_DIGITS) {
    const parsed = Number(stripped);
    if (Number.isSafeInteger(parsed) && parsed > 0) displayNumber = parsed;
  }

  // Legacy invoice numbers look like "INV-20260530-A1B2". A bare digit run would
  // match the date segment of every invoice raised that day, and a bare word run
  // is a customer name - so only pay for that scan when the query is shaped like
  // a legacy number.
  const looksLikeLegacyNumber =
    /^inv/i.test(trimmed) || (/[a-z]/i.test(trimmed) && /\d/.test(trimmed));
  const legacyNumberText = looksLikeLegacyNumber ? trimmed : null;

  return { displayNumber, legacyNumberText };
}

function jobCustomerDisplay(job: InvoiceSuggestionJobRow | undefined) {
  if (!job) return null;
  const name = [normalizeText(job.customer_first_name), normalizeText(job.customer_last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || null;
}

export function buildInvoiceSuggestions(params: {
  invoices: InvoiceSuggestionRow[];
  jobs?: InvoiceSuggestionJobRow[];
  resultLimit: number;
}): InvoiceSuggestion[] {
  const jobsById = new Map<string, InvoiceSuggestionJobRow>();
  for (const job of params.jobs ?? []) {
    const id = normalizeText(job.id);
    if (id) jobsById.set(id, job);
  }

  const seen = new Set<string>();
  const ranked: Array<{ sortKey: number; suggestion: InvoiceSuggestion }> = [];

  for (const invoice of params.invoices) {
    const invoiceId = normalizeText(invoice.id);
    if (!invoiceId || seen.has(invoiceId)) continue;
    seen.add(invoiceId);

    const jobId = normalizeText(invoice.job_id) || null;
    const job = jobId ? jobsById.get(jobId) : undefined;
    const displayNumber = Number(normalizeDisplayNumber(invoice.invoice_display_number) ?? Number.NaN);

    ranked.push({
      sortKey: Number.isFinite(displayNumber) ? displayNumber : -1,
      suggestion: {
        invoice_id: invoiceId,
        job_id: jobId,
        invoice_reference: formatInvoiceDisplayReference({
          invoiceDisplayNumber: invoice.invoice_display_number,
          invoiceNumber: invoice.invoice_number,
          invoiceId,
        }),
        status: normalizeText(invoice.status).toLowerCase() || "draft",
        invoice_date: normalizeText(invoice.invoice_date) || null,
        total_cents: Number(invoice.total_cents ?? 0) || 0,
        bill_to_display: normalizeText(invoice.billing_name) || jobCustomerDisplay(job),
        job_reference: jobId
          ? formatJobDisplayReference({ jobDisplayNumber: job?.job_display_number, jobId })
          : null,
        href: jobId
          ? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`
          : null,
      },
    });
  }

  ranked.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return b.sortKey - a.sortKey;
    return a.suggestion.invoice_id.localeCompare(b.suggestion.invoice_id);
  });

  return ranked.slice(0, Math.max(0, params.resultLimit)).map((entry) => entry.suggestion);
}

export async function searchScopedInvoiceSuggestions(params: {
  supabase: any;
  userId: string;
  searchText: string;
  resultLimit?: number;
}): Promise<{ results: InvoiceSuggestion[] }> {
  const resultLimit = params.resultLimit ?? 5;
  const { displayNumber, legacyNumberText } = parseInvoiceSearchQuery(params.searchText);

  if (displayNumber === null && !legacyNumberText) {
    return { results: [] };
  }

  const scope = await resolveCustomerVisibilityScope({
    supabase: params.supabase,
    userId: params.userId,
  });

  // Invoice lookup is an internal back-office affordance. Contractor portal users
  // reach their own invoices through the portal, so never widen their scope here.
  if (!scope || scope.kind !== "internal") return { results: [] };

  const accountOwnerUserId = normalizeText(scope.accountOwnerUserId);
  if (!accountOwnerUserId) return { results: [] };

  const lookups: Array<Promise<{ data: unknown; error: unknown }>> = [];

  if (displayNumber !== null) {
    lookups.push(
      params.supabase
        .from("internal_invoices")
        .select(INVOICE_SUGGESTION_SELECT)
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("invoice_display_number", displayNumber)
        .limit(resultLimit),
    );
  }

  if (legacyNumberText) {
    lookups.push(
      params.supabase
        .from("internal_invoices")
        .select(INVOICE_SUGGESTION_SELECT)
        .eq("account_owner_user_id", accountOwnerUserId)
        .ilike("invoice_number", `%${escapeLikePattern(legacyNumberText)}%`)
        .limit(resultLimit),
    );
  }

  const lookupResults = await Promise.all(lookups);

  const invoices: InvoiceSuggestionRow[] = [];
  for (const result of lookupResults) {
    if (result?.error) throw result.error;
    invoices.push(...((result?.data ?? []) as InvoiceSuggestionRow[]));
  }

  if (!invoices.length) return { results: [] };

  const jobIds = Array.from(
    new Set(invoices.map((invoice) => normalizeText(invoice.job_id)).filter(Boolean)),
  );

  let jobs: InvoiceSuggestionJobRow[] = [];
  if (jobIds.length) {
    const { data: jobRows, error: jobErr } = await params.supabase
      .from("jobs")
      .select("id, job_display_number, customer_first_name, customer_last_name")
      .in("id", jobIds);

    if (jobErr) throw jobErr;
    jobs = (jobRows ?? []) as InvoiceSuggestionJobRow[];
  }

  return { results: buildInvoiceSuggestions({ invoices, jobs, resultLimit }) };
}
