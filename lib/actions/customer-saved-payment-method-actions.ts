"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { retryFailedScheduledAutopayAttemptManually } from "@/lib/business/failed-autopay-manual-retry";
import { startManualSavedMethodPaymentAttempt } from "@/lib/business/tenant-saved-method-payment-attempts";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { startTenantSavedCardSetupCheckoutSession } from "@/lib/business/tenant-saved-payment-method-setups";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SavedMethodBanner =
  | "saved_payment_method_setup_denied"
  | "saved_payment_method_setup_invalid"
  | "saved_payment_method_setup_connect_not_ready"
  | "saved_payment_method_setup_failed";

type ManualSavedCardInvoiceBanner =
  | "internal_invoice_saved_card_charge_denied"
  | "internal_invoice_saved_card_charge_invalid"
  | "internal_invoice_saved_card_charge_connect_not_ready"
  | "internal_invoice_saved_card_charge_missing_saved_method"
  | "internal_invoice_saved_card_charge_missing_authorization"
  | "internal_invoice_saved_card_charge_inflight"
  | "internal_invoice_saved_card_charge_requires_issued"
  | "internal_invoice_saved_card_charge_no_balance_due"
  | "internal_invoice_saved_card_charge_submitted"
  | "internal_invoice_saved_card_charge_failed_declined"
  | "internal_invoice_saved_card_charge_failed_requires_action"
  | "internal_invoice_saved_card_charge_failed";

type FailedAutopayRetryInvoiceBanner =
  | "internal_invoice_failed_autopay_retry_denied"
  | "internal_invoice_failed_autopay_retry_invalid"
  | "internal_invoice_failed_autopay_retry_blocked"
  | "internal_invoice_failed_autopay_retry_submitted"
  | "internal_invoice_failed_autopay_retry_failed_declined"
  | "internal_invoice_failed_autopay_retry_failed_requires_action";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCustomerPath(customerPath: string | null | undefined) {
  try {
    return new URL(clean(customerPath) || "/customers", "https://app.local").pathname || "/customers";
  } catch {
    return "/customers";
  }
}

function buildCustomerProfileHref(customerPath: string | null | undefined, banner: SavedMethodBanner) {
  const url = new URL(normalizeCustomerPath(customerPath), "https://app.local");
  url.searchParams.set("banner", banner);
  return `${url.pathname}${url.search}${url.hash}`;
}

function redirectToCustomerProfile(customerPath: string | null | undefined, banner: SavedMethodBanner): never {
  const safePath = normalizeCustomerPath(customerPath);
  revalidatePath(safePath);
  redirect(buildCustomerProfileHref(customerPath, banner));
}

function parseUuid(value: unknown) {
  const normalized = clean(value);
  if (!normalized || !UUID_RE.test(normalized)) return null;
  return normalized;
}

function normalizeInvoiceWorkspacePath(jobId: string, returnPath: string | null | undefined) {
  const fallback = new URL(`/jobs/${jobId}/invoice`, "https://app.local");
  const raw = clean(returnPath);
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, "https://app.local");
    if (parsed.pathname !== `/jobs/${jobId}/invoice`) {
      return fallback;
    }

    const selectedInvoiceId =
      parseUuid(parsed.searchParams.get("invoice_id"))
      || parseUuid(parsed.searchParams.get("supplemental_invoice_id"));

    if (selectedInvoiceId) {
      fallback.searchParams.set("invoice_id", selectedInvoiceId);
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function redirectToInvoiceWorkspace(
  jobId: string,
  returnPath: string | null | undefined,
  banner: ManualSavedCardInvoiceBanner | FailedAutopayRetryInvoiceBanner,
): never {
  const url = normalizeInvoiceWorkspacePath(jobId, returnPath);
  url.searchParams.set("banner", banner);
  url.hash = "invoice-workspace";
  revalidatePath(url.pathname);
  redirect(`${url.pathname}${url.search}${url.hash}`);
}

export async function retryFailedScheduledAutopayAttemptFromForm(formData: FormData): Promise<void> {
  const jobId = parseUuid(formData.get("job_id"));
  const invoiceId = parseUuid(formData.get("invoice_id"));
  const failedAttemptId = parseUuid(formData.get("failed_attempt_id"));
  const returnPath = clean(formData.get("return_to"));
  const retryReason = clean(formData.get("retry_reason")) || "manual_retry";

  if (!jobId || !invoiceId || !failedAttemptId) {
    redirectToInvoiceWorkspace(clean(jobId), returnPath, "internal_invoice_failed_autopay_retry_invalid");
  }

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    const supabase = await createClient();
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_denied");
    }
    throw error;
  }

  const { internalUser, userId } = authz;
  const accountOwnerUserId = clean(internalUser.account_owner_user_id);
  if (!accountOwnerUserId) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_denied");
  }

  if (
    !canManageInvoiceLifecycle({
      actorUserId: userId,
      internalUser,
      resourceAccountOwnerUserId: accountOwnerUserId,
    })
  ) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_denied");
  }

  const supabase = await createClient();
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId,
    jobId: jobId!,
    select: "id",
  });

  if (!scopedJob?.id) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_denied");
  }

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId,
  });

  if (billingMode !== "internal_invoicing") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_denied");
  }

  const admin = createAdminClient();
  const result = await retryFailedScheduledAutopayAttemptManually({
    admin,
    accountOwnerUserId,
    failedAttemptId: failedAttemptId!,
    actorUserId: userId,
    retryReason,
  });

  if (result.outcome === "submitted") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_submitted");
  }

  if (result.outcome === "failed_declined") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_failed_declined");
  }

  if (result.outcome === "failed_requires_action") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_failed_requires_action");
  }

  if (result.outcome === "blocked_precondition") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_blocked");
  }

  redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_failed_autopay_retry_invalid");
}

export async function startCustomerSavedPaymentMethodSetupFromForm(
  customerPath: string | null | undefined,
  formData: FormData,
): Promise<void> {
  const customerId = parseUuid(formData.get("customer_id"));
  if (!customerId) {
    redirectToCustomerProfile(customerPath, "saved_payment_method_setup_invalid");
  }

  const maintenanceAgreementId = parseUuid(formData.get("maintenance_agreement_id"));

  const returnPath = normalizeCustomerPath(clean(formData.get("return_path")) || customerPath);

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    const supabase = await createClient();
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirectToCustomerProfile(customerPath, "saved_payment_method_setup_denied");
    }
    throw error;
  }

  const { internalUser, userId } = authz;
  const accountOwnerUserId = clean(internalUser.account_owner_user_id);
  if (!accountOwnerUserId) {
    redirectToCustomerProfile(customerPath, "saved_payment_method_setup_denied");
  }

  if (
    !canManageInvoiceLifecycle({
      actorUserId: userId,
      internalUser,
      resourceAccountOwnerUserId: accountOwnerUserId,
    })
  ) {
    redirectToCustomerProfile(customerPath, "saved_payment_method_setup_denied");
  }

  const admin = createAdminClient();

  const { data: customerRow, error: customerError } = await admin
    .from("customers")
    .select("id, owner_user_id, full_name, first_name, last_name, email, phone")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new Error(`Failed to load customer for saved payment setup: ${customerError.message ?? "unknown error"}`);
  }

  if (!customerRow?.id || clean(customerRow.owner_user_id) !== accountOwnerUserId) {
    redirectToCustomerProfile(customerPath, "saved_payment_method_setup_denied");
  }

  if (maintenanceAgreementId) {
    const { data: agreementRow, error: agreementError } = await admin
      .from("maintenance_agreements")
      .select("id, account_owner_user_id, customer_id")
      .eq("id", maintenanceAgreementId)
      .maybeSingle();

    if (agreementError) {
      throw new Error(
        `Failed to load maintenance agreement for saved payment setup: ${agreementError.message ?? "unknown error"}`,
      );
    }

    if (
      !agreementRow?.id
      || clean(agreementRow.account_owner_user_id) !== accountOwnerUserId
      || clean(agreementRow.customer_id) !== customerId
    ) {
      redirectToCustomerProfile(customerPath, "saved_payment_method_setup_invalid");
    }
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
  const connectedAccountId = clean(readiness.connectedAccountId);

  if (!readiness.isReady || !connectedAccountId) {
    redirectToCustomerProfile(customerPath, "saved_payment_method_setup_connect_not_ready");
  }

  const firstName = clean(customerRow.first_name);
  const lastName = clean(customerRow.last_name);
  const fullName = clean(customerRow.full_name) || [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const customerEmail = clean(customerRow.email) || null;
  const customerPhone = clean(customerRow.phone) || null;

  let checkoutSessionUrl: string;
  try {
    const result = await startTenantSavedCardSetupCheckoutSession({
      admin,
      accountOwnerUserId,
      customerId,
      connectedAccountId,
      customerName: fullName,
      customerEmail,
      customerPhone,
      initiatedByUserId: userId,
      maintenanceAgreementId,
      returnPath,
    });

    revalidatePath(normalizeCustomerPath(customerPath));
    checkoutSessionUrl = result.checkoutSessionUrl;
  } catch {
    redirectToCustomerProfile(customerPath, "saved_payment_method_setup_failed");
  }

  redirect(checkoutSessionUrl!);
}

export async function chargeSavedCardForIssuedInvoiceFromForm(formData: FormData): Promise<void> {
  const jobId = parseUuid(formData.get("job_id"));
  const invoiceId = parseUuid(formData.get("invoice_id"));
  const customerId = parseUuid(formData.get("customer_id"));
  const selectedTenantCustomerPaymentMethodId = parseUuid(formData.get("tenant_customer_payment_method_id"));
  const returnPath = clean(formData.get("return_to"));

  if (!jobId || !invoiceId || !customerId) {
    redirectToInvoiceWorkspace(clean(jobId), returnPath, "internal_invoice_saved_card_charge_invalid");
  }

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    const supabase = await createClient();
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_denied");
    }
    throw error;
  }

  const { internalUser, userId } = authz;
  const accountOwnerUserId = clean(internalUser.account_owner_user_id);
  if (!accountOwnerUserId) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_denied");
  }

  if (
    !canManageInvoiceLifecycle({
      actorUserId: userId,
      internalUser,
      resourceAccountOwnerUserId: accountOwnerUserId,
    })
  ) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_denied");
  }

  const supabase = await createClient();
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId,
    jobId: jobId!,
    select: "id",
  });

  if (!scopedJob?.id) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_denied");
  }

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId,
  });
  if (billingMode !== "internal_invoicing") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_denied");
  }

  const admin = createAdminClient();
  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
  if (!readiness.isReady || !clean(readiness.connectedAccountId)) {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_connect_not_ready");
  }

  const result = await startManualSavedMethodPaymentAttempt({
    admin,
    accountOwnerUserId,
    customerId: customerId!,
    invoiceId: invoiceId!,
    triggeredByUserId: userId,
    selectedTenantCustomerPaymentMethodId,
  });

  if (!result.ok) {
    const reason = clean(result.blockedReason).toLowerCase();
    if (reason === "connect_not_ready") {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_connect_not_ready");
    }
    if (reason === "missing_active_saved_payment_method") {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_missing_saved_method");
    }
    if (reason === "missing_saved_method_reuse_authorization") {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_missing_authorization");
    }
    if (reason === "duplicate_inflight_attempt") {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_inflight");
    }
    if (reason === "invoice_not_issued") {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_requires_issued");
    }
    if (reason === "invoice_no_balance_due") {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_no_balance_due");
    }
    if (reason.includes("denied") || reason.includes("mismatch") || reason.includes("not_found")) {
      redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_denied");
    }
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_invalid");
  }

  if (result.attemptStatus === "failed_requires_action") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_failed_requires_action");
  }

  if (result.attemptStatus === "failed_declined") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_failed_declined");
  }

  if (result.attemptStatus === "succeeded" || result.attemptStatus === "submitted") {
    redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_submitted");
  }

  redirectToInvoiceWorkspace(jobId!, returnPath, "internal_invoice_saved_card_charge_failed");
}
