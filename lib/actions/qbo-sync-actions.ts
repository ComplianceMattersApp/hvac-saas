"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getQboAvailability } from "@/lib/qbo/qbo-env";
import { getQboConnectionForAccount } from "@/lib/qbo/qbo-connection";
import { backfillQboEmailSentStatuses, syncAllPendingInvoicesToQbo, syncInvoiceToQbo } from "@/lib/qbo/qbo-sync";
import { syncAllPendingPaymentsToQbo, syncPaymentToQbo } from "@/lib/qbo/qbo-payment-sync";
import { voidAllPendingInvoiceVoidsInQbo, voidInvoiceInQbo } from "@/lib/qbo/qbo-void-sync";
import {
  persistReconciliationFindings,
  runThreeWayReconciliation,
} from "@/lib/reconciliation/three-way-reconciliation";
import { adoptUnrecordedQboPayment } from "@/lib/reconciliation/adopt-qbo-payment";
import { insertJobEvent } from "@/lib/actions/job-actions-shared";

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

/**
 * Explicit per-invoice void retry, triggered from the invoice workspace. Also
 * the only way to re-attempt a 'blocked' void (QBO showed payments applied) —
 * the automatic sweep deliberately leaves those alone, so clearing them is a
 * conscious operator action taken after reconciling the payment in QuickBooks.
 */
export async function retryQboInvoiceVoidFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const href = (banner: string) =>
    `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}&banner=${banner}#invoice-workspace`;

  if (!invoiceId || !jobId) redirect(href("internal_invoice_qbo_void_failed"));
  if (!getQboAvailability().available) redirect(href("internal_invoice_qbo_not_configured"));

  const connection = await getQboConnectionForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  if (!connection) redirect(href("internal_invoice_qbo_not_connected"));

  const result = await voidInvoiceInQbo({
    supabase: createAdminClient(),
    accountOwnerUserId: internalUser.account_owner_user_id,
    invoiceId,
  });
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirect(
    href(
      result.status === "voided"
        ? "internal_invoice_qbo_voided"
        : result.status === "blocked"
          ? "internal_invoice_qbo_void_blocked"
          : "internal_invoice_qbo_void_failed",
    ),
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
    supabase: createAdminClient(),
    accountOwnerUserId: internalUser.account_owner_user_id,
    paymentId,
  });
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirect(href(result.status === "synced" ? "internal_invoice_payment_qbo_synced" : "internal_invoice_payment_qbo_sync_failed"));
}

/**
 * Adopt a QuickBooks-collected payment into EveryStep from an open
 * qbo_payment_unrecorded finding. Verification-gated in the adoption core:
 * QuickBooks is re-read live and any surprise blocks with no writes. On
 * success the invoice balance clears here and the finding resolves.
 */
export async function adoptQboPaymentFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser, userId } = await requireInternalRole("admin", { supabase });

  const findingId = String(formData.get("finding_id") ?? "").trim();
  if (!findingId) redirect("/reports/attention?qbo_adopt=failed");

  let result: Awaited<ReturnType<typeof adoptUnrecordedQboPayment>>;
  try {
    result = await adoptUnrecordedQboPayment({
      admin: createAdminClient(),
      accountOwnerUserId: internalUser.account_owner_user_id,
      findingId,
      recordedByUserId: userId,
    });
  } catch (error) {
    console.error("[adoptQboPaymentFromForm] adoption failed", {
      findingId,
      message: error instanceof Error ? error.message : "unknown error",
    });
    redirect("/reports/attention?qbo_adopt=failed");
  }

  if (result.status === "adopted") {
    if (result.jobId) {
      try {
        await insertJobEvent({
          supabase,
          jobId: result.jobId,
          event_type: "payment_recorded",
          meta: {
            source_action: "adoptQboPaymentFromForm",
            note: "QuickBooks-collected payment adopted into EveryStep",
            payment_id: result.paymentId,
            invoice_id: result.invoiceId,
            amount_cents: result.amountCents,
            reconciliation_finding_id: findingId,
          },
          userId,
        });
      } catch {
        // Timeline entry is best-effort; the payment truth already landed.
      }
      revalidatePath(`/jobs/${result.jobId}`);
      revalidatePath(`/jobs/${result.jobId}/invoice`);
    }
    revalidatePath("/reports/attention");
    revalidatePath("/reports/payments");
    redirect("/reports/attention?qbo_adopt=complete");
  }

  console.warn("[adoptQboPaymentFromForm] adoption blocked", { findingId, reason: result.error });
  revalidatePath("/reports/attention");
  redirect("/reports/attention?qbo_adopt=blocked");
}

export async function syncAttentionPaymentToQboFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  if (!paymentId || !getQboAvailability().available) redirect("/reports/attention?sync=failed");
  const result = await syncPaymentToQbo({
    supabase: createAdminClient(),
    accountOwnerUserId: internalUser.account_owner_user_id,
    paymentId,
  });
  revalidatePath("/reports/attention");
  revalidatePath("/reports/payments");
  redirect(`/reports/attention?sync=${result.status === "synced" ? "complete" : "failed"}`);
}

/**
 * On-demand three-way reconciliation for the signed-in account.
 *
 * Same engine the nightly cron runs. Report-only — it writes findings and never
 * touches invoices or payments — so it is safe to run at any time.
 */
export async function runReconciliationNowFromForm(
  _prevState: unknown,
  _formData: FormData,
): Promise<QboSyncActionResult> {
  try {
    const supabase = await createClient();
    const { internalUser } = await requireInternalRole("admin", { supabase });
    const admin = createAdminClient();

    const result = await runThreeWayReconciliation({
      admin,
      accountOwnerUserId: internalUser.account_owner_user_id,
      windowDays: 90,
    });
    const persisted = await persistReconciliationFindings({ admin, result });
    revalidatePath(COMPANY_PROFILE_PATH);
    revalidatePath("/reports/attention");

    const checked = `Checked ${result.checkedInvoices} invoice(s) and ${result.checkedPayments} payment(s) over 90 days.`;
    const outcome = result.findings.length === 0
      ? "EveryStep, QuickBooks and Stripe agree."
      : `${result.findings.length} discrepancy(ies) found — ${persisted.opened} new. See Needs Attention.`;
    const skipped = result.skipped.length > 0 ? ` Not compared: ${result.skipped.join("; ")}.` : "";

    return {
      synced: persisted.refreshed,
      skipped: result.skipped.length,
      errors: result.findings.length,
      message: `${checked} ${outcome}${skipped}`,
    };
  } catch (error) {
    return {
      synced: 0,
      skipped: 0,
      errors: 0,
      message: error instanceof Error ? error.message : "Reconciliation failed.",
    };
  }
}

/**
 * One-time repair: push "Sent" status to QuickBooks for already-synced invoices
 * EveryStep emailed before EmailStatus travelled in the sync payload. Only
 * updates existing linked QBO invoices — it never creates one and never makes
 * QuickBooks send any email.
 */
export async function backfillQboEmailSentStatusesFromForm(
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

    const result = await backfillQboEmailSentStatuses({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    revalidatePath(COMPANY_PROFILE_PATH);

    if (result.candidates === 0) {
      return {
        synced: 0,
        skipped: 0,
        errors: 0,
        message: "No synced invoices with an EveryStep email delivery to mark — nothing to update.",
      };
    }

    // confirmedSent is the read-back-verified count — QuickBooks accepts these
    // writes with a 2xx and silently drops the flag when it dislikes them, so
    // the write count alone must never be reported as "marked".
    const unconfirmed = result.resynced - result.confirmedSent;
    const messageParts = [
      `QuickBooks now shows ${result.confirmedSent} of ${result.candidates} emailed invoice(s) as sent.`,
      unconfirmed > 0
        ? `${unconfirmed} did not accept the sent flag — QuickBooks dropped it silently; check those invoices have an email address in QuickBooks.`
        : null,
      result.errors > 0 ? `${result.errors} failed to sync — check individual invoices for details.` : null,
    ].filter(Boolean);

    return {
      synced: result.confirmedSent,
      skipped: result.skipped,
      errors: result.errors + unconfirmed,
      message: messageParts.join(" "),
    };
  } catch (error) {
    return {
      synced: 0,
      skipped: 0,
      errors: 0,
      message: error instanceof Error ? error.message : "QuickBooks sent-status update failed.",
    };
  }
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

    // Same run also drains voids that have not reached QBO — including invoices
    // voided before this lane existed, which are otherwise silent drift.
    const voids = await voidAllPendingInvoiceVoidsInQbo({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    // ...and recorded payments that never linked. Runs after the invoices so a
    // payment whose invoice just synced is picked up in the same pass.
    const payments = await syncAllPendingPaymentsToQbo({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    revalidatePath(COMPANY_PROFILE_PATH);

    const baseMessage =
      result.errors > 0
        ? `Synced ${result.synced} invoice(s), ${result.errors} failed to sync — check individual invoices for details.`
        : `Synced ${result.synced} invoice(s), ${result.skipped} skipped, 0 errors.`;
    const alsoParts = [
      voids.voided > 0 ? `voided ${voids.voided} in QuickBooks` : null,
      voids.blocked > 0 ? `${voids.blocked} void(s) blocked by applied payments — reconcile in QuickBooks` : null,
      voids.errors > 0 ? `${voids.errors} void(s) failed` : null,
      payments.synced > 0 ? `linked ${payments.synced} payment(s)` : null,
      payments.errors > 0 ? `${payments.errors} payment(s) failed to link` : null,
    ].filter((part): part is string => Boolean(part));
    const message = alsoParts.length > 0 ? `${baseMessage} Also ${alsoParts.join("; ")}.` : baseMessage;

    return {
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors + voids.errors + payments.errors,
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
