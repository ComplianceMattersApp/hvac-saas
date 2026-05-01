// lib/estimates/estimate-read.ts
// Compliance Matters: Estimate V1B read boundary + helpers.
// Internal-only. Account-owner scoped. No UI, no customer/contractor visibility.

import { createAdminClient } from "@/lib/supabase/server";
import type { InternalUserRow } from "@/lib/auth/internal-user";

// ---------------------------------------------------------------------------
// Estimate number generation
// Format: EST-YYYYMMDD-<8 hex chars>  (unique per account enforced by DB index)
// ---------------------------------------------------------------------------

export function buildEstimateNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `EST-${datePart}-${suffix}`;
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
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
  line_items: EstimateLineReadResult[];
};

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

/**
 * Load an estimate with its ordered line items.
 * Internal-user scoped: returns null if estimate is not found or belongs to
 * a different account.
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

  const { data: lines, error: linesErr } = await params.supabase
    .from("estimate_line_items")
    .select(
      "id, estimate_id, sort_order, source_pricebook_item_id, item_name_snapshot, description_snapshot, item_type_snapshot, category_snapshot, unit_label_snapshot, quantity, unit_price_cents, line_subtotal_cents, created_at, updated_at"
    )
    .eq("estimate_id", params.estimateId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (linesErr) throw linesErr;

  return { ...estimate, line_items: lines ?? [] };
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
};

/**
 * List estimates for an account, most recent first.
 * Optional status filter.
 */
export async function listEstimatesByAccount(params: {
  internalUser: Pick<InternalUserRow, "account_owner_user_id">;
  status?: string | null;
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

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
