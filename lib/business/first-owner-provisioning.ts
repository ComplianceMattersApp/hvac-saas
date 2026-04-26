import { normalizeBillingMode, type BillingMode } from "@/lib/business/internal-business-profile";
import type { EntitlementStatus, PlatformPlanKey } from "@/lib/business/platform-entitlement";

export type FirstOwnerProvisioningStatus = "provisioned" | "confirmed" | "failed" | "dry_run";

type RecordKey =
  | "auth_user"
  | "profiles"
  | "internal_users"
  | "internal_business_profiles"
  | "platform_account_entitlements";

export type FirstOwnerProvisioningError = {
  code: string;
  message: string;
  stage:
    | "input"
    | "auth"
    | "profiles"
    | "internal_users"
    | "internal_business_profiles"
    | "platform_account_entitlements"
    | "invariants";
};

export type FirstOwnerProvisioningInviteIntent = {
  shouldSendInvite: boolean;
  email: string;
  authUserId: string | null;
  reason: string;
};

export type FirstOwnerProvisioningResult = {
  status: FirstOwnerProvisioningStatus;
  accountOwnerUserId: string | null;
  authUserId: string | null;
  recordsCreated: RecordKey[];
  recordsConfirmed: RecordKey[];
  recordsPatched: RecordKey[];
  inviteIntent: FirstOwnerProvisioningInviteIntent;
  warnings: string[];
  errors: FirstOwnerProvisioningError[];
};

export type FirstOwnerOperatorMetadata = {
  createdByUserId?: string | null;
  requestedBy?: string | null;
  note?: string | null;
};

export type FirstOwnerProvisioningInput = {
  targetEmail: string;
  ownerDisplayName?: string | null;
  businessDisplayName?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  defaultBillingMode?: BillingMode | string | null;
  operatorMetadata?: FirstOwnerOperatorMetadata;
  dryRun?: boolean;
};

export type ProvisioningAuthUser = {
  id: string;
  email: string | null;
};

export type ProvisioningProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export type ProvisioningInternalUserRow = {
  user_id: string;
  account_owner_user_id: string | null;
  role: string | null;
  is_active: boolean | null;
  created_by: string | null;
};

export type ProvisioningBusinessProfileRow = {
  account_owner_user_id: string;
  display_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  billing_mode: string | null;
};

export type ProvisioningEntitlementRow = {
  account_owner_user_id: string;
  plan_key: string | null;
  entitlement_status: string | null;
};

export type FirstOwnerProvisioningClient = {
  findAuthUserByEmail(email: string): Promise<ProvisioningAuthUser | null>;
  createAuthUser(input: {
    email: string;
    displayName: string;
    operatorMetadata?: FirstOwnerOperatorMetadata;
  }): Promise<ProvisioningAuthUser>;

  getProfileById(userId: string): Promise<ProvisioningProfileRow | null>;
  insertProfile(input: {
    id: string;
    email: string;
    full_name: string;
  }): Promise<ProvisioningProfileRow>;

  getInternalUserByUserId(userId: string): Promise<ProvisioningInternalUserRow | null>;
  upsertInternalUser(input: {
    user_id: string;
    account_owner_user_id: string;
    role: "admin";
    is_active: true;
    created_by: string | null;
  }): Promise<ProvisioningInternalUserRow>;

  getBusinessProfileByOwnerId(ownerUserId: string): Promise<ProvisioningBusinessProfileRow | null>;
  upsertBusinessProfile(input: {
    account_owner_user_id: string;
    display_name: string;
    support_email: string | null;
    support_phone: string | null;
    billing_mode: BillingMode;
  }): Promise<ProvisioningBusinessProfileRow>;

  getEntitlementByOwnerId(ownerUserId: string): Promise<ProvisioningEntitlementRow | null>;
  upsertEntitlement(input: {
    account_owner_user_id: string;
    plan_key: PlatformPlanKey;
    entitlement_status: EntitlementStatus;
  }): Promise<ProvisioningEntitlementRow>;
};

const DEFAULT_BUSINESS_NAME = "Compliance Matters";
const DEFAULT_PLAN_KEY: PlatformPlanKey = "starter";
const DEFAULT_ENTITLEMENT_STATUS: EntitlementStatus = "trial";

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return toCleanString(value).toLowerCase();
}

function dedupeRecordKeys(keys: RecordKey[]) {
  return Array.from(new Set(keys));
}

function pushError(
  errors: FirstOwnerProvisioningError[],
  error: FirstOwnerProvisioningError,
): FirstOwnerProvisioningResult {
  errors.push(error);

  return {
    status: "failed",
    accountOwnerUserId: null,
    authUserId: null,
    recordsCreated: [],
    recordsConfirmed: [],
    recordsPatched: [],
    inviteIntent: {
      shouldSendInvite: false,
      email: "",
      authUserId: null,
      reason: "failed",
    },
    warnings: [],
    errors,
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePlanKey(value: unknown): PlatformPlanKey {
  const v = toCleanString(value).toLowerCase();
  if (v === "professional") return "professional";
  if (v === "enterprise") return "enterprise";
  return DEFAULT_PLAN_KEY;
}

function normalizeEntitlementStatus(value: unknown): EntitlementStatus {
  const v = toCleanString(value).toLowerCase();
  if (v === "active") return "active";
  if (v === "grace") return "grace";
  if (v === "suspended") return "suspended";
  if (v === "cancelled") return "cancelled";
  return DEFAULT_ENTITLEMENT_STATUS;
}

export async function provisionFirstOwnerAccount(params: {
  input: FirstOwnerProvisioningInput;
  client: FirstOwnerProvisioningClient;
}): Promise<FirstOwnerProvisioningResult> {
  const { input, client } = params;

  const errors: FirstOwnerProvisioningError[] = [];
  const warnings: string[] = [];
  const recordsCreated: RecordKey[] = [];
  const recordsConfirmed: RecordKey[] = [];
  const recordsPatched: RecordKey[] = [];

  const email = normalizeEmail(input.targetEmail);
  const dryRun = Boolean(input.dryRun);
  const ownerDisplayName = toCleanString(input.ownerDisplayName) || email;
  const businessDisplayName =
    toCleanString(input.businessDisplayName) ||
    toCleanString(input.ownerDisplayName) ||
    DEFAULT_BUSINESS_NAME;
  const supportEmail = normalizeEmail(input.supportEmail);
  const supportPhone = toCleanString(input.supportPhone);
  const billingMode = normalizeBillingMode(input.defaultBillingMode);

  if (!email || !isValidEmail(email)) {
    return pushError(errors, {
      code: "INVALID_TARGET_EMAIL",
      message: "A valid target email is required.",
      stage: "input",
    });
  }

  try {
    let authUser = await client.findAuthUserByEmail(email);

    if (!authUser) {
      if (dryRun) {
        warnings.push("dry_run: auth user would be created.");
        return {
          status: "dry_run",
          accountOwnerUserId: null,
          authUserId: null,
          recordsCreated: ["auth_user"],
          recordsConfirmed: [],
          recordsPatched: [],
          inviteIntent: {
            shouldSendInvite: false,
            email,
            authUserId: null,
            reason: "dry_run",
          },
          warnings,
          errors,
        };
      }

      authUser = await client.createAuthUser({
        email,
        displayName: ownerDisplayName,
        operatorMetadata: input.operatorMetadata,
      });
      recordsCreated.push("auth_user");
    } else {
      recordsConfirmed.push("auth_user");
    }

    const authUserId = toCleanString(authUser?.id);
    if (!authUserId) {
      return pushError(errors, {
        code: "AUTH_IDENTITY_UNRESOLVED",
        message: "Auth identity could not be resolved.",
        stage: "auth",
      });
    }

    let profile = await client.getProfileById(authUserId);
    if (!profile) {
      if (dryRun) {
        warnings.push("dry_run: profile row would be created.");
      } else {
        profile = await client.insertProfile({
          id: authUserId,
          email,
          full_name: ownerDisplayName || email,
        });
        recordsCreated.push("profiles");
      }
    } else {
      recordsConfirmed.push("profiles");
    }

    if (!dryRun && !profile?.id) {
      return pushError(errors, {
        code: "PROFILE_UNRESOLVED",
        message: "Profile identity could not be resolved.",
        stage: "profiles",
      });
    }

    let internalUser = await client.getInternalUserByUserId(authUserId);

    if (internalUser?.user_id) {
      if (toCleanString(internalUser.account_owner_user_id) !== authUserId) {
        return pushError(errors, {
          code: "INTERNAL_OWNER_MISMATCH",
          message: "Existing internal user is anchored to a different account owner.",
          stage: "internal_users",
        });
      }

      const role = toCleanString(internalUser.role).toLowerCase();
      const isActive = Boolean(internalUser.is_active);

      if (role !== "admin" || !isActive) {
        if (dryRun) {
          warnings.push("dry_run: internal owner row would be patched to admin + active.");
        } else {
          internalUser = await client.upsertInternalUser({
            user_id: authUserId,
            account_owner_user_id: authUserId,
            role: "admin",
            is_active: true,
            created_by: toCleanString(input.operatorMetadata?.createdByUserId) || null,
          });
          recordsPatched.push("internal_users");
        }
      } else {
        recordsConfirmed.push("internal_users");
      }
    } else {
      if (dryRun) {
        warnings.push("dry_run: internal owner row would be created.");
      } else {
        internalUser = await client.upsertInternalUser({
          user_id: authUserId,
          account_owner_user_id: authUserId,
          role: "admin",
          is_active: true,
          created_by: toCleanString(input.operatorMetadata?.createdByUserId) || null,
        });
        recordsCreated.push("internal_users");
      }
    }

    let businessProfile = await client.getBusinessProfileByOwnerId(authUserId);

    if (businessProfile?.account_owner_user_id) {
      if (toCleanString(businessProfile.account_owner_user_id) !== authUserId) {
        return pushError(errors, {
          code: "BUSINESS_PROFILE_OWNER_MISMATCH",
          message: "Business profile belongs to a different owner.",
          stage: "internal_business_profiles",
        });
      }

      const needsPatch =
        !toCleanString(businessProfile.display_name) ||
        !toCleanString(businessProfile.support_email) && Boolean(supportEmail) ||
        !toCleanString(businessProfile.support_phone) && Boolean(supportPhone) ||
        !toCleanString(businessProfile.billing_mode);

      if (needsPatch) {
        if (dryRun) {
          warnings.push("dry_run: business profile would be patched for missing defaults.");
        } else {
          businessProfile = await client.upsertBusinessProfile({
            account_owner_user_id: authUserId,
            display_name: toCleanString(businessProfile.display_name) || businessDisplayName,
            support_email: toCleanString(businessProfile.support_email) || supportEmail || null,
            support_phone: toCleanString(businessProfile.support_phone) || supportPhone || null,
            billing_mode: toCleanString(businessProfile.billing_mode)
              ? normalizeBillingMode(businessProfile.billing_mode)
              : billingMode,
          });
          recordsPatched.push("internal_business_profiles");
        }
      } else {
        recordsConfirmed.push("internal_business_profiles");
      }
    } else {
      if (dryRun) {
        warnings.push("dry_run: business profile row would be created.");
      } else {
        businessProfile = await client.upsertBusinessProfile({
          account_owner_user_id: authUserId,
          display_name: businessDisplayName,
          support_email: supportEmail || null,
          support_phone: supportPhone || null,
          billing_mode: billingMode,
        });
        recordsCreated.push("internal_business_profiles");
      }
    }

    let entitlement = await client.getEntitlementByOwnerId(authUserId);

    if (entitlement?.account_owner_user_id) {
      if (toCleanString(entitlement.account_owner_user_id) !== authUserId) {
        return pushError(errors, {
          code: "ENTITLEMENT_OWNER_MISMATCH",
          message: "Entitlement row belongs to a different owner.",
          stage: "platform_account_entitlements",
        });
      }

      const needsPatch =
        !toCleanString(entitlement.plan_key) || !toCleanString(entitlement.entitlement_status);

      if (needsPatch) {
        if (dryRun) {
          warnings.push("dry_run: entitlement row would be patched for missing defaults.");
        } else {
          entitlement = await client.upsertEntitlement({
            account_owner_user_id: authUserId,
            plan_key: normalizePlanKey(entitlement.plan_key),
            entitlement_status: normalizeEntitlementStatus(entitlement.entitlement_status),
          });
          recordsPatched.push("platform_account_entitlements");
        }
      } else {
        recordsConfirmed.push("platform_account_entitlements");
      }
    } else {
      if (dryRun) {
        warnings.push("dry_run: entitlement row would be created.");
      } else {
        entitlement = await client.upsertEntitlement({
          account_owner_user_id: authUserId,
          plan_key: DEFAULT_PLAN_KEY,
          entitlement_status: DEFAULT_ENTITLEMENT_STATUS,
        });
        recordsCreated.push("platform_account_entitlements");
      }
    }

    if (!dryRun) {
      const invariantFailures: string[] = [];

      if (!profile?.id || toCleanString(profile.id) !== authUserId) {
        invariantFailures.push("PROFILE_MISSING_OR_MISMATCHED");
      }

      if (
        !internalUser?.user_id ||
        toCleanString(internalUser.user_id) !== authUserId ||
        toCleanString(internalUser.account_owner_user_id) !== authUserId ||
        toCleanString(internalUser.role).toLowerCase() !== "admin" ||
        !Boolean(internalUser.is_active)
      ) {
        invariantFailures.push("INTERNAL_OWNER_ROW_INVALID");
      }

      if (
        !businessProfile?.account_owner_user_id ||
        toCleanString(businessProfile.account_owner_user_id) !== authUserId
      ) {
        invariantFailures.push("BUSINESS_PROFILE_INVALID");
      }

      if (
        !entitlement?.account_owner_user_id ||
        toCleanString(entitlement.account_owner_user_id) !== authUserId
      ) {
        invariantFailures.push("ENTITLEMENT_INVALID");
      }

      if (invariantFailures.length > 0) {
        return pushError(errors, {
          code: "INVARIANT_NOT_CONFIRMED",
          message: `Required invariants could not be confirmed: ${invariantFailures.join(", ")}`,
          stage: "invariants",
        });
      }
    }

    const created = dedupeRecordKeys(recordsCreated);
    const patched = dedupeRecordKeys(recordsPatched);
    const confirmed = dedupeRecordKeys(
      recordsConfirmed.filter((k) => !created.includes(k) && !patched.includes(k)),
    );

    return {
      status: dryRun
        ? "dry_run"
        : created.length > 0 || patched.length > 0
          ? "provisioned"
          : "confirmed",
      accountOwnerUserId: authUserId,
      authUserId,
      recordsCreated: created,
      recordsConfirmed: confirmed,
      recordsPatched: patched,
      inviteIntent: {
        shouldSendInvite: !dryRun,
        email,
        authUserId,
        reason: dryRun ? "dry_run" : "ready_for_invite",
      },
      warnings,
      errors,
    };
  } catch (error) {
    return pushError(errors, {
      code: "PROVISIONING_UNEXPECTED_FAILURE",
      message: error instanceof Error ? error.message : "Unexpected provisioning failure.",
      stage: "invariants",
    });
  }
}
