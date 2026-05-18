export const CONTACT_RECIPIENT_SELECT = [
  "id",
  "account_owner_user_id",
  "linked_entity_type",
  "linked_entity_id",
  "display_name",
  "phone_e164",
  "phone_last10",
  "email",
  "recipient_role",
  "status",
  "preferred_contact_method",
  "recipient_timezone",
  "source_type",
  "source_ref",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "deactivated_at",
  "deactivated_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

export const CONTACT_RECIPIENT_ROLES = [
  "customer_primary",
  "customer_alt",
  "homeowner",
  "tenant_or_occupant",
  "responsible_party",
  "site_access_contact",
  "billing_contact",
  "contractor_contact",
  "third_party_oversight",
  "internal_user",
  "account_owner",
  "future_marketplace_participant",
] as const;

export const CONTACT_RECIPIENT_STATUSES = ["inactive", "active", "archived"] as const;

export const CONTACT_RECIPIENT_LINKED_ENTITY_TYPES = [
  "customer",
  "location",
  "job",
  "contractor",
  "internal_user",
  "account_owner",
  "other",
] as const;

export type ContactRecipientRole = (typeof CONTACT_RECIPIENT_ROLES)[number];
export type ContactRecipientStatus = (typeof CONTACT_RECIPIENT_STATUSES)[number];
export type ContactRecipientLinkedEntityType =
  (typeof CONTACT_RECIPIENT_LINKED_ENTITY_TYPES)[number];

type SupabaseLike = {
  from(table: string): any;
};

export type ContactRecipientRow = {
  id: string;
  account_owner_user_id: string;
  linked_entity_type: ContactRecipientLinkedEntityType | string;
  linked_entity_id: string | null;
  display_name: string;
  phone_e164: string | null;
  phone_last10: string | null;
  email: string | null;
  recipient_role: ContactRecipientRole | string;
  status: ContactRecipientStatus | string;
  preferred_contact_method: "sms" | "phone" | "email" | "none" | string;
  recipient_timezone: string | null;
  source_type: "manual" | "import" | "seeded_from_customer" | "seeded_from_contractor" | "system_future" | string;
  source_ref: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deactivated_at: string | null;
  deactivated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ListContactRecipientsForAccountParams = {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  status?: ContactRecipientStatus | ContactRecipientStatus[] | null;
  recipientRole?: ContactRecipientRole | ContactRecipientRole[] | null;
  linkedEntityType?: ContactRecipientLinkedEntityType | null;
  linkedEntityId?: string | null;
  limit?: number | null;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function asOptionalTrimmed(value: unknown) {
  const text = asTrimmed(value);
  return text || null;
}

function normalizePhoneLast10(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isMissingContactRecipientsReadError(error: any) {
  const code = asTrimmed(error?.code).toUpperCase();
  const message = [error?.message, error?.details, error?.hint]
    .map((value) => asTrimmed(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!message.includes("contact_recipients")) {
    return false;
  }

  if (code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("not found in the schema cache")
  );
}

export function normalizeContactRecipientRow(row: any): ContactRecipientRow | null {
  const id = asTrimmed(row?.id);
  const accountOwnerUserId = asTrimmed(row?.account_owner_user_id);
  const linkedEntityType = asTrimmed(row?.linked_entity_type);
  const displayName = asTrimmed(row?.display_name);
  const recipientRole = asTrimmed(row?.recipient_role);
  const status = asTrimmed(row?.status);
  const preferredContactMethod = asTrimmed(row?.preferred_contact_method);
  const sourceType = asTrimmed(row?.source_type);
  const createdAt = asTrimmed(row?.created_at);
  const updatedAt = asTrimmed(row?.updated_at);

  if (
    !id ||
    !accountOwnerUserId ||
    !linkedEntityType ||
    !displayName ||
    !recipientRole ||
    !status ||
    !preferredContactMethod ||
    !sourceType ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const phoneE164 = asOptionalTrimmed(row?.phone_e164);
  const phoneLast10 = asOptionalTrimmed(row?.phone_last10) ?? normalizePhoneLast10(phoneE164);

  return {
    id,
    account_owner_user_id: accountOwnerUserId,
    linked_entity_type: linkedEntityType,
    linked_entity_id: asOptionalTrimmed(row?.linked_entity_id),
    display_name: displayName,
    phone_e164: phoneE164,
    phone_last10: phoneLast10,
    email: asOptionalTrimmed(row?.email),
    recipient_role: recipientRole,
    status,
    preferred_contact_method: preferredContactMethod,
    recipient_timezone: asOptionalTrimmed(row?.recipient_timezone),
    source_type: sourceType,
    source_ref: asOptionalTrimmed(row?.source_ref),
    notes: asOptionalTrimmed(row?.notes),
    created_by_user_id: asOptionalTrimmed(row?.created_by_user_id),
    updated_by_user_id: asOptionalTrimmed(row?.updated_by_user_id),
    deactivated_at: asOptionalTrimmed(row?.deactivated_at),
    deactivated_by_user_id: asOptionalTrimmed(row?.deactivated_by_user_id),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function listContactRecipientsForAccount(
  params: ListContactRecipientsForAccountParams,
): Promise<ContactRecipientRow[]> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  if (!accountOwnerUserId) {
    return [];
  }

  const statuses = uniqueNonEmpty(
    asArray(params.status).map((value) => asTrimmed(value).toLowerCase()),
  );

  const recipientRoles = uniqueNonEmpty(
    asArray(params.recipientRole).map((value) => asTrimmed(value).toLowerCase()),
  );

  const linkedEntityType = asTrimmed(params.linkedEntityType);
  const linkedEntityId = asTrimmed(params.linkedEntityId);

  let query = params.supabase
    .from("contact_recipients")
    .select(CONTACT_RECIPIENT_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId);

  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }

  if (recipientRoles.length > 0) {
    query = query.in("recipient_role", recipientRoles);
  }

  if (linkedEntityType) {
    query = query.eq("linked_entity_type", linkedEntityType);
  }

  if (linkedEntityId) {
    query = query.eq("linked_entity_id", linkedEntityId);
  }

  const limit = Number(params.limit ?? 100);
  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(Math.min(Math.floor(limit), 500));
  }

  query = query.order("display_name", { ascending: true });

  const { data, error } = await query;
  if (error) {
    if (isMissingContactRecipientsReadError(error)) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map((row: any) => normalizeContactRecipientRow(row))
    .filter((row: ContactRecipientRow | null): row is ContactRecipientRow => row !== null);
}

export async function listContactRecipientsForEntity(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  linkedEntityType: ContactRecipientLinkedEntityType | null | undefined;
  linkedEntityId: string | null | undefined;
  status?: ContactRecipientStatus | ContactRecipientStatus[] | null;
  recipientRole?: ContactRecipientRole | ContactRecipientRole[] | null;
  limit?: number | null;
}): Promise<ContactRecipientRow[]> {
  const linkedEntityType = asTrimmed(params.linkedEntityType);
  const linkedEntityId = asTrimmed(params.linkedEntityId);

  if (!linkedEntityType || !linkedEntityId) {
    return [];
  }

  return listContactRecipientsForAccount({
    supabase: params.supabase,
    accountOwnerUserId: params.accountOwnerUserId,
    linkedEntityType: linkedEntityType as ContactRecipientLinkedEntityType,
    linkedEntityId,
    status: params.status,
    recipientRole: params.recipientRole,
    limit: params.limit,
  });
}
