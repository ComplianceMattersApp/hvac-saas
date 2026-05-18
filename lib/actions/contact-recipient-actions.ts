"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const CUSTOMER_FORM_ALLOWED_ROLES = [
  "homeowner",
  "tenant_or_occupant",
  "responsible_party",
  "billing_contact",
  "third_party_oversight",
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

function normalizeRole(value: FormDataEntryValue | null) {
  const role = asTrimmed(value).toLowerCase();
  return CUSTOMER_FORM_ALLOWED_ROLES.includes(role as (typeof CUSTOMER_FORM_ALLOWED_ROLES)[number])
    ? role
    : null;
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

export async function addCustomerRoleContactFromForm(formData: FormData) {
  const customerId = asTrimmed(formData.get("customer_id"));
  if (!isUuid(customerId)) {
    redirect("/customers");
  }

  const customerPath = `/customers/${customerId}`;
  const failurePath = `${customerPath}?rcError=1#role-contacts`;

  const supabase = await createClient();

  let userId: string;
  let accountOwnerUserId: string;
  try {
    const internal = await requireInternalUser({ supabase });
    userId = String(internal.userId ?? "").trim();
    accountOwnerUserId = String(internal.internalUser.account_owner_user_id ?? "").trim();
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }
    throw error;
  }

  if (!userId || !accountOwnerUserId) {
    redirect(failurePath);
  }

  const role = normalizeRole(formData.get("recipient_role"));
  const displayName = asTrimmed(formData.get("display_name")).slice(0, 120);
  const preferredInput = normalizePreferredContactMethod(formData.get("preferred_contact_method"));
  const phoneResult = normalizePhoneE164(formData.get("phone"));
  const emailResult = normalizeEmail(formData.get("email"));

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
  const { data: scopedCustomer, error: scopedCustomerErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (scopedCustomerErr) throw scopedCustomerErr;
  if (!scopedCustomer?.id) {
    redirect(failurePath);
  }

  const { error: insertError } = await supabase.from("contact_recipients").insert({
    account_owner_user_id: accountOwnerUserId,
    linked_entity_type: "customer",
    linked_entity_id: customerId,
    recipient_role: role,
    display_name: displayName,
    phone_e164: phoneE164,
    phone_last10: phoneLast10,
    email,
    preferred_contact_method: preferredContactMethod,
    source_type: "manual",
    status: "active",
    created_by_user_id: userId,
    updated_by_user_id: userId,
  });

  if (insertError) {
    redirect(failurePath);
  }

  revalidatePath(customerPath);
  redirect(`${customerPath}?rcSaved=1#role-contacts`);
}
