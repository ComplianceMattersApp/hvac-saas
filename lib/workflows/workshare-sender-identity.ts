import { createAdminClient } from "@/lib/supabase/server";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";

// Sender display names live in internal_business_profiles, which is RLS-scoped
// to each sender's own account. A receiver cannot read them under account-scoped
// RLS, so resolve sender company names with the service-role client for this
// lookup only. Shared by the incoming and decided receiver surfaces.
export async function resolveWorkshareSenderCompanyNames(
  requests: AccountWorkshareRequestRow[],
): Promise<Map<string, string>> {
  const senderNameById = new Map<string, string>();

  const uniqueSenderIds = Array.from(
    new Set(
      requests
        .map((request) => String(request.sender_account_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (uniqueSenderIds.length === 0) return senderNameById;

  const admin = createAdminClient();
  const resolved = await Promise.all(
    uniqueSenderIds.map(async (senderId) => {
      const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
        accountOwnerUserId: senderId,
        supabase: admin,
      });
      return [senderId, identity.display_name] as const;
    }),
  );

  for (const [senderId, displayName] of resolved) {
    senderNameById.set(senderId, displayName);
  }

  return senderNameById;
}
