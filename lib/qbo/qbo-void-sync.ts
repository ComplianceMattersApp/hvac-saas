import { createAdminClient } from "@/lib/supabase/server";

import { findQboInvoiceById, voidQboInvoice } from "./qbo-api-client";
import { getValidQboAccessToken } from "./qbo-connection";
import { getQboAvailability, getQboBaseUrl } from "./qbo-env";
import { isMissingQboVoidColumnError } from "./qbo-void-state";

/**
 * Propagates an EveryStep invoice void to QuickBooks Online.
 *
 * Companion to qbo-sync.ts, which only ever pushes issued invoices. Without this
 * lane, voiding an already-synced invoice left QBO holding a live open invoice —
 * overstated A/R and revenue, with nothing surfacing the drift.
 *
 * Hard rules, mirroring the push engine:
 *  - Never throws. Voiding in EveryStep must always succeed; QBO is downstream.
 *  - Every outcome is recorded on the invoice row so it is visible and retryable.
 *  - Never voids a QBO invoice that has payments applied. QBO would keep the
 *    payment as an unapplied credit, silently misstating the books — worse than
 *    the drift being fixed. Those are recorded 'blocked' for a human instead.
 */

export type QboInvoiceVoidResult = {
  invoiceId: string;
  /**
   * voided  — QBO invoice is voided (or was already voided / already gone).
   * blocked — QBO shows payments applied; needs a human, never auto-retried.
   * skipped — nothing to do (not configured/connected, never synced, not void).
   * error   — attempt failed; retryable.
   */
  status: "voided" | "blocked" | "skipped" | "error";
  error?: string;
};

const VOID_INVOICE_SELECT =
  "id, status, qbo_invoice_id, qbo_void_status, invoice_display_number, invoice_number";

/** Cent-safe comparison — QBO returns dollars as floats. */
function toCents(amount: number): number {
  return Math.round(Number(amount ?? 0) * 100);
}

function invoiceLabel(row: any): string {
  return (
    String(row?.invoice_display_number ?? "").trim()
    || String(row?.invoice_number ?? "").trim()
    || String(row?.id ?? "").trim()
  );
}

/**
 * Best-effort write of void bookkeeping. Never throws and never blocks the
 * caller: if the columns are not deployed yet the void simply stays unrecorded,
 * which is exactly the pre-existing behavior.
 */
async function recordVoidState(
  supabase: any,
  invoiceId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from("internal_invoices").update(patch).eq("id", invoiceId);
    if (error && !isMissingQboVoidColumnError(error)) {
      console.warn("QBO void state could not be recorded", { invoiceId, message: error.message });
    }
  } catch {
    /* swallow — bookkeeping must never break the void */
  }
}

export async function voidInvoiceInQbo(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
}): Promise<QboInvoiceVoidResult> {
  const { supabase, accountOwnerUserId, invoiceId } = params;

  try {
    if (!getQboAvailability().available) {
      return { invoiceId, status: "skipped", error: "QuickBooks is not configured for this environment" };
    }

    const { data: invoiceRow, error: invoiceError } = await supabase
      .from("internal_invoices")
      .select(VOID_INVOICE_SELECT)
      .eq("id", invoiceId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (invoiceError) {
      if (isMissingQboVoidColumnError(invoiceError)) {
        return { invoiceId, status: "skipped", error: "QBO void columns are not deployed yet" };
      }
      throw new Error(invoiceError.message);
    }
    if (!invoiceRow) return { invoiceId, status: "skipped", error: "Invoice not found" };

    // Only propagate what EveryStep itself considers void — EveryStep is the
    // source of truth, and this must never void a live invoice in QBO.
    if (invoiceRow.status !== "void") {
      return { invoiceId, status: "skipped", error: `Invoice status is '${invoiceRow.status}'` };
    }

    const qboInvoiceId = String(invoiceRow.qbo_invoice_id ?? "").trim();
    if (!qboInvoiceId) {
      // Never pushed, so there is nothing in QBO to void. Clear any stale marker.
      if (invoiceRow.qbo_void_status) {
        await recordVoidState(supabase, invoiceId, {
          qbo_void_status: null,
          qbo_void_error: null,
        });
      }
      return { invoiceId, status: "skipped", error: "Invoice was never synced to QuickBooks" };
    }

    // Durable intent: mark retryable BEFORE touching QBO, so a crash mid-call
    // leaves the sweep something to pick up rather than silent drift.
    await recordVoidState(supabase, invoiceId, { qbo_void_status: "pending" });

    const token = await getValidQboAccessToken({ supabase, accountOwnerUserId });
    if (!token) {
      const message = "QuickBooks is not connected — void will retry once it is reconnected";
      await recordVoidState(supabase, invoiceId, {
        qbo_void_status: "pending",
        qbo_void_error: message,
      });
      return { invoiceId, status: "skipped", error: message };
    }

    const baseUrl = getQboBaseUrl();
    const snapshot = await findQboInvoiceById({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      qboInvoiceId,
    });

    // Gone from QBO (deleted there, or a stale id) — nothing left to void.
    if (!snapshot) {
      await recordVoidState(supabase, invoiceId, {
        qbo_void_status: "voided",
        qbo_voided_at: new Date().toISOString(),
        qbo_void_error: null,
      });
      return { invoiceId, status: "voided" };
    }

    // Idempotent: already voided in QBO (by this lane, or by hand).
    if (snapshot.looksVoided) {
      await recordVoidState(supabase, invoiceId, {
        qbo_void_status: "voided",
        qbo_voided_at: new Date().toISOString(),
        qbo_sync_token: snapshot.syncToken,
        qbo_void_error: null,
      });
      return { invoiceId, status: "voided" };
    }

    // Payment guard. Voiding a paid QBO invoice leaves the payment applied to
    // nothing — an unapplied credit that misstates the books. A human has to
    // decide (refund, credit memo, reallocate), so this stops here.
    const appliedCents = toCents(snapshot.totalAmount) - toCents(snapshot.balance);
    if (appliedCents > 0) {
      const message =
        `QuickBooks shows $${(appliedCents / 100).toFixed(2)} already applied to invoice `
        + `${invoiceLabel(invoiceRow)}. It was NOT voided in QuickBooks — voiding a paid invoice `
        + `would leave that payment unapplied. Refund, credit, or reallocate the payment in `
        + `QuickBooks, then retry the void.`;
      await recordVoidState(supabase, invoiceId, {
        qbo_void_status: "blocked",
        qbo_sync_token: snapshot.syncToken,
        qbo_void_error: message,
      });
      return { invoiceId, status: "blocked", error: message };
    }

    const voided = await voidQboInvoice({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      qboInvoiceId,
      syncToken: snapshot.syncToken,
    });

    // Confirm against QBO instead of trusting the response. Production has
    // returned 2xx from the void endpoint on an invoice that stayed open, and
    // recording an unverified "voided" is worse than recording a failure: it
    // retires the row from the sweep and from the attention center, so the drift
    // becomes invisible again — the exact bug this lane exists to prevent.
    const confirmation = await findQboInvoiceById({
      accessToken: token.accessToken,
      realmId: token.realmId,
      baseUrl,
      qboInvoiceId,
    });
    if (confirmation && !confirmation.looksVoided) {
      const message =
        `QuickBooks accepted the void request but invoice ${invoiceLabel(invoiceRow)} is still open there `
        + `(total $${confirmation.totalAmount.toFixed(2)}, balance $${confirmation.balance.toFixed(2)}). `
        + `EveryStep did not modify it. Void it directly in QuickBooks, or retry.`;
      await recordVoidState(supabase, invoiceId, {
        qbo_void_status: "error",
        qbo_sync_token: confirmation.syncToken,
        qbo_void_error: message,
      });
      return { invoiceId, status: "error", error: message };
    }

    await recordVoidState(supabase, invoiceId, {
      qbo_void_status: "voided",
      qbo_voided_at: new Date().toISOString(),
      qbo_sync_token: confirmation?.syncToken ?? voided.syncToken,
      qbo_void_error: null,
    });
    return { invoiceId, status: "voided" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown QBO void error";
    await recordVoidState(supabase, invoiceId, {
      qbo_void_status: "error",
      qbo_void_error: message,
    });
    return { invoiceId, status: "error", error: message };
  }
}

/**
 * Fire-and-forget void propagation for the invoice-void mutation.
 *
 * Uses an admin (service-role) client for the same reason the issue-time
 * auto-sync does: only admins can read qbo_connections under RLS, but the void
 * must propagate regardless of who performed it.
 */
export async function autoVoidInvoiceInQbo(params: {
  accountOwnerUserId: string;
  invoiceId: string;
}): Promise<void> {
  try {
    if (!getQboAvailability().available) return;
    await voidInvoiceInQbo({
      supabase: createAdminClient(),
      accountOwnerUserId: params.accountOwnerUserId,
      invoiceId: params.invoiceId,
    });
  } catch {
    // Never block an invoice void on QuickBooks — failures are recorded on the
    // invoice row and retried by the bulk sweep.
  }
}

/**
 * Retry sweep for voids that have not reached QBO.
 *
 * Includes rows with a NULL void status on purpose: invoices voided before this
 * lane existed are exactly the silent-drift population, and the first bulk run
 * heals them. 'blocked' rows are excluded — they need a human, and re-running
 * must never escalate into voiding a paid invoice.
 */
export async function voidAllPendingInvoiceVoidsInQbo(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<{
  voided: number;
  blocked: number;
  errors: number;
  results: QboInvoiceVoidResult[];
}> {
  const { supabase, accountOwnerUserId } = params;
  const empty = { voided: 0, blocked: 0, errors: 0, results: [] as QboInvoiceVoidResult[] };

  try {
    if (!getQboAvailability().available) return empty;

    const { data: candidateRows, error: candidateError } = await supabase
      .from("internal_invoices")
      .select("id")
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("status", "void")
      .not("qbo_invoice_id", "is", null)
      .or("qbo_void_status.is.null,qbo_void_status.eq.pending,qbo_void_status.eq.error");
    if (candidateError || !candidateRows || candidateRows.length === 0) return empty;

    const results: QboInvoiceVoidResult[] = [];
    for (const row of candidateRows) {
      // Sequential — QBO throttles hard, same as the push sweep.
      results.push(await voidInvoiceInQbo({ supabase, accountOwnerUserId, invoiceId: String(row.id) }));
    }

    return {
      voided: results.filter((r) => r.status === "voided").length,
      blocked: results.filter((r) => r.status === "blocked").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    };
  } catch {
    return empty;
  }
}
