"use server";

import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import {
  findSmsBackfillCandidates,
  provisionCustomerSmsRecipientAndConsent,
} from "@/lib/communications/sms-consent-provisioning";
import { SMS_CONSENT_SOURCE_SERVICE_RELATIONSHIP_BACKFILL } from "@/lib/communications/sms-consent-constants";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Legacy customer SMS backfill — admin-only, account-scoped, batched.
 *
 * Provisions the customer_primary recipient + on_the_way consent for existing
 * customers that predate intake provisioning. Per batch:
 * - phones with an ACTIVE suppression are skipped entirely (STOP always wins;
 *   no consent row is written for them)
 * - existing consent decisions are never touched (provisioning contract)
 * - consent source is service_relationship_backfill for audit clarity
 *
 * Idempotent and re-runnable: click until the pending count reaches zero.
 */

const COMMUNICATIONS_PATH = "/ops/admin/communications";
const BACKFILL_BATCH_SIZE = 200;

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

export async function backfillCustomerSmsProvisioningFromForm(): Promise<void> {
  const supabase = await createClient();

  let accountOwnerUserId: string;
  let actingUserId: string;

  try {
    const ctx = await requireInternalRole("admin", { supabase });
    accountOwnerUserId = asTrimmed(ctx.internalUser.account_owner_user_id);
    actingUserId = asTrimmed(ctx.internalUser.user_id);
  } catch {
    redirect(`${COMMUNICATIONS_PATH}?notice=admin_required`);
  }

  const admin = createAdminClient();

  let provisionedCount = 0;
  let suppressedSkippedCount = 0;

  try {
    const { candidates } = await findSmsBackfillCandidates({
      supabase: admin,
      accountOwnerUserId,
      limit: BACKFILL_BATCH_SIZE,
    });

    if (candidates.length > 0) {
      // One suppression read for the whole batch: skip any phone with an
      // active suppression of any type.
      const suppressionResponse = await admin
        .from("contact_recipient_suppressions")
        .select("phone_e164")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("is_active", true)
        .not("phone_e164", "is", null);

      if (suppressionResponse?.error) {
        throw suppressionResponse.error;
      }

      const suppressedLast10 = new Set(
        (Array.isArray(suppressionResponse?.data) ? suppressionResponse.data : [])
          .map((row: any) => asTrimmed(row?.phone_e164).replace(/\D/g, "").slice(-10))
          .filter(Boolean),
      );

      for (const candidate of candidates) {
        const candidateLast10 = candidate.phoneRaw.replace(/\D/g, "").slice(-10);
        if (candidateLast10 && suppressedLast10.has(candidateLast10)) {
          suppressedSkippedCount += 1;
          continue;
        }

        await provisionCustomerSmsRecipientAndConsent({
          supabase: admin,
          accountOwnerUserId,
          actingUserId,
          customerId: candidate.customerId,
          displayName: candidate.displayName,
          phoneRaw: candidate.phoneRaw,
          consentSourceOverride: SMS_CONSENT_SOURCE_SERVICE_RELATIONSHIP_BACKFILL,
        });
        provisionedCount += 1;
      }
    }
  } catch {
    redirect(`${COMMUNICATIONS_PATH}?notice=sms_backfill_failed`);
  }

  redirect(
    `${COMMUNICATIONS_PATH}?notice=sms_backfill_completed&backfilled=${provisionedCount}&skipped_suppressed=${suppressedSkippedCount}`,
  );
}
