// lib/estimates/estimate-read.ts
// Compliance Matters: Estimate V1B read boundary + helpers.
// Internal-only. Account-owner scoped. No UI, no customer/contractor visibility.


import { createAdminClient } from "@/lib/supabase/server";
import type { InternalUserRow } from "@/lib/auth/internal-user";

function hasOwn(obj: unknown, key: string): boolean {
  return Boolean(obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key));
}

function isMissingEstimateToJobConversionSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string | null; message?: string | null };
  const code = String(maybeError.code ?? "").trim();
  const message = String(maybeError.message ?? "").toLowerCase();

  if (code === "42703" || code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("converted_job_id") ||
    message.includes("converted_by_user_id") ||
    message.includes("converted_invoice_id") ||
    message.includes("source_estimate_id") ||
    message.includes("origin_estimate_id") ||
    message.includes("schema cache") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

// Normalize missing conversion fields to null for compatibility.
export function getEstimateConvertedJobId(estimateRow: unknown): string | null {
  if (!hasOwn(estimateRow, "converted_job_id")) return null;
  const value = (estimateRow as Record<string, unknown>).converted_job_id;
  return typeof value === "string" && value.trim() ? value : null;
}
  // Normalize missing converted_invoice_id for compatibility
  export function getEstimateConvertedInvoiceId(estimateRow: unknown): string | null {
    if (!hasOwn(estimateRow, "converted_invoice_id")) return null;
    const value = (estimateRow as Record<string, unknown>).converted_invoice_id;
    return typeof value === "string" && value.trim() ? value : null;
  }

  export function isEstimateToInvoiceConversionSchemaReady(estimateRow: unknown): boolean {
    return hasOwn(estimateRow, "converted_invoice_id");
  }

export function getEstimateConvertedByUserId(estimateRow: unknown): string | null {
  if (!hasOwn(estimateRow, "converted_by_user_id")) return null;
  const value = (estimateRow as Record<string, unknown>).converted_by_user_id;
  return typeof value === "string" && value.trim() ? value : null;
}

export function getJobOriginEstimateId(jobRow: unknown): string | null {
  if (!hasOwn(jobRow, "origin_estimate_id")) return null;
  const value = (jobRow as Record<string, unknown>).origin_estimate_id;
  return typeof value === "string" && value.trim() ? value : null;
}

export async function getEstimateToJobConversionSchemaReady(params: {
  supabase: any;
}): Promise<boolean> {
  try {
    const { error: estimateSchemaErr } = await params.supabase
      .from("estimates")
      .select("id, converted_job_id, converted_by_user_id")
      .maybeSingle();

    if (estimateSchemaErr) {
      if (isMissingEstimateToJobConversionSchemaError(estimateSchemaErr)) return false;
      throw estimateSchemaErr;
    }

    const { error: jobSchemaErr } = await params.supabase
      .from("jobs")
      .select("id, origin_estimate_id")
      .maybeSingle();

    if (jobSchemaErr) {
      if (isMissingEstimateToJobConversionSchemaError(jobSchemaErr)) return false;
      throw jobSchemaErr;
    }

    return true;
  } catch (error) {
    if (isMissingEstimateToJobConversionSchemaError(error)) return false;
    throw error;
  }
}

export function isEstimateToJobConversionSchemaReady(estimateRow: unknown): boolean {
  return hasOwn(estimateRow, "converted_job_id") && hasOwn(estimateRow, "converted_by_user_id");
}

export async function getEstimateToInvoiceConversionSchemaReady(params: {
  supabase: any;
}): Promise<boolean> {
  try {
    const { error: estimateSchemaErr } = await params.supabase
      .from("estimates")
      .select("id, converted_invoice_id")
      .maybeSingle();

    if (estimateSchemaErr) {
      if (isMissingEstimateToJobConversionSchemaError(estimateSchemaErr)) return false;
      throw estimateSchemaErr;
    }

    const { error: invoiceSchemaErr } = await params.supabase
      .from("internal_invoices")
      .select("id, source_estimate_id")
      .maybeSingle();

    if (invoiceSchemaErr) {
      if (isMissingEstimateToJobConversionSchemaError(invoiceSchemaErr)) return false;
      throw invoiceSchemaErr;
    }

    return true;
  } catch (error) {
    if (isMissingEstimateToJobConversionSchemaError(error)) return false;
    throw error;
  }
}


// ---------------------------------------------------------------------------
// Estimate number generation
// Format: EST-YYYYMMDD-<8 hex chars>  (unique per account enforced by DB index)
// ---------------------------------------------------------------------------

export function buildEstimateNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `EST-${datePart}-${suffix}`;
}

function isMissingOptionPackageSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string | null; message?: string | null };
  const code = String(maybeError.code ?? "").trim();
  const message = String(maybeError.message ?? "").toLowerCase();

  if (code === "PGRST205" || code === "42P01") {
    return true;
  }

  return (
    message.includes("estimate_options") ||
    message.includes("estimate_option_line_items") ||
    message.includes("schema cache")
  );
}

// ---------------------------------------------------------------------------
// Same-account entity validation helpers
// Rules mirror internal-invoice-actions + internal-job-scope patterns.
//   customers  → owner_user_id
//   locations  → owner_user_id
//   service_cases → via customer_id → customers.owner_user_id
//   jobs       → via customer_id → customers.owner_user_id
//   pricebook_items → account_owner_user_id
// ---------------------------------------------------------------------------

/**
 * Verify a customer_id belongs to the actor's account.
 * Returns the customer row if valid, null if missing or cross-account.
 */
export async function loadScopedCustomerForEstimate(params: {
  customerId: string;
  accountOwnerUserId: string;
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<{ id: string } | null> {
  const admin = params.admin ?? createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .eq("id", params.customerId)
    .eq("owner_user_id", params.accountOwnerUserId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? { id: data.id } : null;
}

/**
 * Verify a location_id belongs to the actor's account.
 */
export async function loadScopedLocationForEstimate(params: {
  locationId: string;
  accountOwnerUserId: string;
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<{ id: string } | null> {
  const admin = params.admin ?? createAdminClient();
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("id", params.locationId)
    .eq("owner_user_id", params.accountOwnerUserId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? { id: data.id } : null;
}

/**
 * Verify a service_case_id is reachable within the actor's account.
 * Resolves account scope via service_case.customer_id → customers.owner_user_id.
 */
export async function loadScopedServiceCaseForEstimate(params: {
  serviceCaseId: string;
  accountOwnerUserId: string;
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<{ id: string } | null> {
  const admin = params.admin ?? createAdminClient();
  const { data: sc, error: scErr } = await admin
    .from("service_cases")
    .select("id, customer_id")
    .eq("id", params.serviceCaseId)
    .maybeSingle();
  if (scErr) throw scErr;
  if (!sc?.id || !sc?.customer_id) return null;

  const { data: cust, error: custErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", sc.customer_id)
    .eq("owner_user_id", params.accountOwnerUserId)
    .maybeSingle();
  if (custErr) throw custErr;
  return cust?.id ? { id: sc.id } : null;
}

/**
 * Verify an origin_job_id is reachable within the actor's account.
 * Resolves account scope via job.customer_id → customers.owner_user_id.
 */
export async function loadScopedJobForEstimate(params: {
  jobId: string;
  accountOwnerUserId: string;
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<{ id: string } | null> {
  const admin = params.admin ?? createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select("id, customer_id")
    .eq("id", params.jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job?.id || !job?.customer_id) return null;

  const { data: cust, error: custErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", job.customer_id)
    .eq("owner_user_id", params.accountOwnerUserId)
    .maybeSingle();
  if (custErr) throw custErr;
  return cust?.id ? { id: job.id } : null;
}

/**
 * Load a pricebook item that belongs to the actor's account.
 * Returns the row needed to build a frozen snapshot, or null.
 */
export async function loadScopedPricebookItemForEstimate(params: {
  pricebookItemId: string;
  accountOwnerUserId: string;
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<{
  id: string;
  item_name: string;
  item_type: string;
  default_description: string | null;
  category: string | null;
  unit_label: string | null;
  default_unit_price: number;
} | null> {
  const admin = params.admin ?? createAdminClient();
  const { data, error } = await admin
    .from("pricebook_items")
    .select(
      "id, item_name, item_type, default_description, category, unit_label, default_unit_price, is_active"
    )
    .eq("id", params.pricebookItemId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? data : null;
}

// ---------------------------------------------------------------------------
// Subtotal / total recomputation
// ---------------------------------------------------------------------------

/**
 * Recompute subtotal_cents from current line items and update the estimate row.
 * total_cents = subtotal_cents (no discount/tax in V1).
 * Returns the updated totals.
 */
export async function recomputeEstimateTotals(params: {
  estimateId: string;
  updatedByUserId: string;
  supabase: any;
}): Promise<{ subtotal_cents: number; total_cents: number }> {
  const { data: lines, error: linesErr } = await params.supabase
    .from("estimate_line_items")
    .select("line_subtotal_cents")
    .eq("estimate_id", params.estimateId);
  if (linesErr) throw linesErr;

  const subtotal = (lines ?? []).reduce(
    (sum: number, li: { line_subtotal_cents: number }) => sum + (li.line_subtotal_cents ?? 0),
    0
  );
  const total = subtotal; // no discount/tax in V1

  const { error: updateErr } = await params.supabase
    .from("estimates")
    .update({
      subtotal_cents: subtotal,
      total_cents: total,
      updated_by_user_id: params.updatedByUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.estimateId);
  if (updateErr) throw updateErr;

  return { subtotal_cents: subtotal, total_cents: total };
}

// ---------------------------------------------------------------------------
// Read: get estimate by ID
// ---------------------------------------------------------------------------

/**
 * Load an estimate option and its nested line items.
 * Returns null if option not found.
 */
async function loadEstimateOption(params: {
  optionId: string;
  estimateId: string;
  supabase: any;
}): Promise<EstimateOptionReadResult | null> {
  const { data: option, error: optionErr } = await params.supabase
    .from("estimate_options")
    .select(
      "id, estimate_id, slot_index, default_label_key, label, sort_order, summary, notes, subtotal_cents, total_cents, created_at, updated_at"
    )
    .eq("id", params.optionId)
    .eq("estimate_id", params.estimateId)
    .maybeSingle();
  if (optionErr) {
    if (isMissingOptionPackageSchemaError(optionErr)) return null;
    throw optionErr;
  }
  if (!option?.id) return null;

  const { data: lineItems, error: linesErr } = await params.supabase
    .from("estimate_option_line_items")
    .select(
      "id, estimate_option_id, estimate_id, sort_order, source_pricebook_item_id, item_name_snapshot, description_snapshot, item_type_snapshot, category_snapshot, unit_label_snapshot, quantity, unit_price_cents, line_subtotal_cents, created_at, updated_at"
    )
    .eq("estimate_option_id", params.optionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (linesErr) {
    if (isMissingOptionPackageSchemaError(linesErr)) return null;
    throw linesErr;
  }

  return { ...option, line_items: lineItems ?? [] };
}

/**
 * Load all estimate options for an estimate with their nested line items.
 * Returns empty array if no options exist.
 */
async function loadEstimateOptions(params: {
  estimateId: string;
  supabase: any;
}): Promise<EstimateOptionReadResult[]> {
  const { data: options, error: optionsErr } = await params.supabase
    .from("estimate_options")
    .select(
      "id, estimate_id, slot_index, default_label_key, label, sort_order, summary, notes, subtotal_cents, total_cents, created_at, updated_at"
    )
    .eq("estimate_id", params.estimateId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (optionsErr) {
    // Backward-compatible fallback for environments without option schema migration.
    if (isMissingOptionPackageSchemaError(optionsErr)) return [];
    throw optionsErr;
  }

  if (!options || options.length === 0) {
    return [];
  }

  // Load line items for each option in parallel
  const optionsWithLineItems = await Promise.all(
    options.map(async (opt: Omit<EstimateOptionReadResult, "line_items">) => {
      const { data: lineItems, error: linesErr } = await params.supabase
        .from("estimate_option_line_items")
        .select(
          "id, estimate_option_id, estimate_id, sort_order, source_pricebook_item_id, item_name_snapshot, description_snapshot, item_type_snapshot, category_snapshot, unit_label_snapshot, quantity, unit_price_cents, line_subtotal_cents, created_at, updated_at"
        )
        .eq("estimate_option_id", opt.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (linesErr) {
        if (isMissingOptionPackageSchemaError(linesErr)) {
          return { ...opt, line_items: [] };
        }
        throw linesErr;
      }
      return { ...opt, line_items: lineItems ?? [] };
    })
  );

  return optionsWithLineItems;
}

export type EstimateLineReadResult = {
  id: string;
  estimate_id: string;
  sort_order: number;
  source_pricebook_item_id: string | null;
  item_name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: string;
  category_snapshot: string | null;
  unit_label_snapshot: string | null;
  quantity: number;
  unit_price_cents: number;
  line_subtotal_cents: number;
  created_at: string;
  updated_at: string;
};

export type EstimateOptionLineReadResult = {
  id: string;
  estimate_option_id: string;
  estimate_id: string;
  sort_order: number;
  source_pricebook_item_id: string | null;
  item_name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: string;
  category_snapshot: string | null;
  unit_label_snapshot: string | null;
  quantity: number;
  unit_price_cents: number;
  line_subtotal_cents: number;
  created_at: string;
  updated_at: string;
};

export type EstimateOptionReadResult = {
  id: string;
  estimate_id: string;
  slot_index: number;
  default_label_key: string | null;
  label: string;
  sort_order: number;
  summary: string | null;
  notes: string | null;
  subtotal_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
  line_items: EstimateOptionLineReadResult[];
};

export type EstimateReadResult = {
  id: string;
  account_owner_user_id: string;
  estimate_number: string;
  customer_id: string | null;
  location_id: string | null;
  service_case_id: string | null;
  origin_job_id: string | null;
  status: string;
  title: string;
  notes: string | null;
  subtotal_cents: number;
  total_cents: number;
  sent_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  converted_at: string | null;
  converted_job_id: string | null;
  converted_by_user_id: string | null;
  converted_invoice_id: string | null;
  // Approval response projection (V1 — set during recordEstimateApprovalResponse)
  selected_option_id: string | null;
  selected_option_label_snapshot: string | null;
  selected_option_total_cents: number | null;
  response_note: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
  proposalMode: "single_option_flat" | "multi_option_packages";
  line_items: EstimateLineReadResult[];
  options?: EstimateOptionReadResult[];
  approvalResponseSchemaReady: boolean;
  conversionSchemaReady: boolean;
  invoiceConversionSchemaReady: boolean;
};

/**
 * Load an estimate with its ordered line items and option packages.
 * Internal-user scoped: returns null if estimate is not found or belongs to
 * a different account.
 *
 * Sets proposalMode based on presence of option rows:
 * - "single_option_flat": no option packages exist (flat estimate_line_items)
 * - "multi_option_packages": option packages exist (nested line items per option)
 */
export async function getEstimateById(params: {
  estimateId: string;
  internalUser: Pick<InternalUserRow, "account_owner_user_id">;
  supabase: any;
}): Promise<EstimateReadResult | null> {
  const { data: estimate, error: estimateErr } = await params.supabase
    .from("estimates")
    .select("*")
    .eq("id", params.estimateId)
    .eq("account_owner_user_id", params.internalUser.account_owner_user_id)
    .maybeSingle();
  if (estimateErr) throw estimateErr;
  if (!estimate?.id) return null;

  // Schema-missing compatibility: normalize approval response fields
  const approvalFields = [
    "selected_option_id",
    "selected_option_label_snapshot",
    "selected_option_total_cents",
    "response_note",
  ];
  const approvalResponseSchemaReady = approvalFields.every((field) =>
    Object.prototype.hasOwnProperty.call(estimate, field)
  );
  // Always provide the fields, defaulting to null if missing
  for (const field of approvalFields) {
    if (!Object.prototype.hasOwnProperty.call(estimate, field)) {
      estimate[field] = null;
    }
  }

  // Schema-missing compatibility: normalize conversion linkage fields
  const conversionFields = ["converted_job_id", "converted_by_user_id"];
  for (const field of conversionFields) {
    if (!Object.prototype.hasOwnProperty.call(estimate, field)) {
      estimate[field] = null;
    }
  }
    const invoiceConversionSchemaReady = isEstimateToInvoiceConversionSchemaReady(estimate);
  const conversionSchemaReady = isEstimateToJobConversionSchemaReady(estimate);

  // Load flat line items (current/V1A behavior)
  const { data: lines, error: linesErr } = await params.supabase
    .from("estimate_line_items")
    .select(
      "id, estimate_id, sort_order, source_pricebook_item_id, item_name_snapshot, description_snapshot, item_type_snapshot, category_snapshot, unit_label_snapshot, quantity, unit_price_cents, line_subtotal_cents, created_at, updated_at"
    )
    .eq("estimate_id", params.estimateId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (linesErr) throw linesErr;

  // Load option packages (V1B multi-option behavior)
  const options = await loadEstimateOptions({
    estimateId: params.estimateId,
    supabase: params.supabase,
  });

  // Discriminate proposal mode based on presence of options
  const proposalMode = options.length > 0 ? "multi_option_packages" : "single_option_flat";

  const result: EstimateReadResult = {
    ...estimate,
    converted_job_id: getEstimateConvertedJobId(estimate),
    converted_by_user_id: getEstimateConvertedByUserId(estimate),
      converted_invoice_id: getEstimateConvertedInvoiceId(estimate),
    proposalMode,
    line_items: lines ?? [],
    approvalResponseSchemaReady,
    conversionSchemaReady,
      invoiceConversionSchemaReady,
  };

  // Include options only if they exist (multi-option mode)
  if (options.length > 0) {
    result.options = options;
  }

  return result;
}


// ---------------------------------------------------------------------------
// Read: list estimates by account
// ---------------------------------------------------------------------------

export type EstimateListItem = {
  id: string;
  estimate_number: string;
  customer_id: string | null;
  location_id: string | null;
  status: string;
  title: string;
  subtotal_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
  proposalMode: "single_option_flat" | "multi_option_packages";
  converted_invoice_id: string | null;
};
/**
 * List estimates for an account, most recent first.
 * Optional status filter.
 */
export async function listEstimatesByAccount(params: {
  internalUser: Pick<InternalUserRow, "account_owner_user_id">;
  status?: string | null;
  customerId?: string | null;
  supabase: any;
}): Promise<EstimateListItem[]> {
  let query = params.supabase
    .from("estimates")
    .select(
      "id, estimate_number, customer_id, location_id, status, title, subtotal_cents, total_cents, created_at, updated_at"
    )
    .eq("account_owner_user_id", params.internalUser.account_owner_user_id)
    .order("created_at", { ascending: false });

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.customerId) {
    query = query.eq("customer_id", params.customerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const estimates = (data ?? []) as EstimateListItem[];
  const estimateIds = estimates.map((estimate) => estimate.id);

  if (estimateIds.length === 0) {
    return estimates.map((estimate) => ({
      ...estimate,
      proposalMode: "single_option_flat",
    }));
  }

  let multiOptionEstimateIds = new Set<string>();
  const { data: optionRows, error: optionRowsError } = await params.supabase
    .from("estimate_options")
    .select("estimate_id")
    .in("estimate_id", estimateIds);

  if (optionRowsError) {
    if (!isMissingOptionPackageSchemaError(optionRowsError)) {
      throw optionRowsError;
    }
  } else {
    multiOptionEstimateIds = new Set(
      (optionRows ?? []).map((row: { estimate_id: string }) => row.estimate_id)
    );
  }

  return estimates.map((estimate) => ({
    ...estimate,
    proposalMode: multiOptionEstimateIds.has(estimate.id)
      ? "multi_option_packages"
      : "single_option_flat",
  }));
}
