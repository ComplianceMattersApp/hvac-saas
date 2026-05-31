export const AUTHORIZED_HANDOFF_RECIPIENT_TYPES = [
  "internal_user",
  "external_manual",
  "connected_account_future",
] as const;

export const AUTHORIZED_HANDOFF_KINDS = ["ecc", "general_future"] as const;

export type AuthorizedHandoffRecipientType = (typeof AUTHORIZED_HANDOFF_RECIPIENT_TYPES)[number];
export type AuthorizedHandoffKind = (typeof AUTHORIZED_HANDOFF_KINDS)[number];

export type AuthorizedHandoffRecipientRow = {
  id: string;
  account_owner_user_id: string;
  recipient_type: AuthorizedHandoffRecipientType | string;
  handoff_kind: AuthorizedHandoffKind | string;
  display_name: string;
  internal_user_id: string | null;
  external_company_name: string | null;
  external_contact_name: string | null;
  external_email: string | null;
  external_phone: string | null;
  connected_account_owner_user_id: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type SupabaseLike = {
  from(table: string): any;
};

export const AUTHORIZED_HANDOFF_RECIPIENT_SELECT = [
  "id",
  "account_owner_user_id",
  "recipient_type",
  "handoff_kind",
  "display_name",
  "internal_user_id",
  "external_company_name",
  "external_contact_name",
  "external_email",
  "external_phone",
  "connected_account_owner_user_id",
  "is_default",
  "is_active",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
].join(", ");

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeHandoffKind(value: unknown): AuthorizedHandoffKind | null {
  const normalized = cleanString(value).toLowerCase();
  return AUTHORIZED_HANDOFF_KINDS.includes(normalized as AuthorizedHandoffKind)
    ? (normalized as AuthorizedHandoffKind)
    : null;
}

function isMissingAuthorizedRecipientsTable(error: any) {
  const code = cleanString(error?.code).toUpperCase();
  const message = [error?.message, error?.details, error?.hint]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!message.includes("authorized_handoff_recipients")) {
    return false;
  }

  if (code === "PGRST205" || code === "42P01") {
    return true;
  }

  return (
    message.includes("could not find the table")
    || message.includes("does not exist")
    || message.includes("schema cache")
  );
}

export function normalizeAuthorizedHandoffRecipientRow(value: any): AuthorizedHandoffRecipientRow | null {
  const id = cleanString(value?.id);
  const accountOwnerUserId = cleanString(value?.account_owner_user_id);
  const recipientType = cleanString(value?.recipient_type);
  const handoffKind = cleanString(value?.handoff_kind);
  const displayName = cleanString(value?.display_name);
  const createdAt = cleanString(value?.created_at);
  const updatedAt = cleanString(value?.updated_at);

  if (!id || !accountOwnerUserId || !recipientType || !handoffKind || !displayName || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    account_owner_user_id: accountOwnerUserId,
    recipient_type: recipientType,
    handoff_kind: handoffKind,
    display_name: displayName,
    internal_user_id: cleanNullableString(value?.internal_user_id),
    external_company_name: cleanNullableString(value?.external_company_name),
    external_contact_name: cleanNullableString(value?.external_contact_name),
    external_email: cleanNullableString(value?.external_email),
    external_phone: cleanNullableString(value?.external_phone),
    connected_account_owner_user_id: cleanNullableString(value?.connected_account_owner_user_id),
    is_default: Boolean(value?.is_default),
    is_active: Boolean(value?.is_active),
    notes: cleanNullableString(value?.notes),
    created_by_user_id: cleanNullableString(value?.created_by_user_id),
    updated_by_user_id: cleanNullableString(value?.updated_by_user_id),
    created_at: createdAt,
    updated_at: updatedAt,
    archived_at: cleanNullableString(value?.archived_at),
  };
}

export async function listActiveAuthorizedHandoffRecipients(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  handoffKind?: AuthorizedHandoffKind | null;
  limit?: number | null;
}): Promise<AuthorizedHandoffRecipientRow[]> {
  const accountOwnerUserId = cleanString(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  const handoffKind = normalizeHandoffKind(params.handoffKind ?? "ecc") ?? "ecc";
  const safeLimit = Math.max(1, Math.min(500, Number(params.limit ?? 100)));

  let query = params.supabase
    .from("authorized_handoff_recipients")
    .select(AUTHORIZED_HANDOFF_RECIPIENT_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("handoff_kind", handoffKind)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("display_name", { ascending: true })
    .limit(safeLimit);

  const { data, error } = await query;
  if (error) {
    if (isMissingAuthorizedRecipientsTable(error)) {
      return [];
    }
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeAuthorizedHandoffRecipientRow(row))
    .filter((row): row is AuthorizedHandoffRecipientRow => row !== null);
}

export type AuthorizedHandoffRecipientSelectionState = {
  mode: "none" | "single" | "multiple";
  recipients: AuthorizedHandoffRecipientRow[];
  defaultRecipientId: string | null;
  preselectedRecipientId: string | null;
};

export async function resolveActiveAuthorizedHandoffRecipientSelection(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  handoffKind?: AuthorizedHandoffKind | null;
}): Promise<AuthorizedHandoffRecipientSelectionState> {
  const recipients = await listActiveAuthorizedHandoffRecipients({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
    handoffKind: params.handoffKind ?? "ecc",
  });

  if (recipients.length === 0) {
    return {
      mode: "none",
      recipients,
      defaultRecipientId: null,
      preselectedRecipientId: null,
    };
  }

  if (recipients.length === 1) {
    return {
      mode: "single",
      recipients,
      defaultRecipientId: recipients[0].id,
      preselectedRecipientId: recipients[0].id,
    };
  }

  const defaultRecipient = recipients.find((recipient) => recipient.is_default) ?? null;
  return {
    mode: "multiple",
    recipients,
    defaultRecipientId: defaultRecipient?.id ?? null,
    preselectedRecipientId: defaultRecipient?.id ?? null,
  };
}
