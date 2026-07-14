import { createAdminClient } from "@/lib/supabase/server";

import { getQboAvailability } from "./qbo-env";
import { syncInvoiceToQbo } from "./qbo-sync";

/**
 * Auto-sync a just-issued invoice to QuickBooks Online.
 *
 * Best-effort by design: this NEVER throws, so it can be awaited inside the
 * invoice-issue mutation without ever blocking issuance. Behavior:
 *  - QBO not configured for this environment (missing env vars) → no-op.
 *  - Account has no QBO connection → syncInvoiceToQbo returns "skipped" (no-op).
 *  - Transient QBO failure → recorded on the invoice (qbo_sync_status='error')
 *    by the sync engine, picked up by the next "Sync pending invoices" retry.
 *  - Invoice ineligible (draft/void/pre-cutoff/disposition/no lines) → skipped
 *    by the sync engine's own gates.
 *
 * Uses an admin (service-role) client so it works regardless of which role
 * issued the invoice — a field tech issuing an invoice still triggers the sync,
 * even though only admins can read qbo_connections under RLS.
 */
export async function autoSyncIssuedInvoiceToQbo(params: {
  accountOwnerUserId: string;
  invoiceId: string;
}): Promise<void> {
  try {
    if (!getQboAvailability().available) return;
    const admin = createAdminClient();
    await syncInvoiceToQbo({
      supabase: admin,
      accountOwnerUserId: params.accountOwnerUserId,
      invoiceId: params.invoiceId,
    });
  } catch {
    // Never block invoice issuance on QBO sync — failures are surfaced on the
    // invoice row (or ignored when QBO is not configured/connected).
  }
}
