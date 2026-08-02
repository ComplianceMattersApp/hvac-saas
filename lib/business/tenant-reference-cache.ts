import { unstable_cache } from "next/cache";

import {
  getInternalBusinessProfileByAccountOwnerId,
  DEFAULT_BILLING_MODE,
  type BillingMode,
  type InternalBusinessProfile,
  type ResolvedInternalBusinessIdentity,
} from "@/lib/business/internal-business-profile";
import {
  resolveProductModeForAccountOwnerId,
  type ProductMode,
} from "@/lib/business/product-mode-defaults";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeAccountTimeZone } from "@/lib/utils/account-time-zone";

/**
 * Cross-request cache for per-tenant reference data (business profile row and
 * product mode). These values change only through explicit admin actions but
 * were re-read from Supabase on every page render — including the root layout,
 * so every navigation paid for them.
 *
 * Contract:
 * - Callers must pass an accountOwnerUserId the current actor is already
 *   authorized for (the same contract the uncached resolvers rely on). The
 *   cache callback reads with the admin client because it runs outside the
 *   request scope and cannot use the cookie-bound client.
 * - Server actions that write internal_business_profiles or
 *   account_settings.product_mode must call updateTag with
 *   tenantReferenceCacheTag(accountOwnerUserId) so the next render sees the
 *   change immediately. The short TTL is a safety net for write paths outside
 *   the app (SQL, provisioning scripts), not the primary invalidation.
 * - Mutating flows that need read-after-write freshness should keep using the
 *   uncached resolvers.
 */
const TENANT_REFERENCE_REVALIDATE_SECONDS = 300;

export function tenantReferenceCacheTag(accountOwnerUserId: string) {
  return `tenant-reference:${String(accountOwnerUserId ?? "").trim()}`;
}

const DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME = "Compliance Matters";

export async function getCachedInternalBusinessProfile(
  accountOwnerUserId: string | null | undefined,
): Promise<InternalBusinessProfile | null> {
  const id = String(accountOwnerUserId ?? "").trim();
  if (!id) return null;

  return unstable_cache(
    async () =>
      getInternalBusinessProfileByAccountOwnerId({
        supabase: createAdminClient(),
        accountOwnerUserId: id,
      }),
    ["tenant-business-profile", id],
    {
      revalidate: TENANT_REFERENCE_REVALIDATE_SECONDS,
      tags: [tenantReferenceCacheTag(id)],
    },
  )();
}

export async function getCachedProductMode(
  accountOwnerUserId: string | null | undefined,
): Promise<ProductMode> {
  const id = String(accountOwnerUserId ?? "").trim();
  if (!id) return "hybrid";

  return unstable_cache(
    async () =>
      resolveProductModeForAccountOwnerId({
        supabase: createAdminClient(),
        accountOwnerUserId: id,
      }),
    ["tenant-product-mode", id],
    {
      revalidate: TENANT_REFERENCE_REVALIDATE_SECONDS,
      tags: [tenantReferenceCacheTag(id)],
    },
  )();
}

// The derived getters below all read the same cached profile row, so a page
// that needs identity + billing mode + time zone costs one cached lookup
// instead of three queries.

export async function getCachedBillingMode(
  accountOwnerUserId: string | null | undefined,
): Promise<BillingMode> {
  const profile = await getCachedInternalBusinessProfile(accountOwnerUserId);
  return profile?.billing_mode ?? DEFAULT_BILLING_MODE;
}

export async function getCachedAccountTimeZone(
  accountOwnerUserId: string | null | undefined,
): Promise<string> {
  const profile = await getCachedInternalBusinessProfile(accountOwnerUserId);
  return normalizeAccountTimeZone(profile?.time_zone);
}

export async function getCachedInternalBusinessIdentity(
  accountOwnerUserId: string | null | undefined,
): Promise<ResolvedInternalBusinessIdentity> {
  const profile = await getCachedInternalBusinessProfile(accountOwnerUserId);

  return {
    display_name: profile?.display_name ?? DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME,
    support_email: profile?.support_email ?? null,
    support_phone: profile?.support_phone ?? null,
    logo_url: profile?.logo_url ?? null,
    google_review_url: profile?.google_review_url ?? null,
  };
}
