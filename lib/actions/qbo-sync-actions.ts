"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { getQboAvailability } from "@/lib/qbo/qbo-env";
import { getQboConnectionForAccount } from "@/lib/qbo/qbo-connection";
import { syncAllPendingInvoicesToQbo, syncInvoiceToQbo } from "@/lib/qbo/qbo-sync";
import { syncPaymentToQbo } from "@/lib/qbo/qbo-payment-sync";

const COMPANY_PROFILE_PATH = "/ops/admin/company-profile";

export interface QboSyncActionResult {
  synced: number;
  skipped: number;
  errors: number;
  message: string;
}

/**
 * Explicit per-invoice sync/retry, triggered from the invoice workspace. Unlike
 * the bulk "Sync pending invoices" run, this does NOT apply the connect-time
 * cutoff (it goes through syncInvoiceToQbo), so it can push a specific invoice
 * the operator deliberately chose — e.g. one issued before a reconnect bumped
 * the sync-start line, or one that previously errored. Redirects back to the
 * invoice workspace with a result banner.
 */
export async function syncSingleInvoiceToQboFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const href = (banner: string) => `/jobs/${jobId}/invoice?banner=${banner}#invoice-workspace`;

  if (!invoiceId || !jobId) redirect(href("internal_invoice_qbo_sync_failed"));
  if (!getQboAvailability().available) redirect(href("internal_invoice_qbo_not_configured"));

  const connection = await getQboConnectionForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  if (!connection) redirect(href("internal_invoice_qbo_not_connected"));

  const result = await syncInvoiceToQbo({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    invoiceId,
  });
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirect(
    href(result.status === "synced" ? "internal_invoice_qbo_synced" : "internal_invoice_qbo_sync_failed"),
  );
}

export async function syncSinglePaymentToQboFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const href = (banner: string) =>
    `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}&banner=${banner}#invoice-workspace`;
  if (!paymentId || !invoiceId || !jobId) redirect(href("internal_invoice_payment_qbo_sync_failed"));
  if (!getQboAvailability().available) redirect(href("internal_invoice_qbo_not_configured"));
  const connection = await getQboConnectionForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  if (!connection) redirect(href("internal_invoice_qbo_not_connected"));
  const result = await syncPaymentToQbo({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    paymentId,
  });
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirect(href(result.status === "synced" ? "internal_invoice_payment_qbo_synced" : "internal_invoice_payment_qbo_sync_failed"));
}

export async function syncAllPendingInvoicesToQboFromForm(
  _prevState: unknown,
  _formData: FormData,
): Promise<QboSyncActionResult> {
  try {
    const supabase = await createClient();
    const { internalUser } = await requireInternalRole("admin", { supabase });

    const availability = getQboAvailability();
    if (!availability.available) {
      return {
        synced: 0,
        skipped: 0,
        errors: 0,
        message: "QuickBooks Online is not configured for this environment.",
      };
    }

    const connection = await getQboConnectionForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
    if (!connection) {
      return {
        synced: 0,
        skipped: 0,
        errors: 0,
        message: "QuickBooks Online is not connected.",
      };
    }

    const result = await syncAllPendingInvoicesToQbo({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      dryRun: false,
    });

    revalidatePath(COMPANY_PROFILE_PATH);

    const message =
      result.errors > 0
        ? `Synced ${result.synced} invoice(s), ${result.errors} failed to sync — check individual invoices for details.`
        : `Synced ${result.synced} invoice(s), ${result.skipped} skipped, 0 errors.`;

    return {
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors,
      message,
    };
  } catch (error) {
    return {
      synced: 0,
      skipped: 0,
      errors: 0,
      message: error instanceof Error ? error.message : "QuickBooks sync failed.",
    };
  }
}
