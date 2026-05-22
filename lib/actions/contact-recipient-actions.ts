"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const CUSTOMER_FORM_ALLOWED_ROLES = [
  "homeowner",
  "tenant_or_occupant",
  "responsible_party",
  "site_access_contact",
  "billing_contact",
  "third_party_oversight",
] as const;

const LOCATION_FORM_ALLOWED_ROLES = [
  "site_access_contact",
  "tenant_or_occupant",
  "responsible_party",
] as const;

const ALLOWED_PREFERRED_METHODS = ["sms", "phone", "email", "none"] as const;

function asTrimmed(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function asOptionalTrimmed(value: FormDataEntryValue | null) {
  const text = asTrimmed(value);
  return text.length > 0 ? text : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeRole(
  value: FormDataEntryValue | null,
  allowedRoles: readonly string[],
) {
  const role = asTrimmed(value).toLowerCase();
  return allowedRoles.includes(role) ? role : null;
}

function normalizePreferredContactMethod(value: FormDataEntryValue | null) {
  const method = asTrimmed(value).toLowerCase();
  if (!method) return null;
  return ALLOWED_PREFERRED_METHODS.includes(method as (typeof ALLOWED_PREFERRED_METHODS)[number])
    ? method
    : null;
}

function normalizeEmail(value: FormDataEntryValue | null) {
  const email = asOptionalTrimmed(value)?.toLowerCase() ?? null;
  if (!email) return { email: null, valid: true };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { email: null, valid: false };
  }
  return { email, valid: true };
}

function normalizePhoneE164(value: FormDataEntryValue | null) {
  const raw = asOptionalTrimmed(value);
  if (!raw) {
    return { phoneE164: null, valid: true };
  }

  const compact = raw.replace(/[\s().-]/g, "");
  const digits = compact.replace(/\D/g, "");

  if (compact.startsWith("+")) {
    if (digits.length >= 8 && digits.length <= 15) {
      return { phoneE164: `+${digits}`, valid: true };
    }
    return { phoneE164: null, valid: false };
  }

  if (digits.length === 10) {
    return { phoneE164: `+1${digits}`, valid: true };
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return { phoneE164: `+${digits}`, valid: true };
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return { phoneE164: `+${digits}`, valid: true };
  }

  return { phoneE164: null, valid: false };
}

function phoneLast10FromE164(phoneE164: string | null) {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizeNotes(value: FormDataEntryValue | null) {
  const notes = asOptionalTrimmed(value);
  if (!notes) return null;
  return notes.slice(0, 500);
}

async function resolveInternalContactActionContext(params: {
  supabase: any;
  failurePath: string;
}) {
  let userId: string;
  let accountOwnerUserId: string;
  try {
    const internal = await requireInternalUser({ supabase: params.supabase });
    userId = String(internal.userId ?? "").trim();
    accountOwnerUserId = String(internal.internalUser.account_owner_user_id ?? "").trim();
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }
    throw error;
  }

  if (!userId || !accountOwnerUserId) {
    redirect(params.failurePath);
  }

  return { userId, accountOwnerUserId };
}

async function assertScopedCustomer(params: {
  admin: any;
  customerId: string;
  accountOwnerUserId: string;
}) {
  const { data: scopedCustomer, error: scopedCustomerErr } = await params.admin
    .from("customers")
    .select("id")
    .eq("id", params.customerId)
    .eq("owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (scopedCustomerErr) throw scopedCustomerErr;
  return Boolean(scopedCustomer?.id);
}

async function assertScopedLocation(params: {
  admin: any;
  locationId: string;
  customerId: string;
  accountOwnerUserId: string;
}) {
  const { data: scopedLocation, error: scopedLocationErr } = await params.admin
    .from("locations")
    .select("id, customer_id, owner_user_id")
    .eq("id", params.locationId)
    .maybeSingle();

  if (scopedLocationErr) throw scopedLocationErr;
  if (!scopedLocation?.id) return false;

  const owner = String((scopedLocation as any).owner_user_id ?? "").trim();
  const customerId = String((scopedLocation as any).customer_id ?? "").trim();
  return owner === params.accountOwnerUserId && customerId === params.customerId;
}

async function insertScopedContactRecipient(params: {
  supabase: any;
  accountOwnerUserId: string;
  userId: string;
  linkedEntityType: "customer" | "location";
  linkedEntityId: string;
  role: string;
  displayName: string;
  phoneE164: string | null;
  phoneLast10: string | null;
  email: string | null;
  preferredContactMethod: "sms" | "phone" | "email" | "none";
  notes: string | null;
}) {
  return params.supabase.from("contact_recipients").insert({
    account_owner_user_id: params.accountOwnerUserId,
    linked_entity_type: params.linkedEntityType,
    linked_entity_id: params.linkedEntityId,
    recipient_role: params.role,
    display_name: params.displayName,
    phone_e164: params.phoneE164,
    phone_last10: params.phoneLast10,
    email: params.email,
    preferred_contact_method: params.preferredContactMethod,
    notes: params.notes,
    source_type: "manual",
    status: "active",
    created_by_user_id: params.userId,
    updated_by_user_id: params.userId,
  });
}

export async function addCustomerRoleContactFromForm(formData: FormData) {
  const customerId = asTrimmed(formData.get("customer_id"));
  if (!isUuid(customerId)) {
    redirect("/customers");
  }

  const customerPath = `/customers/${customerId}`;
  const failurePath = `${customerPath}?rcError=1#role-contacts`;

  const supabase = await createClient();
  const { userId, accountOwnerUserId } = await resolveInternalContactActionContext({
    supabase,
    failurePath,
  });

  const role = normalizeRole(formData.get("recipient_role"), CUSTOMER_FORM_ALLOWED_ROLES);
  const displayName = asTrimmed(formData.get("display_name")).slice(0, 120);
  const preferredInput = normalizePreferredContactMethod(formData.get("preferred_contact_method"));
  const phoneResult = normalizePhoneE164(formData.get("phone"));
  const emailResult = normalizeEmail(formData.get("email"));
  const notes = normalizeNotes(formData.get("notes"));

  if (!role || !displayName || !phoneResult.valid || !emailResult.valid) {
    redirect(failurePath);
  }

  const phoneE164 = phoneResult.phoneE164;
  const phoneLast10 = phoneLast10FromE164(phoneE164);
  const email = emailResult.email;

  if (!phoneE164 && !email) {
    redirect(failurePath);
  }

  const preferredContactMethod = preferredInput ?? (phoneE164 ? "phone" : email ? "email" : "none");

  if ((preferredContactMethod === "sms" || preferredContactMethod === "phone") && !phoneE164) {
    redirect(failurePath);
  }
  if (preferredContactMethod === "email" && !email) {
    redirect(failurePath);
  }

  const admin = createAdminClient();
  const inScope = await assertScopedCustomer({
    admin,
    customerId,
    accountOwnerUserId,
  });
  if (!inScope) {
    redirect(failurePath);
  }

  const { error: insertError } = await insertScopedContactRecipient({
    supabase,
    accountOwnerUserId,
    userId,
    linkedEntityType: "customer",
    linkedEntityId: customerId,
    role,
    displayName,
    phoneE164,
    phoneLast10,
    email,
    preferredContactMethod: preferredContactMethod as "sms" | "phone" | "email" | "none",
    notes,
  });

  if (insertError) {
    redirect(failurePath);
  }

  revalidatePath(customerPath);
  redirect(`${customerPath}?rcSaved=1#role-contacts`);
}

export async function addLocationRoleContactFromForm(formData: FormData) {
  const customerId = asTrimmed(formData.get("customer_id"));
  const locationId = asTrimmed(formData.get("location_id"));
  if (!isUuid(customerId) || !isUuid(locationId)) {
    redirect("/customers");
  }

  const customerPath = `/customers/${customerId}`;
  const failurePath = `${customerPath}?rcLocError=1#location-contacts-${locationId}`;

  const supabase = await createClient();
  const { userId, accountOwnerUserId } = await resolveInternalContactActionContext({
    supabase,
    failurePath,
  });

  const role = normalizeRole(formData.get("recipient_role"), LOCATION_FORM_ALLOWED_ROLES);
  const displayName = asTrimmed(formData.get("display_name")).slice(0, 120);
  const preferredInput = normalizePreferredContactMethod(formData.get("preferred_contact_method"));
  const phoneResult = normalizePhoneE164(formData.get("phone"));
  const emailResult = normalizeEmail(formData.get("email"));
  const notes = normalizeNotes(formData.get("notes"));

  if (!role || !displayName || !phoneResult.valid || !emailResult.valid) {
    redirect(failurePath);
  }

  const phoneE164 = phoneResult.phoneE164;
  const phoneLast10 = phoneLast10FromE164(phoneE164);
  const email = emailResult.email;

  if (!phoneE164 && !email) {
    redirect(failurePath);
  }

  const preferredContactMethod = preferredInput ?? (phoneE164 ? "phone" : email ? "email" : "none");

  if ((preferredContactMethod === "sms" || preferredContactMethod === "phone") && !phoneE164) {
    redirect(failurePath);
  }
  if (preferredContactMethod === "email" && !email) {
    redirect(failurePath);
  }

  const admin = createAdminClient();
  const customerInScope = await assertScopedCustomer({
    admin,
    customerId,
    accountOwnerUserId,
  });
  if (!customerInScope) {
    redirect(failurePath);
  }

  const locationInScope = await assertScopedLocation({
    admin,
    customerId,
    locationId,
    accountOwnerUserId,
  });
  if (!locationInScope) {
    redirect(failurePath);
  }

  const { error: insertError } = await insertScopedContactRecipient({
    supabase,
    accountOwnerUserId,
    userId,
    linkedEntityType: "location",
    linkedEntityId: locationId,
    role,
    displayName,
    phoneE164,
    phoneLast10,
    email,
    preferredContactMethod: preferredContactMethod as "sms" | "phone" | "email" | "none",
    notes,
  });

  if (insertError) {
    redirect(failurePath);
  }

  revalidatePath(customerPath);
  redirect(`${customerPath}?rcLocSaved=1#location-contacts-${locationId}`);
}
