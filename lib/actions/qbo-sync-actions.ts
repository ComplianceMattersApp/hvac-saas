"use server";

import { revalidatePath } from "next/cache";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { getQboAvailability } from "@/lib/qbo/qbo-env";
import { getQboConnectionForAccount } from "@/lib/qbo/qbo-connection";
import { syncAllPendingInvoicesToQbo } from "@/lib/qbo/qbo-sync";

const COMPANY_PROFILE_PATH = "/ops/admin/company-profile";

export interface QboSyncActionResult {
  synced: number;
  skipped: number;
  errors: number;
  message: string;
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
