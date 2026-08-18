import { VOIDED_INVOICE_CHARGE_MARKER } from "@/lib/business/voided-invoice-charge-marker";
import { loadFailedPaymentReconciliationItems } from "@/lib/business/failed-payment-reconciliation-read-model";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";
import {
  RETRYABLE_QBO_PAYMENT_SYNC_STATUSES,
  STUCK_QBO_PAYMENT_PENDING_MS,
} from "@/lib/qbo/qbo-payment-sync";

export type AttentionItem = {
  id: string;
  category: "qbo_payment" | "qbo_invoice" | "stripe_pending";
  severity: "critical" | "warning";
  title: string;
  detail: string;
  truth: string;
  occurredAt: string | null;
  href: string;
  actionLabel: string;
  paymentId?: string | null;
  repairFindingId?: string | null;
  /** qbo_payment_unrecorded findings: adopt the QBO-collected payment into EveryStep. */
  adoptQboFindingId?: string | null;
};

function clean(value: unknown) { return String(value ?? "").trim(); }

export async function buildAttentionCenterReadModel(params: { admin: any; accountOwnerUserId: string }) {
  const ownerId = clean(params.accountOwnerUserId);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [paymentResult, invoiceErrorResult, voidDriftResult, reconciliationResult, moneyOutResult, chargedAfterVoidResult, staleResult, uncertainSavedMethodResult, connectionResult, failedPayments, fieldReports] = await Promise.all([
    // 'pending' is included and then aged below: it is written before the
    // QuickBooks call, so a push that died mid-way leaves collected money
    // unlinked and nothing else would ever surface it.
    params.admin.from("internal_invoice_payments")
      .select("id, invoice_id, job_id, amount_cents, paid_at, created_at, qbo_payment_id, qbo_sync_status, qbo_sync_error, processor_name")
      .eq("account_owner_user_id", ownerId).eq("payment_status", "recorded")
      .in("qbo_sync_status", [...RETRYABLE_QBO_PAYMENT_SYNC_STATUSES]).order("paid_at", { ascending: false }).limit(250),
    params.admin.from("internal_invoices")
      .select("id, job_id, invoice_number, invoice_display_number, qbo_sync_error, updated_at")
      .eq("account_owner_user_id", ownerId).eq("qbo_sync_status", "error").order("updated_at", { ascending: false }).limit(100),
    // Voids that have not reached QuickBooks. Tolerated separately because the
    // qbo_void_* columns may not be deployed yet — a missing column degrades to
    // "no items", never to a broken attention center.
    params.admin.from("internal_invoices")
      .select("id, job_id, invoice_number, invoice_display_number, qbo_void_status, qbo_void_error, voided_at")
      .eq("account_owner_user_id", ownerId).eq("status", "void")
      .in("qbo_void_status", ["pending", "blocked", "error"]).order("voided_at", { ascending: false }).limit(100),
    // Independent three-way reconciliation output. This is the only source here
    // that can surface problems EveryStep did not cause and would otherwise never
    // notice — a QBO invoice edited by hand, a Stripe charge we never recorded.
    params.admin.from("reconciliation_findings")
      .select("id, finding_type, severity, subject_kind, subject_id, external_system, external_id, title, detail, truth, everystep_value, external_value, amount_cents, job_id, first_seen_at")
      .eq("account_owner_user_id", ownerId).is("resolved_at", null)
      .order("first_seen_at", { ascending: false }).limit(100),
    // Money leaving that still needs a human: a live chargeback, a partial refund
    // the app cannot allocate on its own, or a reversal QuickBooks has not heard
    // about. Left un-thrown below so an undeployed migration degrades to zero
    // items rather than breaking the whole center.
    params.admin.from("internal_invoice_payments")
      .select("id, invoice_id, job_id, amount_cents, payment_status, paid_at, dispute_status, dispute_reason, stripe_refunded_amount_cents, qbo_sync_status")
      .eq("account_owner_user_id", ownerId)
      .or("dispute_status.in.(open,lost),and(stripe_refunded_amount_cents.not.is.null,payment_status.eq.recorded),and(payment_status.eq.reversed,qbo_sync_status.eq.synced)")
      .order("paid_at", { ascending: false }).limit(200),
    // Charges the Stripe webhook flagged as landing after a void. No time filter:
    // real money that cannot be attributed should surface immediately, not after
    // the 15-minute staleness window used for abandoned sessions.
    params.admin.from("internal_invoice_payments")
      .select("id, invoice_id, job_id, amount_cents, created_at, notes")
      .eq("account_owner_user_id", ownerId).eq("payment_status", "pending").eq("processor_name", "stripe")
      .like("notes", `${VOIDED_INVOICE_CHARGE_MARKER}%`).order("created_at", { ascending: false }).limit(100),
    params.admin.from("internal_invoice_payments")
      .select("id, invoice_id, job_id, amount_cents, created_at, stripe_checkout_session_id")
      .eq("account_owner_user_id", ownerId).eq("payment_status", "pending").eq("processor_name", "stripe")
      .lte("created_at", staleBefore).order("created_at", { ascending: true }).limit(100),
    // A Stripe API/network failure can leave the submit outcome unknowable.
    // These attempts remain locked and must surface distinctly from a decline:
    // the customer may already have been charged.
    params.admin.from("tenant_saved_method_payment_attempts")
      .select("id, invoice_id, amount_cents_snapshot, attempt_kind, failure_message, updated_at")
      .eq("account_owner_user_id", ownerId).eq("attempt_status", "pending")
      .eq("failure_code", "stripe_submit_outcome_unknown")
      .lte("updated_at", staleBefore).order("updated_at", { ascending: true }).limit(100),
    params.admin.from("qbo_connections")
      .select("status, last_sync_error, updated_at").eq("account_owner_user_id", ownerId).maybeSingle(),
    loadFailedPaymentReconciliationItems({ admin: params.admin, accountOwnerUserId: ownerId, limit: 250 }),
    listFieldPaymentCollectionReportsForReconciliation({ admin: params.admin, accountOwnerUserId: ownerId, limit: 250 }),
  ]);
  for (const result of [paymentResult, invoiceErrorResult, staleResult, uncertainSavedMethodResult, connectionResult]) {
    if (result.error) throw new Error(`Failed to load attention center: ${result.error.message ?? "unknown error"}`);
  }

  const invoiceIds = [...new Set([
    ...(paymentResult.data ?? []).map((row: any) => clean(row.invoice_id)),
    ...(chargedAfterVoidResult.error ? [] : (chargedAfterVoidResult.data ?? [])).map((row: any) => clean(row.invoice_id)),
    ...(moneyOutResult.error ? [] : (moneyOutResult.data ?? [])).map((row: any) => clean(row.invoice_id)),
    ...(uncertainSavedMethodResult.data ?? []).map((row: any) => clean(row.invoice_id)),
  ].filter(Boolean))];
  const labelsResult = invoiceIds.length
    ? await params.admin.from("internal_invoices").select("id, job_id, invoice_number, invoice_display_number").eq("account_owner_user_id", ownerId).in("id", invoiceIds)
    : { data: [], error: null };
  if (labelsResult.error) throw new Error(`Failed to load attention invoice labels: ${labelsResult.error.message}`);
  const labels = new Map((labelsResult.data ?? []).map((row: any) => [clean(row.id), clean(row.invoice_display_number) || clean(row.invoice_number) || clean(row.id)]));
  const jobIds = new Map((labelsResult.data ?? []).map((row: any) => [clean(row.id), clean(row.job_id)]));

  const stuckPendingBefore = new Date(Date.now() - STUCK_QBO_PAYMENT_PENDING_MS).toISOString();
  const items: AttentionItem[] = [];
  for (const payment of paymentResult.data ?? []) {
    if (payment.qbo_sync_status === "not_synced" && clean(payment.processor_name).toLowerCase() !== "stripe") continue;
    // A push in flight passes through 'pending' for a second or two — only
    // surface one that has been sitting there, and never one already linked.
    if (payment.qbo_sync_status === "pending"
      && (clean(payment.qbo_payment_id) || clean(payment.created_at) > stuckPendingBefore)) continue;
    const invoiceId = clean(payment.invoice_id); const jobId = clean(payment.job_id);
    items.push({
      id: `qbo-payment-${payment.id}`, category: "qbo_payment", severity: "critical",
      title: `QuickBooks payment link needs attention · Invoice ${labels.get(invoiceId) ?? invoiceId}`,
      detail: clean(payment.qbo_sync_error) || "Collected payment has not been linked to a QuickBooks payment.",
      truth: `Money is collected in EveryStep. QuickBooks may already contain the payment; retry adopts one exact existing match before creating anything.`, occurredAt: clean(payment.paid_at) || null,
      href: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`, actionLabel: "Open invoice",
      paymentId: clean(payment.id),
    });
  }
  for (const invoice of invoiceErrorResult.data ?? []) {
    const invoiceId = clean(invoice.id); const jobId = clean(invoice.job_id);
    items.push({ id: `qbo-invoice-${invoiceId}`, category: "qbo_invoice", severity: "critical",
      title: `QuickBooks invoice sync failed · ${clean(invoice.invoice_display_number) || clean(invoice.invoice_number) || invoiceId}`,
      detail: clean(invoice.qbo_sync_error) || "Invoice did not post to QuickBooks.", truth: "Invoice exists in EveryStep but its QuickBooks record needs attention.",
      occurredAt: clean(invoice.updated_at) || null, href: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`, actionLabel: "Open invoice sync",
    });
  }
  // voidDriftResult is intentionally excluded from the throwing guard above: the
  // qbo_void_* columns are additive, so an undeployed migration must degrade to
  // zero items rather than breaking the whole attention center.
  for (const invoice of voidDriftResult.error ? [] : (voidDriftResult.data ?? [])) {
    const invoiceId = clean(invoice.id); const jobId = clean(invoice.job_id);
    const blocked = clean(invoice.qbo_void_status) === "blocked";
    items.push({ id: `qbo-invoice-void-${invoiceId}`, category: "qbo_invoice", severity: "critical",
      title: `QuickBooks still shows a voided invoice · ${clean(invoice.invoice_display_number) || clean(invoice.invoice_number) || invoiceId}`,
      detail: clean(invoice.qbo_void_error) || "The void has not been confirmed in QuickBooks.",
      truth: blocked
        ? "This invoice is void in EveryStep, but QuickBooks has a payment applied to it — voiding there would leave that payment unapplied."
        : "This invoice is void in EveryStep. QuickBooks may still count it as open revenue.",
      occurredAt: clean(invoice.voided_at) || null, href: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`,
      actionLabel: blocked ? "Reconcile in QuickBooks" : "Retry QuickBooks void",
    });
  }
  // Reconciliation findings arrive with their copy already written, because the
  // reconciler is the only thing that saw both sides.
  for (const finding of reconciliationResult.error ? [] : (reconciliationResult.data ?? [])) {
    const jobId = clean(finding.job_id); const subjectId = clean(finding.subject_id);
    const isUnrecordedStripeCharge = clean(finding.finding_type) === "stripe_charge_unrecorded";
    const evidence = [clean(finding.everystep_value) && `EveryStep: ${clean(finding.everystep_value)}`,
      clean(finding.external_value) && `${finding.external_system === "stripe" ? "Stripe" : "QuickBooks"}: ${clean(finding.external_value)}`]
      .filter(Boolean).join(" · ");
    items.push({
      id: `reconciliation-${clean(finding.id)}`,
      category: finding.subject_kind === "payment" ? "qbo_payment" : "qbo_invoice",
      severity: clean(finding.severity) === "warning" ? "warning" : "critical",
      title: clean(finding.title),
      detail: [clean(finding.detail), evidence].filter(Boolean).join(" — "),
      truth: clean(finding.truth),
      occurredAt: clean(finding.first_seen_at) || null,
      href: jobId
        ? `/jobs/${jobId}/invoice${subjectId && (finding.subject_kind === "invoice" || isUnrecordedStripeCharge) ? `?invoice_id=${encodeURIComponent(subjectId)}` : ""}#invoice-workspace`
        : finding.external_system === "stripe" ? "/reports/stripe-reconciliation" : "/reports/invoices",
      actionLabel: "Investigate",
      repairFindingId: ["stripe_charge_unrecorded", "stripe_payment_identity_mismatch"].includes(clean(finding.finding_type))
        ? clean(finding.id)
        : null,
      adoptQboFindingId: clean(finding.finding_type) === "qbo_payment_unrecorded" ? clean(finding.id) : null,
    });
  }
  for (const payment of moneyOutResult.error ? [] : (moneyOutResult.data ?? [])) {
    const paymentId = clean(payment.id); const invoiceId = clean(payment.invoice_id); const jobId = clean(payment.job_id);
    const label = labels.get(invoiceId) ?? invoiceId;
    const href = jobId ? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace` : "/reports/payments";
    const disputeStatus = clean(payment.dispute_status);
    const amount = `$${(Number(payment.amount_cents ?? 0) / 100).toFixed(2)}`;

    if (disputeStatus === "open") {
      items.push({ id: `stripe-dispute-open-${paymentId}`, category: "qbo_payment", severity: "critical",
        title: `Payment disputed · Invoice ${label}`,
        detail: clean(payment.dispute_reason) ? `Stripe reason: ${clean(payment.dispute_reason)}` : "A chargeback was filed against this payment.",
        truth: `${amount} is held by Stripe while the dispute runs. It is still counted as collected because the dispute may be won — respond in Stripe before the deadline.`,
        occurredAt: clean(payment.paid_at) || null, href, actionLabel: "Respond in Stripe", paymentId,
      });
    } else if (disputeStatus === "lost") {
      items.push({ id: `stripe-dispute-lost-${paymentId}`, category: "qbo_payment", severity: "critical",
        title: `Dispute lost · Invoice ${label}`,
        detail: "The chargeback was decided against this account and the payment has been reversed.",
        truth: `${amount} is gone. The invoice balance has reopened; QuickBooks and job closeout may still show it paid.`,
        occurredAt: clean(payment.paid_at) || null, href, actionLabel: "Review invoice", paymentId,
      });
    } else if (clean(payment.payment_status) === "reversed") {
      items.push({ id: `qbo-reversed-payment-${paymentId}`, category: "qbo_payment", severity: "critical",
        title: `QuickBooks still shows a reversed payment · Invoice ${label}`,
        detail: "This payment was refunded or lost to a dispute, but it was already synced to QuickBooks.",
        truth: "EveryStep has reversed the money. QuickBooks still counts it as received, so its books overstate revenue until the payment is removed there.",
        occurredAt: clean(payment.paid_at) || null, href, actionLabel: "Remove payment in QuickBooks", paymentId,
      });
    } else {
      const refunded = `$${(Number(payment.stripe_refunded_amount_cents ?? 0) / 100).toFixed(2)}`;
      items.push({ id: `stripe-partial-refund-${paymentId}`, category: "qbo_payment", severity: "critical",
        title: `Partial refund needs accounting follow-up · Invoice ${label}`,
        detail: `Stripe refunded ${refunded} of a ${amount} payment.`,
        truth: "EveryStep reopened the refunded portion of the invoice balance. Confirm the refund and remaining receivable are also reflected correctly in QuickBooks.",
        occurredAt: clean(payment.paid_at) || null, href, actionLabel: "Review accounting", paymentId,
      });
    }
  }
  // Charges that landed after the invoice was voided. These sit in the same
  // pending rows as abandoned sessions, but they are the opposite situation:
  // the customer WAS charged. They must not inherit the "not collected" truth
  // statement below, so they are pulled out first and reported as critical.
  const paidAfterVoid = new Set<string>();
  for (const payment of chargedAfterVoidResult.error ? [] : (chargedAfterVoidResult.data ?? [])) {
    const paymentId = clean(payment.id);
    paidAfterVoid.add(paymentId);
    const invoiceId = clean(payment.invoice_id); const jobId = clean(payment.job_id);
    items.push({ id: `stripe-paid-after-void-${paymentId}`, category: "stripe_pending", severity: "critical",
      title: `Customer charged after the invoice was voided · ${labels.get(invoiceId) ?? invoiceId}`,
      detail: clean(payment.notes) || "A Stripe charge succeeded after this invoice was voided.",
      truth: "The customer's card WAS charged. This is deliberately not recorded against the void invoice, so it needs a refund or reallocation in Stripe.",
      occurredAt: clean(payment.created_at) || null,
      href: jobId ? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace` : "/reports/stripe-reconciliation",
      actionLabel: "Refund or reallocate in Stripe", paymentId,
    });
  }
  for (const payment of staleResult.data ?? []) {
    if (paidAfterVoid.has(clean(payment.id))) continue;
    items.push({ id: `stripe-pending-${payment.id}`, category: "stripe_pending", severity: "warning",
      title: "Stale Stripe checkout session", detail: "A Stripe checkout session has remained pending longer than 15 minutes.",
      truth: "This is not counted as collected money until Stripe confirms payment.", occurredAt: clean(payment.created_at) || null,
      href: "/reports/stripe-reconciliation", actionLabel: "Inspect Stripe session",
    });
  }
  for (const attempt of uncertainSavedMethodResult.data ?? []) {
    const attemptId = clean(attempt.id); const invoiceId = clean(attempt.invoice_id); const jobId = jobIds.get(invoiceId) ?? "";
    const amount = `$${(Number(attempt.amount_cents_snapshot ?? 0) / 100).toFixed(2)}`;
    items.push({ id: `stripe-submit-unknown-${attemptId}`, category: "stripe_pending", severity: "critical",
      title: `Stripe charge outcome is unknown Â· Invoice ${labels.get(invoiceId) ?? invoiceId}`,
      detail: clean(attempt.failure_message) || `Stripe did not return a final result for this ${amount} saved-card attempt.`,
      truth: "Do not collect again through another channel. Retry only through the original operation or verify the charge in Stripe first; the customer may already have been charged.",
      occurredAt: clean(attempt.updated_at) || null,
      href: jobId ? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace` : "/reports/payments",
      actionLabel: "Verify in Stripe",
    });
  }

  const connection = connectionResult.data ?? null;
  return {
    items: items.sort((a, b) => (Date.parse(b.occurredAt ?? "") || 0) - (Date.parse(a.occurredAt ?? "") || 0)),
    summaries: {
      qboConnectionError: connection?.status === "error" ? clean(connection.last_sync_error) || "QuickBooks reauthorization required." : null,
      failedPaymentAttempts: failedPayments.summary.openCount,
      fieldPaymentsAwaitingConfirmation: fieldReports.summary.openCount,
      systemExceptions: items.length,
      total: items.length + failedPayments.summary.openCount + fieldReports.summary.openCount + (connection?.status === "error" ? 1 : 0),
    },
  };
}
