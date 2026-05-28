"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import { startTenantSavedCardSetupCheckoutSession } from "@/lib/business/tenant-saved-payment-method-setups";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SavedMethodBanner =
  | "saved_payment_method_setup_denied"
  | "saved_payment_method_setup_invalid"
  | "saved_payment_method_setup_connect_not_ready"
  | "saved_payment_method_setup_failed";

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
