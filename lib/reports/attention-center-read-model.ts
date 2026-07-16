import { loadFailedPaymentReconciliationItems } from "@/lib/business/failed-payment-reconciliation-read-model";
import { listFieldPaymentCollectionReportsForReconciliation } from "@/lib/business/field-payment-reconciliation-read-model";

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
};

function clean(value: unknown) { return String(value ?? "").trim(); }

export async function buildAttentionCenterReadModel(params: { admin: any; accountOwnerUserId: string }) {
  const ownerId = clean(params.accountOwnerUserId);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [paymentResult, invoiceErrorResult, staleResult, connectionResult, failedPayments, fieldReports] = await Promise.all([
    params.admin.from("internal_invoice_payments")
      .select("id, invoice_id, job_id, amount_cents, paid_at, qbo_sync_status, qbo_sync_error, processor_name")
      .eq("account_owner_user_id", ownerId).eq("payment_status", "recorded")
      .in("qbo_sync_status", ["failed", "not_synced"]).order("paid_at", { ascending: false }).limit(250),
    params.admin.from("internal_invoices")
      .select("id, job_id, invoice_number, invoice_display_number, qbo_sync_error, updated_at")
      .eq("account_owner_user_id", ownerId).eq("qbo_sync_status", "error").order("updated_at", { ascending: false }).limit(100),
    params.admin.from("internal_invoice_payments")
      .select("id, invoice_id, job_id, amount_cents, created_at, stripe_checkout_session_id")
      .eq("account_owner_user_id", ownerId).eq("payment_status", "pending").eq("processor_name", "stripe")
      .lte("created_at", staleBefore).order("created_at", { ascending: true }).limit(100),
    params.admin.from("qbo_connections")
      .select("status, last_sync_error, updated_at").eq("account_owner_user_id", ownerId).maybeSingle(),
    loadFailedPaymentReconciliationItems({ admin: params.admin, accountOwnerUserId: ownerId, limit: 250 }),
    listFieldPaymentCollectionReportsForReconciliation({ admin: params.admin, accountOwnerUserId: ownerId, limit: 250 }),
  ]);
  for (const result of [paymentResult, invoiceErrorResult, staleResult, connectionResult]) {
    if (result.error) throw new Error(`Failed to load attention center: ${result.error.message ?? "unknown error"}`);
  }

  const invoiceIds = [...new Set((paymentResult.data ?? []).map((row: any) => clean(row.invoice_id)).filter(Boolean))];
  const labelsResult = invoiceIds.length
    ? await params.admin.from("internal_invoices").select("id, invoice_number, invoice_display_number").eq("account_owner_user_id", ownerId).in("id", invoiceIds)
    : { data: [], error: null };
  if (labelsResult.error) throw new Error(`Failed to load attention invoice labels: ${labelsResult.error.message}`);
  const labels = new Map((labelsResult.data ?? []).map((row: any) => [clean(row.id), clean(row.invoice_display_number) || clean(row.invoice_number) || clean(row.id)]));

  const items: AttentionItem[] = [];
  for (const payment of paymentResult.data ?? []) {
    if (payment.qbo_sync_status === "not_synced" && clean(payment.processor_name).toLowerCase() !== "stripe") continue;
    const invoiceId = clean(payment.invoice_id); const jobId = clean(payment.job_id);
    items.push({
      id: `qbo-payment-${payment.id}`, category: "qbo_payment", severity: "critical",
      title: `QuickBooks payment needs attention · Invoice ${labels.get(invoiceId) ?? invoiceId}`,
      detail: clean(payment.qbo_sync_error) || "Collected payment has not posted to QuickBooks.",
      truth: `Money is collected in EveryStep. QuickBooks still shows the invoice open.`, occurredAt: clean(payment.paid_at) || null,
      href: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`, actionLabel: "Retry payment sync",
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
  for (const payment of staleResult.data ?? []) {
    items.push({ id: `stripe-pending-${payment.id}`, category: "stripe_pending", severity: "warning",
      title: "Stale Stripe checkout session", detail: "A Stripe checkout session has remained pending longer than 15 minutes.",
      truth: "This is not counted as collected money until Stripe confirms payment.", occurredAt: clean(payment.created_at) || null,
      href: "/reports/stripe-reconciliation", actionLabel: "Inspect Stripe session",
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
