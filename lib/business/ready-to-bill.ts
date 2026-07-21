import { sanitizeVisitScopeItemId, sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";

export const READY_TO_BILL_CANDIDATE_LIMIT = 250;

export type ReadyToBillJobRow = {
  id: string;
  account_owner_user_id: string;
  contractor_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  title: string | null;
  job_address: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  job_display_number: number | string | null;
  visit_scope_items: unknown;
  invoice_complete: boolean | null;
  ops_status: string | null;
};

export type ReadyToBillJob = {
  id: string;
  jobReference: string;
  jobDate: string;
  customerName: string;
  serviceAddress: string;
  title: string;
  expectedTotalCents: number;
  expectedTotalDisplay: string;
  eligible: boolean;
  blocker: string | null;
  manualDetailsRequired: boolean;
};

export type ReadyToBillContractorGroup = {
  contractorId: string;
  contractorName: string;
  jobs: ReadyToBillJob[];
  readyJobCount: number;
  blockedJobCount: number;
  invoiceDetailsJobCount: number;
  expectedTotalCents: number;
  expectedTotalDisplay: string;
};

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function jobTotal(params: { row: ReadyToBillJobRow; pricebookUnitPriceById: Map<string, unknown> }) {
  let items;
  try {
    items = sanitizeVisitScopeItems(params.row.visit_scope_items ?? []);
  } catch {
    return { cents: 0, blocker: "Work Item invoice information is invalid." };
  }
  if (items.length === 0) return { cents: 0, blocker: "No invoice-ready Work Items." };

  let cents = 0;
  for (const item of items) {
    const pricebookId = sanitizeVisitScopeItemId(item.source_pricebook_item_id);
    const rawPrice = item.expected_unit_price != null
      ? item.expected_unit_price
      : pricebookId
        ? params.pricebookUnitPriceById.get(pricebookId) ?? 0
        : 0;
    const price = Number(rawPrice);
    const quantity = Number(item.expected_quantity ?? 1);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return { cents: 0, blocker: "Work Item pricing is invalid." };
    }
    cents += Math.round(quantity * Math.round(price * 100));
  }
  return cents > 0
    ? { cents, blocker: null }
    : { cents: 0, blocker: "Add pricing before consolidating this job." };
}

export function buildReadyToBillGroups(params: {
  jobs: ReadyToBillJobRow[];
  contractorNameById: Map<string, string>;
  activeInvoiceJobIds: Set<string>;
  pricebookUnitPriceById: Map<string, unknown>;
}): ReadyToBillContractorGroup[] {
  const groups = new Map<string, ReadyToBillContractorGroup>();
  for (const row of params.jobs) {
    const contractorId = String(row.contractor_id ?? "").trim();
    if (!contractorId) continue;
    const total = jobTotal({ row, pricebookUnitPriceById: params.pricebookUnitPriceById });
    const alreadyInvoiced = params.activeInvoiceJobIds.has(row.id);
    const manualDetailsRequired = !alreadyInvoiced && (
      total.blocker === "No invoice-ready Work Items." ||
      total.blocker === "Add pricing before consolidating this job."
    );
    const blocker = alreadyInvoiced
      ? "Already linked to an active invoice."
      : manualDetailsRequired
        ? "Enter invoice details before consolidating."
        : total.blocker;
    const job: ReadyToBillJob = {
      id: row.id,
      jobReference: row.job_display_number ? `Job #${row.job_display_number}` : `Job ${row.id.slice(0, 8)}`,
      jobDate: String(row.scheduled_date ?? "").trim() || "Date not set",
      customerName: [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ").trim() || "Customer not set",
      serviceAddress: String(row.job_address ?? "").trim() || "Service address not set",
      title: String(row.title ?? "").trim() || "Service visit",
      expectedTotalCents: total.cents,
      expectedTotalDisplay: currency(total.cents),
      eligible: !blocker || manualDetailsRequired,
      blocker,
      manualDetailsRequired,
    };
    const group = groups.get(contractorId) ?? {
      contractorId,
      contractorName: params.contractorNameById.get(contractorId) ?? "Contractor",
      jobs: [],
      readyJobCount: 0,
      blockedJobCount: 0,
      invoiceDetailsJobCount: 0,
      expectedTotalCents: 0,
      expectedTotalDisplay: currency(0),
    };
    group.jobs.push(job);
    if (job.manualDetailsRequired) {
      group.invoiceDetailsJobCount += 1;
    } else if (job.eligible) {
      group.readyJobCount += 1;
      group.expectedTotalCents += job.expectedTotalCents;
    } else {
      group.blockedJobCount += 1;
    }
    group.expectedTotalDisplay = currency(group.expectedTotalCents);
    groups.set(contractorId, group);
  }
  return [...groups.values()]
    .filter((group) => group.readyJobCount > 0 || group.invoiceDetailsJobCount > 0)
    .sort((left, right) => left.contractorName.localeCompare(right.contractorName));
}

export async function listReadyToBillContractorGroups(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<{ groups: ReadyToBillContractorGroup[]; truncated: boolean }> {
  const { data: jobs, error: jobsError } = await params.supabase
    .from("jobs")
    .select("id, account_owner_user_id, contractor_id, customer_first_name, customer_last_name, title, job_address, scheduled_date, window_start, job_display_number, visit_scope_items, invoice_complete, ops_status")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("status", "completed")
    .eq("field_complete", true)
    .eq("lifecycle_state", "active")
    .eq("billing_recipient", "contractor")
    .is("billing_disposition", null)
    .or("invoice_complete.is.null,invoice_complete.eq.false")
    .or("ops_status.is.null,ops_status.neq.closed")
    .is("deleted_at", null)
    .not("contractor_id", "is", null)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("window_start", { ascending: true, nullsFirst: false })
    .order("job_display_number", { ascending: true })
    .limit(READY_TO_BILL_CANDIDATE_LIMIT + 1);
  if (jobsError) throw jobsError;
  const rows = ((jobs ?? []).slice(0, READY_TO_BILL_CANDIDATE_LIMIT)) as ReadyToBillJobRow[];
  const truncated = (jobs ?? []).length > READY_TO_BILL_CANDIDATE_LIMIT;
  if (rows.length === 0) return { groups: [], truncated };

  const jobIds = rows.map((row) => row.id);
  const contractorIds = Array.from(new Set(rows.map((row) => String(row.contractor_id ?? "")).filter(Boolean)));
  const pricebookIds = Array.from(new Set(rows.flatMap((row) => (Array.isArray(row.visit_scope_items) ? row.visit_scope_items : [])
    .map((item: any) => String(item?.source_pricebook_item_id ?? "").trim())
    .filter(Boolean))));
  const [membershipResult, contractorResult, pricebookResult] = await Promise.all([
    params.supabase.from("internal_invoice_jobs")
      .select("job_id, internal_invoices!inner(status, invoice_kind)")
      .in("job_id", jobIds)
      .neq("internal_invoices.status", "void")
      .eq("internal_invoices.invoice_kind", "primary"),
    params.supabase.from("contractors")
      .select("id, name")
      .eq("owner_user_id", params.accountOwnerUserId)
      .in("id", contractorIds),
    pricebookIds.length
      ? params.supabase.from("pricebook_items")
        .select("id, default_unit_price")
        .eq("account_owner_user_id", params.accountOwnerUserId)
        .eq("is_active", true)
        .in("id", pricebookIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (membershipResult.error) throw membershipResult.error;
  if (contractorResult.error) throw contractorResult.error;
  if (pricebookResult.error) throw pricebookResult.error;

  return {
    groups: buildReadyToBillGroups({
      jobs: rows,
      activeInvoiceJobIds: new Set((membershipResult.data ?? []).map((row: any) => String(row.job_id))),
      contractorNameById: new Map((contractorResult.data ?? []).map((row: any) => [String(row.id), String(row.name ?? "Contractor")])),
      pricebookUnitPriceById: new Map((pricebookResult.data ?? []).map((row: any) => [String(row.id), row.default_unit_price])),
    }),
    truncated,
  };
}
