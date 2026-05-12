const FIRST_OWNER_METADATA_MARKER_KEY = "first_owner_provisioning_v1";

type InviteAuthUserSummary = {
  id: string;
  email: string | null;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
};

export type FirstOwnerInviteError = {
  code:
    | "AUTH_USER_ID_REQUIRED"
    | "AUTH_USER_LOOKUP_FAILED"
    | "METADATA_WRITE_FAILED"
    | "INVITE_SEND_FAILED"
    | "SETUP_LINK_SEND_FAILED";
  message: string;
  details?: string | null;
};

export type FirstOwnerInviteSkipReason = "dry_run" | "invite_already_pending";

export type FirstOwnerInviteResult = {
  inviteSent: boolean;
  setupLinkSent?: boolean;
  deliveryMethod?: "supabase_invite" | "recovery_setup_link";
  inviteSkippedReason?: FirstOwnerInviteSkipReason;
  warnings: string[];
  errors: FirstOwnerInviteError[];
};

export type FirstOwnerInviteDeps = {
  getAuthUserById: (userId: string) => Promise<InviteAuthUserSummary | null>;
  setUserMetadata: (userId: string, metadata: Record<string, unknown>) => Promise<void>;
  sendInvite: (params: {
    email: string;
    redirectTo: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  sendSetupLink?: (params: {
    authUserId: string;
    email: string;
    redirectTo: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  resolveInviteRedirectTo: () => string;
  nowIso: () => string;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function describeError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) {
    const extras = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const detailParts = [
      extras.code ? `code=${String(extras.code)}` : "",
      extras.status || extras.statusCode
        ? `status=${String(extras.status ?? extras.statusCode)}`
        : "",
      extras.details ? `details=${String(extras.details)}` : "",
      extras.hint ? `hint=${String(extras.hint)}` : "",
    ].filter(Boolean);
    return detailParts.length > 0 ? `${error.message} (${detailParts.join(", ")})` : error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function orchestrateFirstOwnerInvite(params: {
  apply: boolean;
  email: string;
  resendInvite: boolean;
  authUserId: string | null;
  accountOwnerUserId: string | null;
  deps: FirstOwnerInviteDeps;
}): Promise<FirstOwnerInviteResult> {
  if (!params.apply) {
    return {
      inviteSent: false,
      inviteSkippedReason: "dry_run",
      warnings: [],
      errors: [],
    };
  }

  const authUserId = toCleanString(params.authUserId);
  if (!authUserId) {
    return {
      inviteSent: false,
      warnings: [],
      errors: [
        {
          code: "AUTH_USER_ID_REQUIRED",
          message: "Provisioning succeeded but auth user id is missing.",
        },
      ],
    };
  }

  const authUser = await params.deps.getAuthUserById(authUserId);
  if (!authUser?.id) {
    return {
      inviteSent: false,
      warnings: [],
      errors: [
        {
          code: "AUTH_USER_LOOKUP_FAILED",
          message: "Could not resolve auth user before sending invite.",
        },
      ],
    };
  }

  const invitePending = Boolean(authUser.invitedAt && !authUser.emailConfirmedAt);
  if (invitePending && !params.resendInvite) {
    return {
      inviteSent: false,
      inviteSkippedReason: "invite_already_pending",
      warnings: ["Invite already pending for this user; resend skipped."],
      errors: [],
    };
  }

  const metadataMarker = {
    [FIRST_OWNER_METADATA_MARKER_KEY]: {
      is_first_owner: true,
      account_owner_user_id: params.accountOwnerUserId,
      provisioned_at: params.deps.nowIso(),
    },
  };

  try {
    await params.deps.setUserMetadata(authUserId, metadataMarker);
  } catch (metaErr) {
    return {
      inviteSent: false,
      warnings: [],
      errors: [
        {
          code: "METADATA_WRITE_FAILED",
          message:
            metaErr instanceof Error ? metaErr.message : "Failed to write metadata marker",
        },
      ],
    };
  }

  const redirectTo = params.deps.resolveInviteRedirectTo();

  try {
    await params.deps.sendInvite({
      email: params.email,
      redirectTo,
      metadata: metadataMarker,
    });
  } catch (inviteErr) {
    const inviteDetails = describeError(inviteErr);
    if (params.deps.sendSetupLink) {
      try {
        await params.deps.sendSetupLink({
          authUserId,
          email: params.email,
          redirectTo,
          metadata: metadataMarker,
        });

        return {
          inviteSent: false,
          setupLinkSent: true,
          deliveryMethod: "recovery_setup_link",
          warnings: [
            `Supabase invite failed; sent existing-user setup link instead.${inviteDetails ? ` ${inviteDetails}` : ""}`,
          ],
          errors: [],
        };
      } catch (setupErr) {
        return {
          inviteSent: false,
          setupLinkSent: false,
          warnings: [
            `Supabase invite failed before setup-link fallback.${inviteDetails ? ` ${inviteDetails}` : ""}`,
          ],
          errors: [
            {
              code: "SETUP_LINK_SEND_FAILED",
              message:
                setupErr instanceof Error ? setupErr.message : "Failed to send setup link",
              details: describeError(setupErr),
            },
          ],
        };
      }
    }

    return {
      inviteSent: false,
      warnings: [],
      errors: [
        {
          code: "INVITE_SEND_FAILED",
          message: inviteErr instanceof Error ? inviteErr.message : "Failed to send invite",
          details: inviteDetails,
        },
      ],
    };
  }

  return {
    inviteSent: true,
    setupLinkSent: false,
    deliveryMethod: "supabase_invite",
    warnings: [],
    errors: [],
  };
}
