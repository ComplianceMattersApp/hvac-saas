"use server";

import { createAdminClient } from "@/lib/supabase/server";
import {
  provisionFirstOwnerAccount,
  type FirstOwnerProvisioningClient,
  type FirstOwnerProvisioningInput,
  type FirstOwnerProvisioningResult,
} from "@/lib/business/first-owner-provisioning";
import {
  orchestrateFirstOwnerInvite,
  type FirstOwnerInviteDeps,
} from "@/lib/business/first-owner-invite";
import { sendPlatformOwnerSignupNotification } from "@/lib/business/platform-owner-signup-notification";
import type { ProductMode } from "@/lib/business/product-mode-defaults";
import type { PricebookSeedInsertRow } from "@/lib/business/pricebook-seeding";
import { resolveInviteRedirectTo } from "@/lib/utils/resolve-invite-redirect-to";
import type {
  SelfServeFieldErrors,
  SelfServeOnboardingDeps,
  SelfServeOnboardingState,
} from "@/lib/actions/self-serve-onboarding-state";

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return toCleanString(value).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveProductModeFromSignupIntent(value: unknown): ProductMode | null | "invalid" {
  const intent = toCleanString(value).toLowerCase();
  if (!intent) return null;
  if (intent === "service") return "hvac_service";
  if (intent === "ecc") return "ecc_hers";
  return "invalid";
}

function resolveSignupPath(value: ProductMode | null): "generic" | "service" | "ecc" {
  if (value === "hvac_service") return "service";
  if (value === "ecc_hers") return "ecc";
  return "generic";
}

function resolveInviteStatus(inviteResult: {
  inviteSent: boolean;
  inviteSkippedReason?: string;
  errors: Array<{ code: string }>;
}) {
  if (inviteResult.inviteSent) return "invite_sent";
  if (inviteResult.errors.length > 0) {
    return `invite_error:${inviteResult.errors.map((error) => error.code).join(",")}`;
  }
  if (inviteResult.inviteSkippedReason) {
    return `invite_skipped:${inviteResult.inviteSkippedReason}`;
  }
  return "invite_not_sent";
}

function submittedNeutralState(): SelfServeOnboardingState {
  return {
    status: "submitted",
    message: "If eligible, we will email a secure setup link with next steps.",
  };
}

function createProvisioningClientFromAdmin(admin: any): FirstOwnerProvisioningClient {
  return {
    async findAuthUserByEmail(email) {
      let page = 1;
      while (page <= 10) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const users = Array.isArray((data as any)?.users) ? (data as any).users : [];
        const match = users.find((u: any) => toCleanString(u?.email).toLowerCase() === toCleanString(email).toLowerCase());
        if (match?.id) {
          return {
            id: String(match.id),
            email: toCleanString(match.email) || null,
          };
        }
        if (users.length < 200) break;
        page += 1;
      }
      return null;
    },

    async createAuthUser(input) {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email,
        email_confirm: false,
        user_metadata: {
          full_name: input.displayName,
          first_name: toCleanString(input.displayName).split(/\s+/)[0] || input.displayName,
        },
      });
      if (error) throw error;

      const user = (data as any)?.user;
      if (!user?.id) {
        throw new Error("Auth user create returned no user id");
      }

      return {
        id: String(user.id),
        email: toCleanString(user.email) || null,
      };
    },

    async getProfileById(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) return null;
      return {
        id: String(data.id),
        email: toCleanString(data.email) || null,
        full_name: toCleanString(data.full_name) || null,
      };
    },

    async insertProfile(input) {
      const { data, error } = await admin
        .from("profiles")
        .insert({
          id: input.id,
          email: input.email,
          full_name: input.full_name,
        })
        .select("id, email, full_name")
        .single();
      if (error) throw error;
      return {
        id: String(data.id),
        email: toCleanString(data.email) || null,
        full_name: toCleanString(data.full_name) || null,
      };
    },

    async getInternalUserByUserId(userId) {
      const { data, error } = await admin
        .from("internal_users")
        .select("user_id, account_owner_user_id, role, is_active, created_by")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.user_id) return null;
      return {
        user_id: String(data.user_id),
        account_owner_user_id: toCleanString(data.account_owner_user_id) || null,
        role: toCleanString(data.role) || null,
        is_active: Boolean(data.is_active),
        created_by: toCleanString(data.created_by) || null,
      };
    },

    async upsertInternalUser(input) {
      const { data, error } = await admin
        .from("internal_users")
        .upsert(
          {
            user_id: input.user_id,
            account_owner_user_id: input.account_owner_user_id,
            role: input.role,
            is_active: input.is_active,
            created_by: input.created_by,
          },
          { onConflict: "user_id" },
        )
        .select("user_id, account_owner_user_id, role, is_active, created_by")
        .single();
      if (error) throw error;
      return {
        user_id: String(data.user_id),
        account_owner_user_id: toCleanString(data.account_owner_user_id) || null,
        role: toCleanString(data.role) || null,
        is_active: Boolean(data.is_active),
        created_by: toCleanString(data.created_by) || null,
      };
    },

    async getBusinessProfileByOwnerId(ownerUserId) {
      const { data, error } = await admin
        .from("internal_business_profiles")
        .select("account_owner_user_id, display_name, support_email, support_phone, billing_mode")
        .eq("account_owner_user_id", ownerUserId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.account_owner_user_id) return null;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        display_name: toCleanString(data.display_name) || null,
        support_email: toCleanString(data.support_email) || null,
        support_phone: toCleanString(data.support_phone) || null,
        billing_mode: toCleanString(data.billing_mode) || null,
      };
    },

    async upsertBusinessProfile(input) {
      const { data, error } = await admin
        .from("internal_business_profiles")
        .upsert(
          {
            account_owner_user_id: input.account_owner_user_id,
            display_name: input.display_name,
            support_email: input.support_email,
            support_phone: input.support_phone,
            billing_mode: input.billing_mode,
          },
          { onConflict: "account_owner_user_id" },
        )
        .select("account_owner_user_id, display_name, support_email, support_phone, billing_mode")
        .single();
      if (error) throw error;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        display_name: toCleanString(data.display_name) || null,
        support_email: toCleanString(data.support_email) || null,
        support_phone: toCleanString(data.support_phone) || null,
        billing_mode: toCleanString(data.billing_mode) || null,
      };
    },

    async getEntitlementByOwnerId(ownerUserId) {
      const { data, error } = await admin
        .from("platform_account_entitlements")
        .select(
          [
            "account_owner_user_id",
            "plan_key",
            "entitlement_status",
            "seat_limit",
            "trial_ends_at",
            "entitlement_valid_until",
            "stripe_customer_id",
            "stripe_subscription_id",
            "stripe_price_id",
            "stripe_subscription_status",
            "stripe_current_period_end",
            "stripe_cancel_at_period_end",
            "notes",
          ].join(", "),
        )
        .eq("account_owner_user_id", ownerUserId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.account_owner_user_id) return null;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        plan_key: toCleanString(data.plan_key) || null,
        entitlement_status: toCleanString(data.entitlement_status) || null,
        seat_limit: Number.isInteger(Number(data.seat_limit)) ? Number(data.seat_limit) : null,
        trial_ends_at: toCleanString(data.trial_ends_at) || null,
        entitlement_valid_until: toCleanString(data.entitlement_valid_until) || null,
        stripe_customer_id: toCleanString(data.stripe_customer_id) || null,
        stripe_subscription_id: toCleanString(data.stripe_subscription_id) || null,
        stripe_price_id: toCleanString(data.stripe_price_id) || null,
        stripe_subscription_status: toCleanString(data.stripe_subscription_status) || null,
        stripe_current_period_end: toCleanString(data.stripe_current_period_end) || null,
        stripe_cancel_at_period_end: Boolean(data.stripe_cancel_at_period_end),
        notes: toCleanString(data.notes) || null,
      };
    },

    async upsertEntitlement(input) {
      const payload: Record<string, unknown> = {
        account_owner_user_id: input.account_owner_user_id,
        plan_key: input.plan_key,
        entitlement_status: input.entitlement_status,
      };

      if ("seat_limit" in input) payload.seat_limit = input.seat_limit ?? null;
      if ("trial_ends_at" in input) payload.trial_ends_at = input.trial_ends_at ?? null;
      if ("entitlement_valid_until" in input) {
        payload.entitlement_valid_until = input.entitlement_valid_until ?? null;
      }
      if ("stripe_customer_id" in input) payload.stripe_customer_id = input.stripe_customer_id ?? null;
      if ("stripe_subscription_id" in input) {
        payload.stripe_subscription_id = input.stripe_subscription_id ?? null;
      }
      if ("stripe_price_id" in input) payload.stripe_price_id = input.stripe_price_id ?? null;
      if ("stripe_subscription_status" in input) {
        payload.stripe_subscription_status = input.stripe_subscription_status ?? null;
      }
      if ("stripe_current_period_end" in input) {
        payload.stripe_current_period_end = input.stripe_current_period_end ?? null;
      }
      if ("stripe_cancel_at_period_end" in input) {
        payload.stripe_cancel_at_period_end = Boolean(input.stripe_cancel_at_period_end);
      }
      if ("notes" in input) payload.notes = input.notes ?? null;

      const { data, error } = await admin
        .from("platform_account_entitlements")
        .upsert(payload, { onConflict: "account_owner_user_id" })
        .select(
          [
            "account_owner_user_id",
            "plan_key",
            "entitlement_status",
            "seat_limit",
            "trial_ends_at",
            "entitlement_valid_until",
            "stripe_customer_id",
            "stripe_subscription_id",
            "stripe_price_id",
            "stripe_subscription_status",
            "stripe_current_period_end",
            "stripe_cancel_at_period_end",
            "notes",
          ].join(", "),
        )
        .single();
      if (error) throw error;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        plan_key: toCleanString(data.plan_key) || null,
        entitlement_status: toCleanString(data.entitlement_status) || null,
        seat_limit: Number.isInteger(Number(data.seat_limit)) ? Number(data.seat_limit) : null,
        trial_ends_at: toCleanString(data.trial_ends_at) || null,
        entitlement_valid_until: toCleanString(data.entitlement_valid_until) || null,
        stripe_customer_id: toCleanString(data.stripe_customer_id) || null,
        stripe_subscription_id: toCleanString(data.stripe_subscription_id) || null,
        stripe_price_id: toCleanString(data.stripe_price_id) || null,
        stripe_subscription_status: toCleanString(data.stripe_subscription_status) || null,
        stripe_current_period_end: toCleanString(data.stripe_current_period_end) || null,
        stripe_cancel_at_period_end: Boolean(data.stripe_cancel_at_period_end),
        notes: toCleanString(data.notes) || null,
      };
    },

    async getAccountSettingsByOwnerId(ownerUserId) {
      const { data, error } = await admin
        .from("account_settings")
        .select("account_owner_user_id, product_mode")
        .eq("account_owner_user_id", ownerUserId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.account_owner_user_id) return null;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        product_mode: toCleanString(data.product_mode) || null,
      };
    },

    async upsertAccountSettings(input) {
      const { data, error } = await admin
        .from("account_settings")
        .upsert(
          {
            account_owner_user_id: input.account_owner_user_id,
            product_mode: input.product_mode,
            product_mode_updated_at: new Date().toISOString(),
            product_mode_updated_by_user_id: input.product_mode_updated_by_user_id,
          },
          { onConflict: "account_owner_user_id" },
        )
        .select("account_owner_user_id, product_mode")
        .single();
      if (error) throw error;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        product_mode: toCleanString(data.product_mode) || null,
      };
    },

    async listExistingPricebookSeedRows(ownerUserId) {
      const { data, error } = await admin
        .from("pricebook_items")
        .select("seed_key, item_name")
        .eq("account_owner_user_id", ownerUserId)
        .not("seed_key", "is", null);
      if (error) throw error;
      return Array.isArray(data)
        ? data
            .map((row: any) => ({
              seed_key: toCleanString(row?.seed_key),
              item_name: toCleanString(row?.item_name),
            }))
            .filter((row) => row.seed_key)
        : [];
    },

    async insertPricebookSeedRows(rows: PricebookSeedInsertRow[]) {
      if (rows.length === 0) return;

      const { error } = await admin.from("pricebook_items").insert(
        rows.map((row) => ({
          account_owner_user_id: row.account_owner_user_id,
          seed_key: row.seed_key,
          starter_version: row.starter_version,
          item_name: row.item_name,
          item_type: row.item_type,
          category: row.category,
          default_description: row.default_description,
          default_unit_price: row.default_unit_price,
          unit_label: row.unit_label,
          is_active: row.is_active,
          is_starter: row.is_starter,
        })),
      );
      if (error) throw error;
    },
  };
}

function createRealDeps(): SelfServeOnboardingDeps {
  const admin = createAdminClient();
  const provisioningClient = createProvisioningClientFromAdmin(admin);

  const inviteDeps: FirstOwnerInviteDeps = {
    getAuthUserById: async (userId: string) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      const user = (data as any)?.user;
      if (!user?.id) return null;
      return {
        id: String(user.id),
        email: toCleanString(user.email) || null,
        invitedAt: toCleanString(user.invited_at) || null,
        emailConfirmedAt: toCleanString(user.email_confirmed_at || user.confirmed_at) || null,
      };
    },
    setUserMetadata: async (userId, metadata) => {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: metadata,
      });
      if (error) throw error;
    },
    sendInvite: async ({ email, redirectTo, metadata }) => {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: metadata,
      });
      if (error) throw error;
    },
    resolveInviteRedirectTo,
    nowIso: () => new Date().toISOString(),
  };

  return {
    provision: async (input) => provisionFirstOwnerAccount({ input, client: provisioningClient }),
    invite: async (params) => orchestrateFirstOwnerInvite({ ...params, deps: inviteDeps }),
    loadOwnerSnapshot: async ({ accountOwnerUserId }) => {
      const ownerId = toCleanString(accountOwnerUserId);
      if (!ownerId) return null;

      const [{ data: businessProfile }, { data: entitlement }, { data: profile }] = await Promise.all([
        admin
          .from("internal_business_profiles")
          .select("display_name, billing_mode")
          .eq("account_owner_user_id", ownerId)
          .maybeSingle(),
        admin
          .from("platform_account_entitlements")
          .select("plan_key, entitlement_status")
          .eq("account_owner_user_id", ownerId)
          .maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", ownerId).maybeSingle(),
      ]);

      return {
        companyName: toCleanString((businessProfile as any)?.display_name) || null,
        ownerDisplayName: toCleanString((profile as any)?.full_name) || null,
        billingMode: toCleanString((businessProfile as any)?.billing_mode) || null,
        planKey: toCleanString((entitlement as any)?.plan_key) || null,
        entitlementStatus: toCleanString((entitlement as any)?.entitlement_status) || null,
      };
    },
    notifyPlatformOwnerSignup: async (params) =>
      sendPlatformOwnerSignupNotification({
        companyName: params.companyName,
        ownerEmail: params.ownerEmail,
        ownerDisplayName: params.ownerDisplayName,
        signupPath: params.signupPath,
        productMode: params.productMode,
        billingMode: params.billingMode,
        entitlementStatus: params.entitlementStatus,
        planKey: params.planKey,
        accountOwnerUserId: params.accountOwnerUserId,
        inviteStatus: params.inviteStatus,
        timestampIso: params.timestampIso,
      }),
    log: (message, details) => {
      console.warn(message, details ?? {});
    },
  };
}

export async function submitSelfServeOnboardingForm(
  _prevState: SelfServeOnboardingState,
  formData: FormData,
  deps: SelfServeOnboardingDeps = createRealDeps(),
): Promise<SelfServeOnboardingState> {
  const email = normalizeEmail(formData.get("email"));
  const ownerDisplayName = toCleanString(formData.get("owner_display_name"));
  const businessDisplayName = toCleanString(formData.get("business_display_name"));
  const selectedProductMode = resolveProductModeFromSignupIntent(
    formData.get("product_signup_intent"),
  );

  const fieldErrors: SelfServeFieldErrors = {};

  if (!email || !isValidEmail(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (!ownerDisplayName) {
    fieldErrors.ownerDisplayName = "Enter the account owner name.";
  }

  if (!businessDisplayName) {
    fieldErrors.businessDisplayName = "Enter the business name.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "invalid",
      message: "Please review the highlighted fields.",
      fieldErrors,
    };
  }

  if (selectedProductMode === "invalid") {
    return {
      status: "error",
      message: "We could not identify the selected signup path. Please use the current signup link and try again.",
    };
  }

  try {
    const provisioning = await deps.provision({
      targetEmail: email,
      ownerDisplayName,
      businessDisplayName,
      entitlementPreset: "standard",
      ...(selectedProductMode ? { productMode: selectedProductMode } : {}),
      starterKitVersion: "v3",
      dryRun: false,
      operatorMetadata: {
        requestedBy: "public_self_serve_signup",
        note: "self_serve_onboarding_v1",
      },
    });

    if (provisioning.status === "failed" || provisioning.errors.length > 0) {
      deps.log("self-serve onboarding provisioning failed", {
        email,
        productMode: selectedProductMode,
        status: provisioning.status,
        errorCodes: provisioning.errors.map((error) => error.code),
      });

      if (selectedProductMode) {
        return {
          status: "error",
          message: "We could not finish product setup for this signup path. Please try again or contact support.",
        };
      }

      return submittedNeutralState();
    }

    if (
      selectedProductMode &&
      provisioning.productModeCapture.selectedProductMode !== selectedProductMode
    ) {
      deps.log("self-serve onboarding product mode capture mismatch", {
        email,
        selectedProductMode,
        capturedProductMode: provisioning.productModeCapture.selectedProductMode,
        captureAction: provisioning.productModeCapture.action,
      });

      return {
        status: "error",
        message: "We could not finish product setup for this signup path. Please try again or contact support.",
      };
    }

    const inviteResult = await deps.invite({
      apply: true,
      email,
      resendInvite: false,
      authUserId: provisioning.authUserId,
      accountOwnerUserId: provisioning.accountOwnerUserId,
    });

    if (inviteResult.errors.length > 0) {
      deps.log("self-serve onboarding invite failed", {
        email,
        errorCodes: inviteResult.errors.map((error) => error.code),
      });
    }

    const ownerSnapshot = await deps.loadOwnerSnapshot({
      accountOwnerUserId: provisioning.accountOwnerUserId,
    });

    try {
      await deps.notifyPlatformOwnerSignup({
        companyName: ownerSnapshot?.companyName || businessDisplayName,
        ownerEmail: email,
        ownerDisplayName: ownerSnapshot?.ownerDisplayName || ownerDisplayName,
        signupPath: resolveSignupPath(selectedProductMode),
        productMode: provisioning.productModeCapture.selectedProductMode,
        billingMode: ownerSnapshot?.billingMode || null,
        entitlementStatus: ownerSnapshot?.entitlementStatus || null,
        planKey: ownerSnapshot?.planKey || null,
        accountOwnerUserId: provisioning.accountOwnerUserId,
        inviteStatus: resolveInviteStatus(inviteResult),
        timestampIso: new Date().toISOString(),
      });
    } catch (notifyError) {
      deps.log("self-serve onboarding platform owner notification failed", {
        email,
        accountOwnerUserId: provisioning.accountOwnerUserId,
        message: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }

    return submittedNeutralState();
  } catch (error) {
    deps.log("self-serve onboarding unexpected error", {
      email,
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      status: "error",
      message: "We could not submit your request right now. Please try again.",
    };
  }
}
