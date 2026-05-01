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
    | "INVITE_SEND_FAILED";
  message: string;
};

export type FirstOwnerInviteSkipReason = "dry_run" | "invite_already_pending";

export type FirstOwnerInviteResult = {
  inviteSent: boolean;
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
  resolveInviteRedirectTo: () => string;
  nowIso: () => string;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
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

  try {
    await params.deps.sendInvite({
      email: params.email,
      redirectTo: params.deps.resolveInviteRedirectTo(),
      metadata: metadataMarker,
    });
  } catch (inviteErr) {
    return {
      inviteSent: false,
      warnings: [],
      errors: [
        {
          code: "INVITE_SEND_FAILED",
          message: inviteErr instanceof Error ? inviteErr.message : "Failed to send invite",
        },
      ],
    };
  }

  return {
    inviteSent: true,
    warnings: [],
    errors: [],
  };
}