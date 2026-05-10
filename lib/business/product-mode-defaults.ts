import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";

export type ProductMode = "hybrid" | "ecc_hers" | "hvac_service";
export type JobTypeDefault = "ecc" | "service";

const DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME = "Compliance Matters";

const TEMPORARY_PRODUCT_MODE_OVERRIDES_BY_OWNER_ID: Record<string, ProductMode> = {
  // TODO: replace this temporary server-only seam with a real account-level product_mode/settings source.
  // Keep this map narrow and explicitly account-owned until the proper account setting exists.
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function isDefaultOwnerDisplayName(displayName: string) {
  return displayName.trim().toLowerCase() === DEFAULT_INTERNAL_BUSINESS_DISPLAY_NAME.toLowerCase();
}

export function resolveProductModeFromSignals(params: {
  accountOwnerUserId: string;
  displayName?: string | null;
  contractorCount?: number | null;
  overridesByOwnerId?: Record<string, ProductMode>;
}): ProductMode {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);
  const overrideMap = params.overridesByOwnerId ?? TEMPORARY_PRODUCT_MODE_OVERRIDES_BY_OWNER_ID;
  const explicitMode = overrideMap[accountOwnerUserId];

  if (explicitMode) return explicitMode;

  const displayName = toCleanString(params.displayName);
  if (displayName && isDefaultOwnerDisplayName(displayName)) {
    return "hybrid";
  }

  const contractorCount = Number(params.contractorCount ?? 0);
  if (Number.isFinite(contractorCount) && contractorCount > 0) {
    return "ecc_hers";
  }

  return "hvac_service";
}

export function resolveJobTypeDefaultForProductMode(mode: ProductMode): JobTypeDefault {
  return mode === "hvac_service" ? "service" : "ecc";
}

export async function resolveDefaultJobTypeForAccountOwnerId(params: {
  supabase: any;
  accountOwnerUserId: string;
  overridesByOwnerId?: Record<string, ProductMode>;
}): Promise<JobTypeDefault> {
  const accountOwnerUserId = toCleanString(params.accountOwnerUserId);

  if (!accountOwnerUserId) {
    return "ecc";
  }

  const [identity, contractorCountResult] = await Promise.all([
    resolveInternalBusinessIdentityByAccountOwnerId({
      supabase: params.supabase,
      accountOwnerUserId,
    }),
    params.supabase
      .from("contractors")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", accountOwnerUserId),
  ]);

  if (contractorCountResult.error) {
    throw contractorCountResult.error;
  }

  const mode = resolveProductModeFromSignals({
    accountOwnerUserId,
    displayName: identity.display_name,
    contractorCount: contractorCountResult.count,
    overridesByOwnerId: params.overridesByOwnerId,
  });

  return resolveJobTypeDefaultForProductMode(mode);
}