"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  AUTHORIZED_HANDOFF_KINDS,
  AUTHORIZED_HANDOFF_RECIPIENT_SELECT,
  AUTHORIZED_HANDOFF_RECIPIENT_TYPES,
  normalizeAuthorizedHandoffRecipientRow,
  type AuthorizedHandoffKind,
  type AuthorizedHandoffRecipientRow,
  type AuthorizedHandoffRecipientType,
} from "@/lib/workflows/authorized-handoff-recipients-read";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";

export type AuthorizedHandoffRecipientMutationResult =
  | { success: true; recipient: AuthorizedHandoffRecipientRow }
  | { success: false; error: string };

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeRecipientType(value: unknown): AuthorizedHandoffRecipientType | null {
  const normalized = cleanString(value).toLowerCase();
  return AUTHORIZED_HANDOFF_RECIPIENT_TYPES.includes(normalized as AuthorizedHandoffRecipientType)
    ? (normalized as AuthorizedHandoffRecipientType)
    : null;
}

function normalizeHandoffKind(value: unknown): AuthorizedHandoffKind | null {
  const normalized = cleanString(value).toLowerCase();
  return AUTHORIZED_HANDOFF_KINDS.includes(normalized as AuthorizedHandoffKind)
    ? (normalized as AuthorizedHandoffKind)
    : null;
}

function isUuid(value: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveAdminContext() {
  const supabase = await createClient();

  try {
    const authz = await requireInternalRole("admin", { supabase });
    return {
      ok: true as const,
      userId: cleanString(authz.userId),
      accountOwnerUserId: cleanString(authz.internalUser.account_owner_user_id),
    };
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { ok: false as const, error: "Authentication required." };
      }
      if (error.code === "INTERNAL_ROLE_REQUIRED") {
        return { ok: false as const, error: "Owner/admin access is required." };
      }
      return { ok: false as const, error: "Active internal user required." };
    }
    throw error;
  }
}

async function normalizeDefaultRecipient(params: {
  admin: any;
  accountOwnerUserId: string;
  handoffKind: AuthorizedHandoffKind;
  keepRecipientId: string;
  actingUserId: string;
}) {
  await params.admin
    .from("authorized_handoff_recipients")
    .update({
      is_default: false,
      updated_by_user_id: params.actingUserId,
    })
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("handoff_kind", params.handoffKind)
    .eq("is_default", true)
    .eq("is_active", true)
    .is("archived_at", null)
    .neq("id", params.keepRecipientId);

  await params.admin
    .from("authorized_handoff_recipients")
    .update({
      is_default: true,
      updated_by_user_id: params.actingUserId,
    })
    .eq("id", params.keepRecipientId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("is_active", true)
    .is("archived_at", null);
}

async function readScopedRecipient(params: {
  admin: any;
  accountOwnerUserId: string;
  recipientId: string;
}) {
  const { data, error } = await params.admin
    .from("authorized_handoff_recipients")
    .select(AUTHORIZED_HANDOFF_RECIPIENT_SELECT)
    .eq("id", params.recipientId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  return normalizeAuthorizedHandoffRecipientRow(data);
}

export async function createAuthorizedHandoffRecipient(input: {
  recipientType: string;
  handoffKind?: string | null;
  displayName: string;
  internalUserId?: string | null;
  externalCompanyName?: string | null;
  externalContactName?: string | null;
  externalEmail?: string | null;
  externalPhone?: string | null;
  connectedAccountOwnerUserId?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
  notes?: string | null;
}): Promise<AuthorizedHandoffRecipientMutationResult> {
  const authz = await resolveAdminContext();
  if (!authz.ok) {
    return { success: false, error: authz.error };
  }

  const recipientType = normalizeRecipientType(input.recipientType);
  const handoffKind = normalizeHandoffKind(input.handoffKind ?? "ecc") ?? "ecc";
  const displayName = cleanString(input.displayName);
  const internalUserId = cleanNullableString(input.internalUserId);
  const connectedAccountOwnerUserId = cleanNullableString(input.connectedAccountOwnerUserId);
  const isActive = asBoolean(input.isActive, true);
  const requestedDefault = asBoolean(input.isDefault, false);

  if (!recipientType) {
    return { success: false, error: "Recipient type is required." };
  }

  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }

  if (recipientType === "internal_user" && !isUuid(internalUserId)) {
    return { success: false, error: "Internal recipient requires a valid internal user id." };
  }

  if (recipientType === "connected_account_future" && !isUuid(connectedAccountOwnerUserId)) {
    return { success: false, error: "Connected account recipient requires a valid account id." };
  }

  const admin = createAdminClient();
  const isDefault = isActive ? requestedDefault : false;

  const insertPayload = {
    account_owner_user_id: authz.accountOwnerUserId,
    recipient_type: recipientType,
    handoff_kind: handoffKind,
    display_name: displayName,
    internal_user_id: internalUserId,
    external_company_name: cleanNullableString(input.externalCompanyName),
    external_contact_name: cleanNullableString(input.externalContactName),
    external_email: cleanNullableString(input.externalEmail),
    external_phone: cleanNullableString(input.externalPhone),
    connected_account_owner_user_id: connectedAccountOwnerUserId,
    is_default: isDefault,
    is_active: isActive,
    notes: cleanNullableString(input.notes),
    created_by_user_id: authz.userId,
    updated_by_user_id: authz.userId,
  };

  const { data: inserted, error: insertError } = await admin
    .from("authorized_handoff_recipients")
    .insert(insertPayload)
    .select(AUTHORIZED_HANDOFF_RECIPIENT_SELECT)
    .maybeSingle();

  if (insertError) {
    return { success: false, error: insertError.message || "Could not create recipient." };
  }

  const normalized = normalizeAuthorizedHandoffRecipientRow(inserted);
  if (!normalized) {
    return { success: false, error: "Could not create recipient." };
  }

  if (normalized.is_default && normalized.is_active && !normalized.archived_at) {
    await normalizeDefaultRecipient({
      admin,
      accountOwnerUserId: authz.accountOwnerUserId,
      handoffKind,
      keepRecipientId: normalized.id,
      actingUserId: authz.userId,
    });

    const refreshed = await readScopedRecipient({
      admin,
      accountOwnerUserId: authz.accountOwnerUserId,
      recipientId: normalized.id,
    });

    if (!refreshed) {
      return { success: false, error: "Could not create recipient." };
    }

    return { success: true, recipient: refreshed };
  }

  return { success: true, recipient: normalized };
}

export async function updateAuthorizedHandoffRecipient(input: {
  recipientId: string;
  displayName?: string | null;
  externalCompanyName?: string | null;
  externalContactName?: string | null;
  externalEmail?: string | null;
  externalPhone?: string | null;
  notes?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
}): Promise<AuthorizedHandoffRecipientMutationResult> {
  const authz = await resolveAdminContext();
  if (!authz.ok) {
    return { success: false, error: authz.error };
  }

  const recipientId = cleanString(input.recipientId);
  if (!isUuid(recipientId)) {
    return { success: false, error: "Recipient id is required." };
  }

  const admin = createAdminClient();
  const existing = await readScopedRecipient({
    admin,
    accountOwnerUserId: authz.accountOwnerUserId,
    recipientId,
  });

  if (!existing || existing.archived_at) {
    return { success: false, error: "Recipient not found." };
  }

  const nextIsActive =
    input.isActive == null ? existing.is_active : asBoolean(input.isActive, existing.is_active);
  const nextIsDefault =
    input.isDefault == null
      ? existing.is_default && nextIsActive
      : asBoolean(input.isDefault, existing.is_default) && nextIsActive;

  const displayName =
    input.displayName == null ? existing.display_name : cleanString(input.displayName);

  if (!displayName) {
    return { success: false, error: "Display name is required." };
  }

  const updates: Record<string, unknown> = {
    display_name: displayName,
    external_company_name:
      input.externalCompanyName == null
        ? existing.external_company_name
        : cleanNullableString(input.externalCompanyName),
    external_contact_name:
      input.externalContactName == null
        ? existing.external_contact_name
        : cleanNullableString(input.externalContactName),
    external_email:
      input.externalEmail == null ? existing.external_email : cleanNullableString(input.externalEmail),
    external_phone:
      input.externalPhone == null ? existing.external_phone : cleanNullableString(input.externalPhone),
    notes: input.notes == null ? existing.notes : cleanNullableString(input.notes),
    is_active: nextIsActive,
    is_default: nextIsDefault,
    updated_by_user_id: authz.userId,
  };

  const { error: updateError } = await admin
    .from("authorized_handoff_recipients")
    .update(updates)
    .eq("id", recipientId)
    .eq("account_owner_user_id", authz.accountOwnerUserId);

  if (updateError) {
    return { success: false, error: updateError.message || "Could not update recipient." };
  }

  if (nextIsDefault && nextIsActive) {
    await normalizeDefaultRecipient({
      admin,
      accountOwnerUserId: authz.accountOwnerUserId,
      handoffKind: (existing.handoff_kind as AuthorizedHandoffKind) || "ecc",
      keepRecipientId: recipientId,
      actingUserId: authz.userId,
    });
  }

  const refreshed = await readScopedRecipient({
    admin,
    accountOwnerUserId: authz.accountOwnerUserId,
    recipientId,
  });

  if (!refreshed) {
    return { success: false, error: "Could not update recipient." };
  }

  return { success: true, recipient: refreshed };
}

export async function archiveAuthorizedHandoffRecipient(input: {
  recipientId: string;
}): Promise<AuthorizedHandoffRecipientMutationResult> {
  const authz = await resolveAdminContext();
  if (!authz.ok) {
    return { success: false, error: authz.error };
  }

  const recipientId = cleanString(input.recipientId);
  if (!isUuid(recipientId)) {
    return { success: false, error: "Recipient id is required." };
  }

  const admin = createAdminClient();
  const existing = await readScopedRecipient({
    admin,
    accountOwnerUserId: authz.accountOwnerUserId,
    recipientId,
  });

  if (!existing || existing.archived_at) {
    return { success: false, error: "Recipient not found." };
  }

  const nowIso = new Date().toISOString();
  const { error: archiveError } = await admin
    .from("authorized_handoff_recipients")
    .update({
      is_active: false,
      is_default: false,
      archived_at: nowIso,
      updated_by_user_id: authz.userId,
    })
    .eq("id", recipientId)
    .eq("account_owner_user_id", authz.accountOwnerUserId);

  if (archiveError) {
    return { success: false, error: archiveError.message || "Could not archive recipient." };
  }

  const refreshed = await readScopedRecipient({
    admin,
    accountOwnerUserId: authz.accountOwnerUserId,
    recipientId,
  });

  if (!refreshed) {
    return { success: false, error: "Could not archive recipient." };
  }

  return { success: true, recipient: refreshed };
}
