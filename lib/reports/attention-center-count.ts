function countOf(result: { count?: number | null; error?: unknown }) {
  return result.error ? 0 : Math.max(0, Number(result.count ?? 0));
}

export async function countAttentionCenterItems(params: { supabase: any; accountOwnerUserId: string }) {
  const ownerId = String(params.accountOwnerUserId ?? "").trim();
  if (!ownerId) return 0;
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [qboFailed, qboStripeUnsent, invoiceErrors, staleStripe, fieldReports, failedAttempts, qboConnection] = await Promise.all([
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "recorded").eq("qbo_sync_status", "failed"),
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "recorded").eq("processor_name", "stripe").eq("qbo_sync_status", "not_synced"),
    params.supabase.from("internal_invoices").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("qbo_sync_status", "error"),
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "pending").eq("processor_name", "stripe").lte("created_at", staleBefore),
    params.supabase.from("field_payment_collection_reports").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).in("status", ["reported", "under_review", "needs_correction"]),
    params.supabase.from("tenant_saved_method_payment_attempts").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("attempt_kind", "scheduled_autopay").in("attempt_status", ["failed_declined", "failed_requires_action", "blocked_precondition"]).is("resolved_at", null),
    params.supabase.from("qbo_connections").select("status").eq("account_owner_user_id", ownerId).maybeSingle(),
  ]);
  return countOf(qboFailed) + countOf(qboStripeUnsent) + countOf(invoiceErrors) + countOf(staleStripe)
    + countOf(fieldReports) + countOf(failedAttempts) + (qboConnection.data?.status === "error" ? 1 : 0);
}
