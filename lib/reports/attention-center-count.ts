import { VOIDED_INVOICE_CHARGE_MARKER } from "@/lib/business/voided-invoice-charge-marker";

function countOf(result: { count?: number | null; error?: unknown }) {
  return result.error ? 0 : Math.max(0, Number(result.count ?? 0));
}

export async function countAttentionCenterItems(params: { supabase: any; accountOwnerUserId: string }) {
  const ownerId = String(params.accountOwnerUserId ?? "").trim();
  if (!ownerId) return 0;
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [qboFailed, qboStripeUnsent, invoiceErrors, voidDrift, reconciliation, moneyOut, chargedAfterVoid, staleStripe, uncertainSavedMethod, fieldReports, failedAttempts, qboConnection] = await Promise.all([
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "recorded").eq("qbo_sync_status", "failed"),
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "recorded").eq("processor_name", "stripe").eq("qbo_sync_status", "not_synced"),
    params.supabase.from("internal_invoices").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("qbo_sync_status", "error"),
    // Voids not confirmed in QuickBooks. countOf() already returns 0 on error, so
    // an undeployed qbo_void_* migration just contributes nothing to the badge.
    params.supabase.from("internal_invoices").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("status", "void").in("qbo_void_status", ["pending", "blocked", "error"]),
    // Open three-way reconciliation findings.
    params.supabase.from("reconciliation_findings").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).is("resolved_at", null),
    // Money leaving that needs a human: live chargeback, lost dispute, partial
    // refund, or a reversal QuickBooks has not heard about.
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId)
      .or("dispute_status.in.(open,lost),and(stripe_refunded_amount_cents.not.is.null,payment_status.eq.recorded),and(payment_status.eq.reversed,qbo_sync_status.eq.synced)"),
    // Charges that landed after a void: counted with no staleness window, since
    // this is collected money awaiting a refund decision.
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "pending").eq("processor_name", "stripe").like("notes", `${VOIDED_INVOICE_CHARGE_MARKER}%`),
    // Excluded from the stale-session count so one problem is not counted twice.
    // Safe without a null guard: pending Stripe rows always carry session notes.
    params.supabase.from("internal_invoice_payments").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("payment_status", "pending").eq("processor_name", "stripe").lte("created_at", staleBefore).not("notes", "like", `${VOIDED_INVOICE_CHARGE_MARKER}%`),
    params.supabase.from("tenant_saved_method_payment_attempts").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("attempt_status", "pending").eq("failure_code", "stripe_submit_outcome_unknown").lte("updated_at", staleBefore),
    params.supabase.from("field_payment_collection_reports").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).in("status", ["reported", "under_review", "needs_correction"]),
    params.supabase.from("tenant_saved_method_payment_attempts").select("id", { count: "exact", head: true }).eq("account_owner_user_id", ownerId).eq("attempt_kind", "scheduled_autopay").in("attempt_status", ["failed_declined", "failed_requires_action", "blocked_precondition"]).is("resolved_at", null),
    params.supabase.from("qbo_connections").select("status").eq("account_owner_user_id", ownerId).maybeSingle(),
  ]);
  return countOf(qboFailed) + countOf(qboStripeUnsent) + countOf(invoiceErrors) + countOf(voidDrift) + countOf(reconciliation) + countOf(moneyOut) + countOf(chargedAfterVoid) + countOf(staleStripe) + countOf(uncertainSavedMethod)
    + countOf(fieldReports) + countOf(failedAttempts) + (qboConnection.data?.status === "error" ? 1 : 0);
}
