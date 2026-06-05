import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
import {
  hasFieldPaymentCollectionAccess,
  hasDirectInvoiceDraftMutationAccess,
  hasInvoiceIssueAccess,
  hasInvoiceSendAccess,
  resolveFieldBillingCapabilities,
} from "@/lib/auth/field-billing-access";
import { createClient } from "@/lib/supabase/server";
import { resolveJobDetailActor } from "@/lib/actions/internal-job-detail-read-boundary";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import {
  type BillingMode,
  resolveBillingModeByAccountOwnerId,
} from "@/lib/business/internal-business-profile";
import {
  normalizeInternalInvoiceStatus,
  resolveInternalInvoiceById,
  resolveInternalInvoiceByJobId,
  resolveInternalInvoiceFamilySummaryByJobId,
  resolveLatestVoidedInternalInvoiceByJobId,
  type InternalInvoiceItemType,
  type InternalInvoiceStatus,
} from "@/lib/business/internal-invoice";
import {
  resolveInternalInvoiceEmailDeliveries,
  type InternalInvoiceEmailDeliveryRecord,
} from "@/lib/business/internal-invoice-delivery";
import {
  resolveInvoiceCollectedPaymentLedger,
  type InternalInvoicePaymentRow,
} from "@/lib/business/internal-invoice-payments";
import { loadFailedAutopayAttentionItems } from "@/lib/business/failed-autopay-attention-read-model";
import { runScheduledAutopayEligibilityDryRun } from "@/lib/business/scheduled-autopay-eligibility";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import {
  addInternalInvoiceLineItemFromForm,
  addInternalInvoiceLineItemFromPricebookForm,
  addInternalInvoiceLineItemsFromVisitScopeForm,
  createSupplementalInternalInvoiceFromForm,
  createInternalInvoiceDraftFromForm,
  issueInternalInvoiceFromForm,
  removeInternalInvoiceLineItemFromForm,
  saveInternalInvoiceDraftFromForm,
  sendInternalInvoiceEmailFromForm,
  updateInternalInvoiceLineItemFromForm,
  voidInternalInvoiceFromForm,
} from "@/lib/actions/internal-invoice-actions";
import {
  collectIssuedInvoiceCardPaymentFromForm,
  collectTenantInvoicePaymentNowFromForm,
  recordInternalInvoicePaymentFromForm,
  reverseInternalInvoicePaymentFromForm,
} from "@/lib/actions/internal-invoice-payment-actions";
import {
  chargeSavedCardForIssuedInvoiceFromForm,
  retryFailedScheduledAutopayAttemptFromForm,
} from "@/lib/actions/customer-saved-payment-method-actions";
import TenantInvoicePaymentLinkPanel from "./_components/TenantInvoicePaymentLinkPanel";
import SupplementalInvoiceFamilySection from "../_components/SupplementalInvoiceFamilySection";
import InternalInvoiceLineItemsTable, {
  InternalInvoiceDraftSaveForm,
} from "../_components/InternalInvoiceLineItemsTable";
import {
  sanitizeVisitScopeItemId,
  sanitizeVisitScopeItems,
} from "@/lib/jobs/visit-scope";
import { formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";
import { resolveInvoicePaymentLinkUiState } from "./invoice-payment-link-ui";

type SearchParams = Record<string, string | string[] | undefined>;

const panelClass =
  "rounded-3xl border border-slate-300/80 bg-white shadow-[0_22px_48px_-38px_rgba(15,23,42,0.34)] ring-1 ring-slate-200/70";
const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,background-color] focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 [color-scheme:light]";
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_18px_30px_-20px_rgba(37,99,235,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]";
const darkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]";
const chipClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600";

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatCurrencyFromCents(cents?: number | null) {
  const amount = Number(cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatCurrencyFromAmount(amount?: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount ?? 0) || 0);
}

function formatDecimalInput(value?: number | null) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return "0.00";
  return normalized.toFixed(2);
}

function formatInternalInvoiceStatus(status?: InternalInvoiceStatus | null) {
  if (status === "issued") return "Issued";
  if (status === "void") return "Void";
  return "Draft";
}

function formatInternalInvoiceItemType(type?: InternalInvoiceItemType | string | null) {
  const normalized = String(type ?? "").trim().toLowerCase();
  if (!normalized) return "Service";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatPaymentMethodLabel(method?: string | null) {
  const normalized = String(method ?? "").trim().replace(/_/g, " ");
  if (!normalized) return "Method unavailable";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatPaymentStatusLabel(status?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "recorded") return "Recorded";
  if (normalized === "failed") return "Failed";
  if (normalized === "reversed") return "Reversed";
  if (normalized === "pending") return "Pending";
  return "Unknown";
}

function formatAutopayAttentionCategoryLabel(category?: string | null) {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (normalized === "payment_declined") return "Payment Declined";
  if (normalized === "authentication_required") return "Authentication Required";
  if (normalized === "precondition_blocked") return "Setup Blocked";
  return "Unknown Failure";
}

function formatAutopayAttentionActionLabel(action?: string | null) {
  const normalized = String(action ?? "").trim().toLowerCase();
  if (normalized === "review_payment_method") return "Review payment method";
  if (normalized === "request_customer_authentication") return "Request customer authentication";
  if (normalized === "fix_payment_setup") return "Fix payment setup";
  if (normalized === "retry_after_review") return "Retry after review";
  return "No action available";
}

function formatSupplementalReasonLabel(reason?: string | null) {
  const normalized = String(reason ?? "").trim();
  if (!normalized) return null;

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isStripeSourcedPayment(payment: InternalInvoicePaymentRow) {
  return (
    String(payment.payment_method ?? "").trim() === "card_stripe_online" ||
    String(payment.processor_name ?? "").trim().toLowerCase() === "stripe" ||
    String(payment.stripe_event_id ?? "").trim().length > 0 ||
    String(payment.stripe_checkout_session_id ?? "").trim().length > 0 ||
    String(payment.stripe_payment_intent_id ?? "").trim().length > 0
  );
}

function formatBillingAddress(a: {
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
}) {
  return [
    a.billing_address_line1,
    a.billing_address_line2,
    [a.billing_city, a.billing_state, a.billing_zip].filter(Boolean).join(" "),
  ].filter((value) => String(value ?? "").trim().length > 0);
}

function bannerMessage(value?: string | null) {
  const key = String(value ?? "").trim().toLowerCase();
  const messages: Record<string, string> = {
    internal_invoice_draft_created: "Draft invoice created.",
    internal_invoice_supplemental_draft_created: "Supplemental draft invoice created.",
    internal_invoice_selection_invalid: "Requested invoice selection is unavailable. Showing the default invoice workspace.",
    internal_invoice_draft_exists: "A draft invoice already exists for this job.",
    internal_invoice_issued: "Invoice issued. Send it to the billing recipient when ready.",
    internal_invoice_issue_blocked: "Invoice cannot be issued until job and field work are complete.",
    internal_invoice_issue_incomplete: "Review recipient, charges, and total before issuing.",
    internal_invoice_email_sent: "Invoice email sent.",
    internal_invoice_email_resent: "Invoice email resent.",
    internal_invoice_email_failed: "Invoice email failed to send.",
    internal_invoice_send_recipient_required: "Billing recipient email is required before sending.",
    internal_invoice_send_recipient_invalid: "Enter a valid billing recipient email before sending.",
    internal_invoice_payment_recorded: "Tracking-only payment recorded.",
    internal_invoice_payment_overpay_denied: "Payment amount cannot exceed the remaining balance.",
    internal_invoice_payment_reversed: "Recorded payment reversed from Compliance Matters totals.",
    internal_invoice_payment_reversal_reason_required: "A reversal reason is required.",
    internal_invoice_payment_reversal_not_found: "Payment record was not found.",
    internal_invoice_payment_reversal_already_reversed: "This payment is already reversed.",
    internal_invoice_payment_reversal_failed_blocked: "Failed payment attempts cannot be reversed.",
    internal_invoice_payment_reversal_not_recorded: "Only recorded payments can be reversed.",
    internal_invoice_payment_reversal_online_blocked:
      "Online Stripe payments cannot be reversed here. Use Stripe refund/reversal workflows and let webhooks update records.",
    internal_invoice_voided: "Invoice voided.",
    internal_invoice_missing: "Invoice was not found.",
    internal_invoice_saved_card_charge_denied: "You do not have permission to charge a saved card for this invoice.",
    internal_invoice_saved_card_charge_invalid: "Saved-card charge request was invalid.",
    internal_invoice_saved_card_charge_connect_not_ready: "Saved-card charge is unavailable until Stripe Connect is ready.",
    internal_invoice_saved_card_charge_missing_saved_method: "No active saved card is available for this customer.",
    internal_invoice_saved_card_charge_missing_authorization:
      "Saved-card reuse authorization was not found for this payment method.",
    internal_invoice_saved_card_charge_inflight: "A saved-card charge attempt is already in progress for this invoice.",
    internal_invoice_saved_card_charge_requires_issued: "Invoice must be issued before charging a saved card.",
    internal_invoice_saved_card_charge_no_balance_due: "Invoice has no balance due.",
    internal_invoice_saved_card_charge_submitted:
      "Saved-card charge submitted to Stripe. Payment records update only after webhook confirmation.",
    internal_invoice_saved_card_charge_failed_declined:
      "Saved-card charge was declined by Stripe. Invoice payment records were not marked paid.",
    internal_invoice_saved_card_charge_failed_requires_action:
      "Saved-card charge requires customer action. No automatic retry was scheduled.",
    internal_invoice_saved_card_charge_failed: "Saved-card charge failed before submission to Stripe.",
    internal_invoice_failed_autopay_retry_denied: "You do not have permission to retry this scheduled autopay attempt.",
    internal_invoice_failed_autopay_retry_invalid: "Failed-autopay retry request was invalid.",
    internal_invoice_failed_autopay_retry_blocked:
      "Failed-autopay retry is currently blocked by invoice or payment readiness checks.",
    internal_invoice_failed_autopay_retry_submitted:
      "Failed-autopay retry submitted to Stripe. Payment records update only after webhook confirmation.",
    internal_invoice_failed_autopay_retry_failed_declined:
      "Failed-autopay retry was declined by Stripe. Invoice payment records were not marked paid.",
    internal_invoice_failed_autopay_retry_failed_requires_action:
      "Failed-autopay retry requires customer action. No automatic retry was scheduled.",
    field_payment_reported:
      "Payment report submitted for office reconciliation. Invoice balance updates after the payment is verified.",
    field_payment_report_invalid: "Payment report request was invalid.",
    field_payment_report_requires_issued: "Invoice must be issued before reporting field payment collection.",
    field_payment_report_method_invalid: "Select check, cash, or other for field-reported collection.",
    field_payment_report_amount_invalid: "Enter a valid payment amount greater than zero.",
    field_payment_report_no_balance_due: "Invoice has no balance due to report.",
    field_payment_report_overpay_denied: "Reported amount cannot exceed the current invoice balance due.",
    field_payment_verification_not_found: "Field payment report was not found.",
    field_payment_verification_invalid: "Field payment verification request was invalid.",
    field_payment_verification_self_denied: "The reporting user cannot verify their own field payment report.",
    field_payment_verification_status_closed:
      "This field payment report is no longer open for verification. Refresh to view current status.",
    field_payment_verification_terminal:
      "This field payment report is already closed and cannot be verified again.",
    field_payment_verification_method_invalid:
      "Only check, cash, and other field payment reports can be verified in this flow.",
    field_payment_verification_requires_issued: "Invoice must remain issued before verification can finalize payment truth.",
    field_payment_verification_no_balance_due: "Invoice has no balance due. This report cannot be verified into payment truth.",
    field_payment_verification_overpay_denied:
      "Reported amount exceeds current invoice balance due and cannot be verified.",
    field_payment_verified:
      "Field payment verified. Final payment truth was recorded and invoice totals were updated through the payment register path.",
    field_payment_verification_verified:
      "Field payment verified. Final payment truth was recorded and invoice totals were updated through the payment register path.",
    field_payment_verification_rejection_reason_required: "A rejection reason is required to reject this field payment report.",
    field_payment_rejected:
      "Field payment report rejected. No final payment truth was created and invoice balance was unchanged.",
    field_payment_verification_rejected:
      "Field payment report rejected. No final payment truth was created and invoice balance was unchanged.",
  };
  return messages[key] ?? null;
}

function readinessRow(label: string, ready: boolean, detail: string) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
      <div>
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-600">{detail}</div>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        {ready ? "Ready" : "Needed"}
      </span>
    </div>
  );
}

function resolveInvoiceRevenueWorkflowRail(params: {
  hasInvoice: boolean;
  invoiceStatus: InternalInvoiceStatus | null;
  balanceDueCents: number;
  hasFailedAutopayAttention: boolean;
}) {
  if (!params.hasInvoice) {
    return {
      stage: "No invoice draft",
      next: "Create Draft Invoice to start billing charges.",
    };
  }

  if (params.invoiceStatus === "draft") {
    return {
      stage: "Draft invoice",
      next: "Review readiness checks, then issue when recipient, charges, and total are ready.",
    };
  }

  if (params.invoiceStatus === "issued") {
    if (params.hasFailedAutopayAttention) {
      return {
        stage: "Issued with payment attention",
        next: "Review payment failure details before retrying collection.",
      };
    }

    if (params.balanceDueCents > 0) {
      return {
        stage: "Issued and unpaid",
        next: "Collect payment by link, saved card, or manual record.",
      };
    }

    return {
      stage: "Issued and paid",
      next: "Review payment history and delivery audit details if needed.",
    };
  }

  if (params.invoiceStatus === "void") {
    return {
      stage: "Voided",
      next: "Start a replacement draft only when corrected billed scope is ready.",
    };
  }

  return {
    stage: "Invoice workflow",
    next: "Review current invoice state and continue the documented billing sequence.",
  };
}

export default async function InternalInvoiceWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const banner = firstSearchValue(sp.banner);
  const requestedInvoiceId = firstSearchValue(sp.invoice_id) ?? firstSearchValue(sp.supplemental_invoice_id);
  const checkoutSessionId = firstSearchValue(sp.checkout_session_id);
  const checkoutSessionUrl = firstSearchValue(sp.checkout_session_url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const actorResolution = await resolveJobDetailActor({
    supabase,
    userId: user.id,
  });

  if (actorResolution.kind === "contractor") {
    redirect(`/portal/jobs/${jobId}`);
  }

  if (actorResolution.kind !== "internal" || !actorResolution.internalUser) {
    redirect("/login");
  }

  const internalUser = actorResolution.internalUser;
  const scopedReadJob = await loadScopedInternalJobDetailReadBoundary({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });

  if (!scopedReadJob?.id) notFound();

  const billingMode: BillingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== "internal_invoicing") {
    redirect(`/jobs/${jobId}?tab=info&banner=internal_invoicing_billing_pending#internal-invoice-panel`);
  }

  const tenantStripeReadiness = await resolveTenantStripeConnectReadiness(
    internalUser.account_owner_user_id,
    supabase,
  );

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(`
      id,
      job_display_number,
      title,
      status,
      field_complete,
      job_type,
      ops_status,
      customer_id,
      location_id,
      service_case_id,
      customer_first_name,
      customer_last_name,
      customer_email,
      customer_phone,
      visit_scope_items,
      locations:location_id (
        address_line1,
        address_line2,
        city,
        state,
        zip
      )
    `)
    .eq("id", jobId)
    .single();

  if (jobErr) throw jobErr;
  if (!job?.id) notFound();

  const currentPrimaryInvoice = await resolveInternalInvoiceByJobId({ supabase, jobId });
  const requestedInvoice = requestedInvoiceId
    ? await resolveInternalInvoiceById({
        supabase,
        invoiceId: requestedInvoiceId,
      })
    : null;
  const canUseRequestedInvoice = Boolean(
    requestedInvoice
    && requestedInvoice.account_owner_user_id === internalUser.account_owner_user_id
    && requestedInvoice.job_id === jobId,
  );
  const invoice = canUseRequestedInvoice ? requestedInvoice : currentPrimaryInvoice;
  const invalidRequestedInvoiceSelection = Boolean(requestedInvoiceId && !canUseRequestedInvoice);

  const latestVoidedInternalInvoice = !invoice
    ? await resolveLatestVoidedInternalInvoiceByJobId({ supabase, jobId })
    : null;

  const [internalInvoiceEmailDeliveries, internalInvoicePaymentLedger, pricebookPickerItems] = invoice
    ? await Promise.all([
        resolveInternalInvoiceEmailDeliveries({
          supabase,
          jobId,
          invoiceId: invoice.id,
        }),
        resolveInvoiceCollectedPaymentLedger(
          internalUser.account_owner_user_id,
          invoice.id,
          supabase,
        ),
        invoice.status === "draft"
          ? (async () => {
              const { data: rows, error } = await supabase
                .from("pricebook_items")
                .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
                .eq("account_owner_user_id", internalUser.account_owner_user_id)
                .eq("is_active", true)
                .in("item_type", ["service", "material", "diagnostic"])
                .gte("default_unit_price", 0)
                .order("item_name", { ascending: true });
              if (error) throw error;
              return (rows ?? []).map((row: any) => ({
                id: String(row?.id ?? "").trim(),
                item_name: String(row?.item_name ?? "").trim(),
                item_type: String(row?.item_type ?? "").trim() || "service",
                category: String(row?.category ?? "").trim() || null,
                default_description: String(row?.default_description ?? "").trim() || null,
                default_unit_price: Number(row?.default_unit_price ?? 0) || 0,
                unit_label: String(row?.unit_label ?? "").trim() || null,
              }));
            })()
          : Promise.resolve([]),
      ])
    : [[], null, []];
  const invoiceFamilySummary = invoice
    ? await resolveInternalInvoiceFamilySummaryByJobId({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        jobId,
      })
    : null;
  const supplementalInvoiceFamilyItems = (invoiceFamilySummary?.supplementalInvoices ?? []).map((familyInvoice) => ({
    id: familyInvoice.id,
    invoiceDisplayNumber: familyInvoice.invoice_display_number,
    invoiceNumber: familyInvoice.invoice_number,
    status: familyInvoice.status,
    totalCents: familyInvoice.total_cents,
    balanceDueCents: familyInvoice.balance_due_cents,
    supplementalReason: familyInvoice.supplemental_reason,
    workspaceHref: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(familyInvoice.id)}#invoice-workspace`,
    isSelected: familyInvoice.id === invoice?.id,
  }));

  const rawVisitScopeRows = Array.isArray((job as any).visit_scope_items)
    ? (job as any).visit_scope_items
    : [];
  const existingVisitScopeInvoiceSourceIds = new Set(
    (invoice?.line_items ?? [])
      .filter((lineItem) => lineItem.source_kind === "visit_scope")
      .map((lineItem) => sanitizeVisitScopeItemId(lineItem.source_visit_scope_item_id))
      .filter(Boolean) as string[],
  );
  const visitScopePickerItems = rawVisitScopeRows
    .map((rawRow: any) => {
      const persistedItemId = sanitizeVisitScopeItemId(rawRow?.id);
      if (!persistedItemId) return null;
      let sanitizedRows: ReturnType<typeof sanitizeVisitScopeItems> = [];
      try {
        sanitizedRows = sanitizeVisitScopeItems([rawRow]);
      } catch {
        return null;
      }
      const sanitizedRow = sanitizedRows[0];
      if (!sanitizedRow) return null;
      return {
        id: persistedItemId,
        title: sanitizedRow.title,
        details: sanitizedRow.details,
        kind: sanitizedRow.kind,
        alreadyAdded: existingVisitScopeInvoiceSourceIds.has(persistedItemId),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      title: string;
      details: string | null;
      kind: "primary" | "companion_service";
      alreadyAdded: boolean;
    }>;

  const customerName = formatPersonNamePart(
    [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ") || "Customer",
  );
  const location = Array.isArray((job as any).locations)
    ? (job as any).locations.find(Boolean)
    : (job as any).locations;
  const locationLabel = [
    location?.address_line1,
    [location?.city, location?.state, location?.zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const lineItemCount = invoice?.line_items?.length ?? 0;
  const billingAddress = invoice ? formatBillingAddress(invoice) : [];
  const recipientReady = Boolean(String(invoice?.billing_name ?? "").trim());
  const chargesReady = lineItemCount > 0;
  const totalReady = Number(invoice?.total_cents ?? 0) > 0;
  const jobReady = Boolean(job.field_complete) && String(job.status ?? "").toLowerCase() === "completed";
  const isDraft = invoice?.status === "draft";
  const canIssue = Boolean(invoice && isDraft && recipientReady && chargesReady && totalReady && jobReady);
  const latestSuccessfulInternalInvoiceEmailDelivery =
    (internalInvoiceEmailDeliveries as InternalInvoiceEmailDeliveryRecord[]).find((delivery) => delivery.status === "sent") ?? null;
  const internalInvoicePaymentRows: InternalInvoicePaymentRow[] = internalInvoicePaymentLedger?.rows ?? [];
  const paymentSummary = internalInvoicePaymentLedger?.summary ?? null;
  const canManageFinancialInvoiceLifecycle = canManageInvoiceLifecycle({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
  });
  const canAccessDraftLineWorkspace = hasDirectInvoiceDraftMutationAccess(fieldBillingCapabilities);
  const canIssueInvoiceLifecycle = hasInvoiceIssueAccess(fieldBillingCapabilities);
  const canSendInvoiceLifecycle = hasInvoiceSendAccess(fieldBillingCapabilities);
  const canCreateDraftInvoice = Boolean(
    fieldBillingCapabilities.can_create_direct_invoice_draft || canManageFinancialInvoiceLifecycle,
  );
  const canCreateSupplementalDraftFromCurrentInvoice = Boolean(
    invoice
    && invoice.invoice_kind === "primary"
    && invoice.status === "issued"
    && canManageFinancialInvoiceLifecycle,
  );
  const supplementalParentInvoiceId = canCreateSupplementalDraftFromCurrentInvoice && invoice
    ? invoice.id
    : null;
  const canCollectFieldPaymentAccess = hasFieldPaymentCollectionAccess(fieldBillingCapabilities);
  const canCollectCardPaymentAccess = fieldBillingCapabilities.can_collect_card_payment;

  const invoiceCustomerId = String(invoice?.customer_id ?? "").trim() || null;
  const savedCardMethodRows =
    invoice
    && invoice.status === "issued"
    && invoiceCustomerId
    && canManageFinancialInvoiceLifecycle
      ? await (async () => {
          const { data, error } = await supabase
            .from("tenant_customer_payment_methods")
            .select("id, is_default, payment_method_status, display_brand, display_last4")
            .eq("account_owner_user_id", internalUser.account_owner_user_id)
            .eq("customer_id", invoiceCustomerId)
            .eq("payment_method_status", "active")
            .order("is_default", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(3);

          if (error) {
            throw error;
          }

          return Array.isArray(data) ? data : [];
        })()
      : [];

  const defaultSavedCardMethod = savedCardMethodRows[0] ?? null;
  const hasActiveSavedCard = Boolean(defaultSavedCardMethod?.id);
  const paymentStatusLabel = paymentSummary?.paymentStatus === "paid"
    ? "Paid"
    : paymentSummary?.paymentStatus === "partial"
    ? "Partially Paid"
    : "Unpaid";
  const returnTo = invoice
    ? `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoice.id)}#invoice-workspace`
    : `/jobs/${jobId}/invoice#invoice-workspace`;
  const effectiveBanner = !banner && invalidRequestedInvoiceSelection
    ? "internal_invoice_selection_invalid"
    : banner;
  const bannerText = bannerMessage(effectiveBanner);
  const invoicePaymentLinkUiState = resolveInvoicePaymentLinkUiState({
    billingMode,
    invoiceStatus: normalizeInternalInvoiceStatus(invoice?.status ?? null),
    balanceDueCents: paymentSummary?.balanceDueCents ?? 0,
    connectReady: tenantStripeReadiness.isReady,
  });
  const checkoutSessionUrlFromQuery = String(checkoutSessionUrl ?? "").trim() || null;
  const checkoutSessionIdFromQuery = String(checkoutSessionId ?? "").trim() || null;
  const canShowManualSavedCardCharge = Boolean(
    invoice
    && invoice.status === "issued"
    && Number(paymentSummary?.balanceDueCents ?? 0) > 0
    && !String(invoice.status ?? "").trim().toLowerCase().includes("void")
    && hasActiveSavedCard
    && tenantStripeReadiness.isReady
    && canManageFinancialInvoiceLifecycle,
  );
  const hasOutstandingInvoiceBalance = Number(paymentSummary?.balanceDueCents ?? 0) > 0;
  const canShowFieldCollectionSection = Boolean(
    invoice
    && invoice.status === "issued"
    && hasOutstandingInvoiceBalance
    && canCollectFieldPaymentAccess
    && !canManageFinancialInvoiceLifecycle,
  );

  const failedAutopayAttention = invoice
    ? await loadFailedAutopayAttentionItems({
        admin: supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        invoiceId: invoice.id,
        limit: 8,
      })
    : null;
  const failedAutopayAttentionItems = failedAutopayAttention?.items ?? [];
  const failedAutopayRetryEligibility =
    invoice && failedAutopayAttentionItems.length > 0 && canManageFinancialInvoiceLifecycle
      ? await runScheduledAutopayEligibilityDryRun({
          accountOwnerUserId: internalUser.account_owner_user_id,
          supabase,
          candidateInvoiceIds: [invoice.id],
        })
      : null;
  const canShowFailedAutopayRetryControl = Boolean(
    invoice
    && canManageFinancialInvoiceLifecycle
    && failedAutopayAttentionItems.length > 0
    && failedAutopayRetryEligibility?.eligibleInvoicesCount,
  );
  const recordedInternalInvoicePaymentRows = internalInvoicePaymentRows.filter(
    (payment) => payment.payment_status === "recorded",
  );
  const nonRecordedInternalInvoicePaymentRows = internalInvoicePaymentRows.filter(
    (payment) => payment.payment_status !== "recorded",
  );
  const nextActionSummary = !invoice
    ? "Create a draft invoice to start billing."
    : invoice.status === "draft"
      ? canIssue
        ? "Issue the invoice when the readiness checks are all ready."
        : "Review the readiness checks before issuing the invoice."
      : failedAutopayAttentionItems.length > 0
        ? "Payment failed - invoice is still unpaid. Review before retrying."
        : Number(paymentSummary?.balanceDueCents ?? 0) > 0
          ? "Create a payment link, charge the saved card once, or record a manual payment."
          : "Invoice is paid. Review payment history or audit details if needed.";
  const invoiceRevenueWorkflowRail = resolveInvoiceRevenueWorkflowRail({
    hasInvoice: Boolean(invoice),
    invoiceStatus: normalizeInternalInvoiceStatus(invoice?.status ?? null),
    balanceDueCents: Number(paymentSummary?.balanceDueCents ?? 0),
    hasFailedAutopayAttention: failedAutopayAttentionItems.length > 0,
  });
  const invoiceHeaderReference = invoice
    ? formatInvoiceDisplayReference({
        invoiceDisplayNumber: (invoice as { invoice_display_number?: string | null }).invoice_display_number,
        invoiceNumber: invoice.invoice_number,
        invoiceId: invoice.id,
      })
    : "Start Internal Invoice";
  const legacyInvoiceReference = invoice
    ? String(invoice.invoice_number ?? "").trim() || null
    : null;
  const supplementalReasonLabel = formatSupplementalReasonLabel(invoice?.supplemental_reason);

  return (
    <div id="invoice-workspace" className="mx-auto max-w-[92rem] space-y-5 bg-slate-50/45 p-4 sm:p-5 lg:p-6">
      <section className={`${panelClass} overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800">
              Invoice Summary
            </div>
            <h1 className="mt-3 text-[clamp(1.45rem,2.2vw,2rem)] font-semibold tracking-[-0.02em] text-slate-950">
              {invoiceHeaderReference}
            </h1>
            {legacyInvoiceReference ? (
              <div className="mt-1 text-xs font-medium tracking-[0.03em] text-slate-500">
                Legacy ref: {legacyInvoiceReference}
              </div>
            ) : null}
            <div className="mt-1 text-sm leading-6 text-slate-600">
              {job.title || "Job"} / {customerName}{locationLabel ? ` / ${locationLabel}` : ""}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{nextActionSummary}</p>
            {invoice?.invoice_kind === "supplemental" ? (
              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2 text-sm text-blue-900">
                Viewing supplemental invoice context.
                {supplementalReasonLabel ? ` Reason: ${supplementalReasonLabel}.` : ""}
              </div>
            ) : null}
            <div className="mt-3 rounded-xl border border-slate-200/85 bg-slate-50/85 px-4 py-3 text-sm text-slate-700">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Revenue Workflow Rail</p>
              <p className="mt-1">
                <span className="font-semibold text-slate-900">Stage:</span> {invoiceRevenueWorkflowRail.stage}.
                <span className="ml-2 font-semibold text-slate-900">Next:</span> {invoiceRevenueWorkflowRail.next}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className={chipClass}>{invoice ? formatInternalInvoiceStatus(invoice.status) : "No draft"}</span>
              <span className={chipClass}>{lineItemCount} charge{lineItemCount === 1 ? "" : "s"}</span>
              <span className={chipClass}>{formatCurrencyFromCents(invoice?.total_cents ?? 0)}</span>
              {latestSuccessfulInternalInvoiceEmailDelivery ? <span className={chipClass}>Sent</span> : null}
              {paymentSummary ? <span className={chipClass}>{paymentStatusLabel}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href={`/jobs/${jobId}?tab=info#internal-invoice-panel`} className={secondaryButtonClass}>
              Back to Job
            </Link>
            {invoice ? (
              <Link
                href={`/jobs/${jobId}/invoice/print`}
                target="_blank"
                rel="noreferrer"
                className={secondaryButtonClass}
              >
                Print / Save PDF
              </Link>
            ) : null}
            {invoice ? (
              <Link href="#invoice-charges" className={darkButtonClass}>
                Open Invoice Lines
              </Link>
            ) : null}
          </div>
        </div>

        {bannerText ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
            {bannerText}
          </div>
        ) : null}

        {latestVoidedInternalInvoice ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
            A previous invoice was voided. Start a replacement draft when the corrected billed scope is ready.
          </div>
        ) : null}

        <SupplementalInvoiceFamilySection
          items={supplementalInvoiceFamilyItems}
          description="Primary invoice controls stay focused on the current invoice. Supplemental invoices remain read-only family context here."
        />

        {supplementalParentInvoiceId ? (
          <section className="mt-4 rounded-xl border border-emerald-200/90 bg-emerald-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">Add-On Invoice</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-emerald-950">Create Add-On Invoice</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              Use this when the customer adds work or a charge after this invoice was issued or paid. The original invoice stays unchanged.
            </p>
            <form action={createSupplementalInternalInvoiceFromForm} className="mt-3 space-y-3">
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="invoice_id" value={supplementalParentInvoiceId} />
              <input type="hidden" name="original_internal_invoice_id" value={supplementalParentInvoiceId} />
              <input type="hidden" name="tab" value="info" />
              <input type="hidden" name="return_to" value={returnTo} />
              <div>
                <label className={labelClass}>Reason for add-on invoice</label>
                <textarea
                  name="supplemental_reason"
                  rows={3}
                  className={`${inputClass} min-h-[5.5rem]`}
                  placeholder="Customer added warranty, service plan, or additional work."
                />
              </div>
              <SubmitButton loadingText="Creating..." className={darkButtonClass}>
                Create Add-On Invoice
              </SubmitButton>
            </form>
          </section>
        ) : null}
      </section>

      {!invoice ? (
        <section className={`${panelClass} p-5 sm:p-6`}>
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Billing Start</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">No draft invoice yet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create a draft invoice to build billed charges from Work Items, Pricebook items, or custom charges.
            </p>
            {canCreateDraftInvoice ? (
              <form action={createInternalInvoiceDraftFromForm} className="mt-4">
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="tab" value="info" />
                <input type="hidden" name="return_to" value={returnTo} />
                <SubmitButton loadingText="Creating..." className={darkButtonClass}>
                  Create Draft Invoice
                </SubmitButton>
              </form>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm leading-6 text-slate-600">
                Draft creation requires direct invoice draft authority.
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.32fr)_minmax(22rem,0.68fr)]">
          <main className="flex flex-col gap-5">
            <section id="invoice-charges" className={`${panelClass} order-40 p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Invoice Lines</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Charges</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Invoice Charges are billed commercial scope. Work Items are operational scope and can be imported as draft charges.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                  Total {formatCurrencyFromCents(invoice.total_cents)}
                </div>
              </div>

              {invoice.status === "draft" && canAccessDraftLineWorkspace ? (
                <InternalInvoiceLineItemsTable
                  jobId={jobId}
                  selectedInvoiceId={invoice.id}
                  tab="info"
                  capabilities={fieldBillingCapabilities}
                  lineItems={invoice.line_items}
                  totalCents={invoice.total_cents}
                  addLineItemAction={addInternalInvoiceLineItemFromForm}
                  addPricebookLineItemAction={addInternalInvoiceLineItemFromPricebookForm}
                  addVisitScopeLineItemsAction={addInternalInvoiceLineItemsFromVisitScopeForm}
                  updateLineItemAction={updateInternalInvoiceLineItemFromForm}
                  removeLineItemAction={removeInternalInvoiceLineItemFromForm}
                  pricebookPickerItems={pricebookPickerItems}
                  visitScopePickerItems={visitScopePickerItems}
                  workspaceFieldLabelClass={labelClass}
                  workspaceInputClass={inputClass}
                  primaryButtonClass={primaryButtonClass}
                  secondaryButtonClass={secondaryButtonClass}
                />
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/75">
                  {invoice.status === "draft" && !canAccessDraftLineWorkspace ? (
                    <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Draft invoice lines are view-only under your current permissions.
                    </div>
                  ) : null}
                  {invoice.line_items.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-slate-600">No invoice lines were recorded on this invoice.</div>
                  ) : (
                    <div className="divide-y divide-slate-200/80">
                      {invoice.line_items.map((lineItem, index) => (
                        <div key={lineItem.id} className="bg-white/90 px-4 py-4">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1.7fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)]">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line {index + 1}</div>
                              <div className="mt-1 text-sm font-semibold text-slate-950">{lineItem.item_name_snapshot}</div>
                              {lineItem.description_snapshot ? (
                                <div className="mt-1 text-sm leading-6 text-slate-600">{lineItem.description_snapshot}</div>
                              ) : null}
                            </div>
                            <div className="text-sm text-slate-700">{formatInternalInvoiceItemType(lineItem.item_type_snapshot)}</div>
                            <div className="text-sm text-slate-700">{formatDecimalInput(lineItem.quantity)} x {formatCurrencyFromAmount(lineItem.unit_price)}</div>
                            <div className="text-sm font-semibold text-slate-950">{formatCurrencyFromAmount(lineItem.line_subtotal)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {invoicePaymentLinkUiState.showPanel && canManageFinancialInvoiceLifecycle ? (
              <section className={`${panelClass} order-30 p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Link</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Create a customer payment link</h2>

                {invoicePaymentLinkUiState.showCreateButton ? (
                  <TenantInvoicePaymentLinkPanel
                    jobId={jobId}
                    invoiceId={invoice.id}
                    returnTo={returnTo}
                    balanceDueDisplay={formatCurrencyFromCents(paymentSummary?.balanceDueCents ?? 0)}
                    initialCheckoutSessionId={checkoutSessionIdFromQuery}
                    initialCheckoutSessionUrl={checkoutSessionUrlFromQuery}
                  />
                ) : (
                  <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm leading-6 text-amber-900">
                    <div className="font-semibold">Stripe Connect setup required</div>
                    <div className="mt-1">
                      Online customer payment links stay disabled until the company Stripe Connect account is ready.
                    </div>
                    <div className="mt-3">
                      <Link
                        href={invoicePaymentLinkUiState.setupHref}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 transition-[background-color,box-shadow,transform] hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 active:translate-y-[0.5px]"
                      >
                        Open company profile Stripe setup
                      </Link>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {invoice.status === "issued" && canManageFinancialInvoiceLifecycle ? (
              <section className={`${panelClass} order-20 p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Attention</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Review payment failures</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Payment failed - invoice is still unpaid. Review before retrying. Failed payments are not counted as paid.
                </p>

                {failedAutopayAttentionItems.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                    No open payment failures for this invoice.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Open Items</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900">{failedAutopayAttentionItems.length}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Authentication Required</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900">{failedAutopayAttention?.countsByCategory.authentication_required ?? 0}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Declined</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900">{failedAutopayAttention?.countsByCategory.payment_declined ?? 0}</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {failedAutopayAttentionItems.map((item) => (
                        <div key={item.attemptId} className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-3 text-sm text-slate-700">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-slate-900">
                              {formatAutopayAttentionCategoryLabel(item.attentionCategory)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                                {item.attemptStatus.replaceAll("_", " ")}
                              </span>
                              <span className="text-xs text-slate-500">
                                {item.lastAttemptAt ? formatTimestampDateDisplayLA(item.lastAttemptAt) : "Timestamp unavailable"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-slate-700">
                            Recommended operator action: <span className="font-semibold text-slate-900">{formatAutopayAttentionActionLabel(item.recommendedOperatorAction)}</span>
                          </div>
                          {item.failureMessage ? (
                            <div className="mt-1 text-xs text-slate-600">Failure: {item.failureMessage}</div>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                            {item.failureCode ? <span>Code: {item.failureCode}</span> : null}
                            {item.blockedReasonCode ? <span>Blocked: {item.blockedReasonCode}</span> : null}
                            {item.requiresActionType ? <span>Action Type: {item.requiresActionType}</span> : null}
                            <span>Retry Count: {item.retryCount}</span>
                            {item.nextRetryAt ? <span>Next Retry: {formatTimestampDateDisplayLA(item.nextRetryAt)}</span> : null}
                            {item.paymentMethod.last4 ? (
                              <span>
                                Method: {item.paymentMethod.brand || "card"} •••• {item.paymentMethod.last4}
                              </span>
                            ) : null}
                            {item.consent.consentStatus ? <span>Consent: {item.consent.consentStatus}</span> : null}
                          </div>
                          {canShowFailedAutopayRetryControl ? (
                            <form
                              action={retryFailedScheduledAutopayAttemptFromForm}
                              className="mt-3 rounded-lg border border-amber-200 bg-white/90 px-3 py-3"
                            >
                              <input type="hidden" name="job_id" value={jobId} />
                              <input type="hidden" name="invoice_id" value={invoice.id} />
                              <input type="hidden" name="failed_attempt_id" value={item.attemptId} />
                              <input type="hidden" name="return_to" value={returnTo} />
                              <input
                                type="hidden"
                                name="retry_reason"
                                value="manual_retry_from_invoice_workspace"
                              />
                              <div className="text-sm font-semibold text-slate-950">Retry saved card</div>
                              <div className="mt-1 text-xs leading-5 text-slate-600">
                                This will attempt the saved payment method again. Payment is only recorded after Stripe confirms it through webhook.
                              </div>
                              <SubmitButton loadingText="Retrying..." className={`${secondaryButtonClass} mt-3`}>
                                Retry saved card
                              </SubmitButton>
                            </form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {invoice.status === "issued" && canManageFinancialInvoiceLifecycle ? (
              <section className={`${panelClass} order-10 p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Options</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Choose how to collect payment</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Pick one available option below. Online card payments are recorded only after Stripe confirms them.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Field-reported check, cash, and other collections are not enabled here yet. When enabled, office verification will be required before final payment truth.
                </p>

                {canShowManualSavedCardCharge ? (
                  <form
                    action={chargeSavedCardForIssuedInvoiceFromForm}
                    className="mt-4 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
                  >
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input type="hidden" name="customer_id" value={invoiceCustomerId ?? ""} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <input
                      type="hidden"
                      name="tenant_customer_payment_method_id"
                      value={String(defaultSavedCardMethod?.id ?? "")}
                    />
                    <div className="text-sm font-semibold text-emerald-950">Charge saved card once</div>
                    <div className="text-sm leading-6 text-slate-700">
                      Uses the active saved card on file for this customer.
                      This is not autopay, no subscription is created, and invoice payment is recorded only after Stripe webhook confirmation.
                    </div>
                    <div className="text-xs text-slate-600">
                      Card: {String(defaultSavedCardMethod?.display_brand ?? "Card")} •••• {String(defaultSavedCardMethod?.display_last4 ?? "")}
                    </div>
                    <SubmitButton loadingText="Submitting to Stripe..." className={darkButtonClass}>
                      Charge saved card
                    </SubmitButton>
                  </form>
                ) : null}

                {invoicePaymentLinkUiState.showCreateButton ? (
                  <form action={collectTenantInvoicePaymentNowFromForm} className="mt-4 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input type="hidden" name="tab" value="info" />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <div className="text-sm leading-6 text-slate-700">
                      Opens secure Stripe Checkout so the customer can pay this invoice now.
                    </div>
                    <SubmitButton loadingText="Opening checkout..." className={darkButtonClass}>
                      Create payment link
                    </SubmitButton>
                  </form>
                ) : null}

                {paymentSummary ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Payment Status</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{paymentStatusLabel}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Paid</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatCurrencyFromCents(paymentSummary.amountPaidCents)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Balance</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatCurrencyFromCents(paymentSummary.balanceDueCents)}</div>
                    </div>
                  </div>
                ) : null}

                <form action={recordInternalInvoicePaymentFromForm} className="mt-4 space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <input type="hidden" name="tab" value="info" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Amount</label>
                      <input name="payment_amount" inputMode="decimal" placeholder="0.00" className={inputClass} required />
                    </div>
                    <div>
                      <label className={labelClass}>Payment Method</label>
                      <select name="payment_method" className={inputClass} defaultValue="" required>
                        <option value="" disabled>Select method</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="ach_off_platform">ACH (Off-Platform)</option>
                        <option value="card_off_platform">Card (Off-Platform)</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Reference</label>
                      <input name="received_reference" placeholder="Check # or confirmation" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Payment recorded note</label>
                      <input name="notes" placeholder="Optional note" className={inputClass} />
                    </div>
                  </div>
                  <SubmitButton
                    loadingText="Recording..."
                    className={darkButtonClass}
                    disabled={!paymentSummary || paymentSummary.balanceDueCents <= 0}
                  >
                    Record manual payment
                  </SubmitButton>
                </form>

              </section>
            ) : null}

            {canShowFieldCollectionSection ? (
              <section className={`${panelClass} order-5 p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Field Collection</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Collect Payment</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Card collection launches secure Stripe Checkout. Payment updates only after Stripe webhook confirmation.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Check, cash, and other field reporting are not enabled in this slice. Future field reports will require office verification before final payment truth.
                </p>
                {!canCollectCardPaymentAccess ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
                    Card collection is not enabled for your role.
                  </div>
                ) : !tenantStripeReadiness.isReady ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">Online payments are not ready.</p>
                ) : (
                  <>
                    <form action={collectIssuedInvoiceCardPaymentFromForm} className="mt-4 space-y-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="invoice_id" value={invoice.id} />
                      <input type="hidden" name="tab" value="info" />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <SubmitButton loadingText="Opening checkout..." className={darkButtonClass}>
                        Collect Card Payment
                      </SubmitButton>
                    </form>
                  </>
                )}
              </section>
            ) : null}

            {invoice.status === "issued" && canManageFinancialInvoiceLifecycle ? (
              <section className={`${panelClass} order-50 p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment History</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Collected and not-collected activity</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Collected payments appear first. Failed or reversed attempts are listed as not collected.
                </p>

                {recordedInternalInvoicePaymentRows.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">Collected</div>
                    {recordedInternalInvoicePaymentRows.slice(0, 6).map((payment) => (
                      <div key={payment.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{formatCurrencyFromCents(payment.amount_cents)}</span>
                          <span className="text-xs text-slate-500">{formatTimestampDateDisplayLA(payment.paid_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{formatPaymentMethodLabel(payment.payment_method)}</span>
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                            Recorded
                          </span>
                        </div>
                        {isStripeSourcedPayment(payment) ? (
                          <div className="mt-2 text-xs text-amber-800">
                            Online Stripe payment. This screen cannot reverse or refund Stripe charges.
                          </div>
                        ) : (
                          <form action={reverseInternalInvoicePaymentFromForm} className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                            <input type="hidden" name="job_id" value={jobId} />
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <input type="hidden" name="payment_id" value={payment.id} />
                            <input type="hidden" name="tab" value="info" />
                            <input type="hidden" name="return_to" value={returnTo} />
                            <label className={labelClass}>Reversal Reason</label>
                            <input
                              name="reversal_reason"
                              className={inputClass}
                              placeholder="Required correction reason"
                              required
                            />
                            <div className="text-xs text-amber-900">
                              This does not refund Stripe. It only corrects Compliance Matters records.
                            </div>
                            <SubmitButton loadingText="Reversing..." className={secondaryButtonClass}>
                              Reverse Recorded Payment
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {nonRecordedInternalInvoicePaymentRows.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.1em] text-rose-800">Not collected</div>
                    {nonRecordedInternalInvoicePaymentRows.slice(0, 6).map((payment) => (
                      <div key={payment.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{formatCurrencyFromCents(payment.amount_cents)}</span>
                          <span className="text-xs text-slate-500">{formatTimestampDateDisplayLA(payment.paid_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{formatPaymentMethodLabel(payment.payment_method)}</span>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                              payment.payment_status === "reversed"
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-rose-200 bg-rose-50 text-rose-800"
                            }`}
                          >
                            {formatPaymentStatusLabel(payment.payment_status)}
                          </span>
                        </div>
                        {payment.payment_status === "reversed" ? (
                          <div className="mt-1 text-xs text-amber-800">
                            Reversed{payment.reversal_reason ? `: ${payment.reversal_reason}` : "."}
                            {payment.reversed_at ? ` (${formatTimestampDateDisplayLA(payment.reversed_at)})` : ""}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </main>

          <aside className="space-y-5">
            <section className={`${panelClass} p-4 sm:p-5`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Issue Readiness</div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{canIssue ? "Ready to issue" : "Needs review"}</h2>
              <div className="mt-3 space-y-2">
                {readinessRow("Billing recipient", recipientReady, recipientReady ? String(invoice.billing_name) : "Add a billing name.")}
                {readinessRow("Charges", chargesReady, chargesReady ? `${lineItemCount} charge${lineItemCount === 1 ? "" : "s"} added.` : "Needs at least 1 charge.")}
                {readinessRow("Total", totalReady, totalReady ? formatCurrencyFromCents(invoice.total_cents) : "Total must be above $0.00.")}
                {readinessRow("Job closeout", jobReady, jobReady ? "Job and field work are complete." : "Job must be completed and field complete.")}
              </div>
              {invoice.status === "draft" && canIssueInvoiceLifecycle ? (
                <form action={issueInternalInvoiceFromForm} className="mt-4">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <input type="hidden" name="tab" value="info" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <SubmitButton loadingText="Issuing..." className={`${darkButtonClass} w-full`} disabled={!canIssue}>
                    Issue Invoice
                  </SubmitButton>
                </form>
              ) : invoice.status === "draft" ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/75 px-3 py-2.5 text-sm text-slate-600">
                  Invoice issue authority is not available for your current role.
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/75 px-3 py-2.5 text-sm text-emerald-900">
                  This invoice is issued. Charges are frozen as the billed record.
                </div>
              )}
            </section>

            <section className={`${panelClass} p-4 sm:p-5`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Billing Recipient</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{invoice.billing_name || "Billing recipient not set"}</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                {[invoice.billing_email, invoice.billing_phone].filter(Boolean).join(" / ") || "No email or phone set"}
              </div>
              {billingAddress.length > 0 ? (
                <div className="mt-2 text-sm leading-6 text-slate-600">{billingAddress.join(", ")}</div>
              ) : null}

              {invoice.status === "draft" && canManageFinancialInvoiceLifecycle ? (
                <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Edit Billing Details</summary>
                  <InternalInvoiceDraftSaveForm action={saveInternalInvoiceDraftFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input type="hidden" name="tab" value="info" />
                    <div>
                      <label className={labelClass}>Invoice #</label>
                      <input name="invoice_number" defaultValue={invoice.invoice_number} className={inputClass} required />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Name</label>
                      <input name="billing_name" defaultValue={invoice.billing_name ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Email</label>
                      <input type="email" name="billing_email" defaultValue={invoice.billing_email ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Phone</label>
                      <input name="billing_phone" defaultValue={invoice.billing_phone ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Address Line 1</label>
                      <input name="billing_address_line1" defaultValue={invoice.billing_address_line1 ?? ""} className={inputClass} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>City</label>
                        <input name="billing_city" defaultValue={invoice.billing_city ?? ""} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>State</label>
                        <input name="billing_state" defaultValue={invoice.billing_state ?? ""} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>ZIP</label>
                        <input name="billing_zip" defaultValue={invoice.billing_zip ?? ""} className={inputClass} />
                      </div>
                    </div>
                    <SubmitButton loadingText="Saving..." className={secondaryButtonClass}>
                      Save Billing Details
                    </SubmitButton>
                  </InternalInvoiceDraftSaveForm>
                </details>
              ) : null}
            </section>

              {invoice.status === "issued" && canSendInvoiceLifecycle ? (
              <section className={`${panelClass} p-4 sm:p-5`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Send Invoice</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Invoice issue and invoice send are separate steps. Sending is communication-only and does not create a second invoice or change charge lines.
                </p>
                <form action={sendInternalInvoiceEmailFromForm} className="mt-3 space-y-3">
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <input type="hidden" name="tab" value="info" />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <div>
                    <label className={labelClass}>Send To</label>
                    <input type="email" name="recipient_email" defaultValue={invoice.billing_email ?? ""} placeholder="billing@example.com" className={inputClass} required />
                  </div>
                  <SubmitButton loadingText="Sending..." className={secondaryButtonClass}>
                    {latestSuccessfulInternalInvoiceEmailDelivery ? "Send Again" : "Send Invoice Email"}
                  </SubmitButton>
                </form>

                {internalInvoiceEmailDeliveries.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {(internalInvoiceEmailDeliveries as InternalInvoiceEmailDeliveryRecord[]).slice(0, 5).map((delivery) => (
                      <div key={delivery.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {delivery.attemptKind === "resent" ? `Resend #${delivery.attemptNumber}` : `Send #${delivery.attemptNumber}`}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                              delivery.status === "sent"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : delivery.status === "failed"
                                ? "border-rose-200 bg-rose-50 text-rose-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                          >
                            {delivery.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {delivery.recipientEmail || "Recipient unavailable"}
                          {delivery.createdAt ? ` • ${formatTimestampDateDisplayLA(delivery.createdAt)}` : ""}
                        </div>
                        {delivery.status === "failed" && delivery.errorDetail ? (
                          <div className="mt-1 text-xs text-rose-700">{delivery.errorDetail}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : invoice.status === "issued" ? (
              <section className={`${panelClass} p-4 sm:p-5`}>
                <div className="rounded-xl border border-slate-200 bg-slate-50/75 px-3 py-2.5 text-sm text-slate-600">
                  Invoice send authority is not available for your current role.
                </div>
              </section>
            ) : null}

            <section className={`${panelClass} p-4 sm:p-5`}>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">Audit / Technical Details</summary>
                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">Source-of-truth audit details remain available below.</div>
                  {internalInvoicePaymentRows.slice(0, 5).map((payment) => (
                    <div key={payment.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                      <div>Payment ID: {payment.id}</div>
                      {payment.stripe_checkout_session_id ? <div>Checkout Session: {payment.stripe_checkout_session_id}</div> : null}
                      {payment.stripe_payment_intent_id ? <div>Payment Intent: {payment.stripe_payment_intent_id}</div> : null}
                      {payment.stripe_event_id ? <div>Stripe Event: {payment.stripe_event_id}</div> : null}
                    </div>
                  ))}
                  {failedAutopayAttentionItems.slice(0, 5).map((item) => (
                    <div key={item.attemptId} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                      <div>Failed Attempt: {item.attemptId}</div>
                      {item.failureCode ? <div>Failure Code: {item.failureCode}</div> : null}
                      {item.blockedReasonCode ? <div>Blocked Reason: {item.blockedReasonCode}</div> : null}
                      {item.requiresActionType ? <div>Action Type: {item.requiresActionType}</div> : null}
                    </div>
                  ))}
                  <div>Payment totals and paid status are derived from allocation-compatible payment truth.</div>
                </div>
              </details>
            </section>

            {canManageFinancialInvoiceLifecycle ? (
            <section className={`${panelClass} p-4 sm:p-5`}>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">Danger Zone</summary>
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                  <div className="text-sm font-semibold text-rose-900">Danger zone</div>
                  <p className="mt-1 text-xs leading-5 text-rose-900/90">
                    Voiding keeps the invoice in history. Issued invoice voids also reopen billing closeout truth.
                  </p>
                  <form action={voidInternalInvoiceFromForm} className="mt-3 space-y-3">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input type="hidden" name="tab" value="info" />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <div>
                      <label className={labelClass}>Void Reason</label>
                      <textarea name="void_reason" rows={3} className={`${inputClass} min-h-[5rem]`} placeholder="Optional reason" />
                    </div>
                    <SubmitButton loadingText="Voiding..." className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700" disabled={invoice.status === "void"}>
                      Void Invoice
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
