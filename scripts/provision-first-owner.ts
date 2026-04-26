import { createAdminClient } from "../lib/supabase/server";
import {
  provisionFirstOwnerAccount,
  type FirstOwnerProvisioningClient,
  type FirstOwnerProvisioningInput,
  type FirstOwnerProvisioningResult,
} from "../lib/business/first-owner-provisioning";
import { resolveInviteRedirectTo } from "../lib/utils/resolve-invite-redirect-to";

type ParsedArgs = {
  email: string;
  businessDisplayName: string;
  ownerDisplayName?: string;
  supportEmail?: string;
  supportPhone?: string;
  defaultBillingMode?: string;
  resendInvite: boolean;
  apply: boolean;
};

type GuardrailError = {
  code: string;
  message: string;
};

type ScriptResult = {
  mode: "dry_run" | "apply";
  accountOwnerUserId: string | null;
  authUserId: string | null;
  recordsCreated: string[];
  recordsConfirmed: string[];
  recordsPatched: string[];
  inviteSent: boolean;
  inviteSkippedReason?: string;
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
};

type AuthUserSummary = {
  id: string;
  email: string | null;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
};

type ScriptRunDeps = {
  env: NodeJS.ProcessEnv;
  provision: (input: FirstOwnerProvisioningInput) => Promise<FirstOwnerProvisioningResult>;
  getAuthUserById: (userId: string) => Promise<AuthUserSummary | null>;
  setUserMetadata: (userId: string, metadata: Record<string, unknown>) => Promise<void>;
  sendInvite: (params: {
    email: string;
    redirectTo: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  resolveInviteRedirectTo: () => string;
  nowIso: () => string;
};

const FIRST_OWNER_METADATA_MARKER_KEY = "first_owner_provisioning_v1";

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toLower(value: unknown) {
  return toCleanString(value).toLowerCase();
}

function normalizeBooleanFlag(value: string | undefined | null) {
  return toLower(value) === "true";
}

function parseArgValue(argv: string[], key: string): string | undefined {
  const i = argv.indexOf(key);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function hasFlag(argv: string[], key: string) {
  return argv.includes(key);
}

function isProductionLikeEnvironment(env: NodeJS.ProcessEnv) {
  const rawUrl = toCleanString(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
  const nodeEnv = toLower(env.NODE_ENV);

  if (nodeEnv === "production") return true;
  if (!rawUrl) return true;

  try {
    const parsed = new URL(rawUrl);
    const host = toLower(parsed.hostname);
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return false;
    }
    if (host.endsWith(".local")) return false;
    if (host.includes("sandbox") || host.includes("staging") || host.includes("dev")) {
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

function collectGuardrailErrors(params: {
  apply: boolean;
  env: NodeJS.ProcessEnv;
}): GuardrailError[] {
  const errors: GuardrailError[] = [];
  const allowProvision = normalizeBooleanFlag(params.env.ALLOW_FIRST_OWNER_PROVISIONING);
  const allowProductionProvision = normalizeBooleanFlag(
    params.env.ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING,
  );

  if (!allowProvision) {
    errors.push({
      code: "ALLOW_FLAG_REQUIRED",
      message:
        "Provisioning is blocked. Set ALLOW_FIRST_OWNER_PROVISIONING=true to continue.",
    });
  }

  if (isProductionLikeEnvironment(params.env) && !allowProductionProvision) {
    errors.push({
      code: "PRODUCTION_ALLOW_FLAG_REQUIRED",
      message:
        "Production-like target detected. Set ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true to continue.",
    });
  }

  if (!params.apply) {
    // Dry-run is safe and still allowed; this entry is informational-only.
    return errors;
  }

  return errors;
}

export function parseProvisionFirstOwnerArgs(argv: string[]): ParsedArgs {
  const email = toCleanString(parseArgValue(argv, "--email"));
  const businessDisplayName = toCleanString(parseArgValue(argv, "--business-display-name"));
  const ownerDisplayName = toCleanString(parseArgValue(argv, "--owner-display-name"));
  const supportEmail = toCleanString(parseArgValue(argv, "--support-email"));
  const supportPhone = toCleanString(parseArgValue(argv, "--support-phone"));
  const defaultBillingMode = toCleanString(parseArgValue(argv, "--default-billing-mode"));
  const resendInvite = hasFlag(argv, "--resend-invite");
  const apply = hasFlag(argv, "--apply");

  if (!email) {
    throw new Error("Missing required --email");
  }

  if (!businessDisplayName) {
    throw new Error("Missing required --business-display-name");
  }

  return {
    email,
    businessDisplayName,
    ownerDisplayName: ownerDisplayName || undefined,
    supportEmail: supportEmail || undefined,
    supportPhone: supportPhone || undefined,
    defaultBillingMode: defaultBillingMode || undefined,
    resendInvite,
    apply,
  };
}

export async function runProvisionFirstOwnerScript(
  args: ParsedArgs,
  deps: ScriptRunDeps,
): Promise<ScriptResult> {
  const mode: ScriptResult["mode"] = args.apply ? "apply" : "dry_run";
  const guardrailErrors = collectGuardrailErrors({ apply: args.apply, env: deps.env });

  if (guardrailErrors.length > 0) {
    return {
      mode,
      accountOwnerUserId: null,
      authUserId: null,
      recordsCreated: [],
      recordsConfirmed: [],
      recordsPatched: [],
      inviteSent: false,
      warnings: [],
      errors: guardrailErrors,
    };
  }

  const provisioning = await deps.provision({
    targetEmail: args.email,
    businessDisplayName: args.businessDisplayName,
    ownerDisplayName: args.ownerDisplayName,
    supportEmail: args.supportEmail,
    supportPhone: args.supportPhone,
    defaultBillingMode: args.defaultBillingMode,
    dryRun: !args.apply,
    operatorMetadata: {
      requestedBy: toCleanString(deps.env.USER || deps.env.USERNAME) || null,
      note: "first-owner-provisioning-operator-script",
    },
  });

  const warnings = [...provisioning.warnings];
  const errors = provisioning.errors.map((e) => ({ code: e.code, message: e.message }));

  if (provisioning.status === "failed" || errors.length > 0) {
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId: provisioning.authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      warnings,
      errors,
    };
  }

  if (!args.apply) {
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId: provisioning.authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      inviteSkippedReason: "dry_run",
      warnings,
      errors,
    };
  }

  const authUserId = toCleanString(provisioning.authUserId);
  if (!authUserId) {
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId: provisioning.authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      warnings,
      errors: [
        ...errors,
        {
          code: "AUTH_USER_ID_REQUIRED",
          message: "Provisioning succeeded but auth user id is missing.",
        },
      ],
    };
  }

  const authUser = await deps.getAuthUserById(authUserId);
  if (!authUser?.id) {
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      warnings,
      errors: [
        ...errors,
        {
          code: "AUTH_USER_LOOKUP_FAILED",
          message: "Could not resolve auth user before sending invite.",
        },
      ],
    };
  }

  const invitePending = Boolean(authUser.invitedAt && !authUser.emailConfirmedAt);
  if (invitePending && !args.resendInvite) {
    warnings.push("Invite already pending for this user; resend skipped.");
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      inviteSkippedReason: "invite_already_pending",
      warnings,
      errors,
    };
  }

  const metadataMarker = {
    [FIRST_OWNER_METADATA_MARKER_KEY]: {
      is_first_owner: true,
      account_owner_user_id: provisioning.accountOwnerUserId,
      provisioned_at: deps.nowIso(),
    },
  };

  try {
    await deps.setUserMetadata(authUserId, metadataMarker);
  } catch (metaErr) {
    const message = metaErr instanceof Error ? metaErr.message : "Failed to write metadata marker";
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      warnings,
      errors: [...errors, { code: "METADATA_WRITE_FAILED", message }],
    };
  }

  try {
    await deps.sendInvite({
      email: args.email,
      redirectTo: deps.resolveInviteRedirectTo(),
      metadata: metadataMarker,
    });
  } catch (inviteErr) {
    const message = inviteErr instanceof Error ? inviteErr.message : "Failed to send invite";
    return {
      mode,
      accountOwnerUserId: provisioning.accountOwnerUserId,
      authUserId,
      recordsCreated: provisioning.recordsCreated,
      recordsConfirmed: provisioning.recordsConfirmed,
      recordsPatched: provisioning.recordsPatched,
      inviteSent: false,
      warnings,
      errors: [...errors, { code: "INVITE_SEND_FAILED", message }],
    };
  }

  return {
    mode,
    accountOwnerUserId: provisioning.accountOwnerUserId,
    authUserId,
    recordsCreated: provisioning.recordsCreated,
    recordsConfirmed: provisioning.recordsConfirmed,
    recordsPatched: provisioning.recordsPatched,
    inviteSent: true,
    warnings,
    errors,
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
        const match = users.find(
          (u: any) => toLower(u?.email) === toLower(email),
        );
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
        .select("account_owner_user_id, plan_key, entitlement_status")
        .eq("account_owner_user_id", ownerUserId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.account_owner_user_id) return null;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        plan_key: toCleanString(data.plan_key) || null,
        entitlement_status: toCleanString(data.entitlement_status) || null,
      };
    },

    async upsertEntitlement(input) {
      const { data, error } = await admin
        .from("platform_account_entitlements")
        .upsert(
          {
            account_owner_user_id: input.account_owner_user_id,
            plan_key: input.plan_key,
            entitlement_status: input.entitlement_status,
          },
          { onConflict: "account_owner_user_id" },
        )
        .select("account_owner_user_id, plan_key, entitlement_status")
        .single();
      if (error) throw error;
      return {
        account_owner_user_id: String(data.account_owner_user_id),
        plan_key: toCleanString(data.plan_key) || null,
        entitlement_status: toCleanString(data.entitlement_status) || null,
      };
    },
  };
}

function createRealDeps(): ScriptRunDeps {
  const admin = createAdminClient();
  const provisioningClient = createProvisioningClientFromAdmin(admin);

  return {
    env: process.env,
    provision: async (input) => {
      return provisionFirstOwnerAccount({ input, client: provisioningClient });
    },
    getAuthUserById: async (userId: string) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      const user = (data as any)?.user;
      if (!user?.id) return null;
      return {
        id: String(user.id),
        email: toCleanString(user.email) || null,
        invitedAt: toCleanString(user.invited_at) || null,
        emailConfirmedAt:
          toCleanString(user.email_confirmed_at || user.confirmed_at) || null,
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
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseProvisionFirstOwnerArgs(argv);
  const result = await runProvisionFirstOwnerScript(args, createRealDeps());

  // Structured non-secret output only.
  const output = {
    mode: result.mode,
    accountOwnerUserId: result.accountOwnerUserId,
    authUserId: result.authUserId,
    recordsCreated: result.recordsCreated,
    recordsConfirmed: result.recordsConfirmed,
    recordsPatched: result.recordsPatched,
    inviteSent: result.inviteSent,
    inviteSkippedReason: result.inviteSkippedReason,
    warnings: result.warnings,
    errors: result.errors,
  };

  console.log(JSON.stringify(output, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (!process.env.VITEST) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected script failure";
    console.error(
      JSON.stringify(
        {
          mode: "apply",
          inviteSent: false,
          errors: [{ code: "SCRIPT_RUNTIME_FAILURE", message }],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
