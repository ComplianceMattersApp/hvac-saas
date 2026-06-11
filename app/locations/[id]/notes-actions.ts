"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { redirect } from "next/navigation";

type LocationAddressRow = {
  id: string;
  customer_id: string | null;
  owner_user_id: string | null;
  nickname: string | null;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  postal_code: string | null;
  notes: string | null;
};

type CustomerBillingRow = {
  id: string;
  owner_user_id: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
};

function readTrimmed(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeAddressPart(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function allBillingFieldsBlank(customer: CustomerBillingRow | null) {
  if (!customer) return false;

  return [
    customer.billing_address_line1,
    customer.billing_address_line2,
    customer.billing_city,
    customer.billing_state,
    customer.billing_zip,
  ].every((value) => !normalizeAddressPart(value));
}

function billingMatchesOldLocation(
  customer: CustomerBillingRow | null,
  location: LocationAddressRow,
) {
  if (!customer) return false;

  const oldZip = location.zip || location.postal_code;
  const requiredFieldsMatch =
    normalizeAddressPart(customer.billing_address_line1) ===
      normalizeAddressPart(location.address_line1) &&
    normalizeAddressPart(customer.billing_city) === normalizeAddressPart(location.city) &&
    normalizeAddressPart(customer.billing_state) === normalizeAddressPart(location.state) &&
    normalizeAddressPart(customer.billing_zip) === normalizeAddressPart(oldZip);

  if (!requiredFieldsMatch) return false;

  return (
    normalizeAddressPart(customer.billing_address_line2) ===
    normalizeAddressPart(location.address_line2)
  );
}

async function loadScopedLocationForInternalMutation(locationId: string) {
  const supabase = await createClient();

  let internalUser: any;
  try {
    const internalResult = await requireInternalUser({ supabase });
    internalUser = internalResult?.internalUser ?? internalResult;
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  const accountOwnerUserId = String(internalUser?.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) {
    throw new Error("Internal account scope unavailable");
  }

  const admin = createAdminClient();
  const { data: location, error: locationError } = await admin
    .from("locations")
    .select(
      "id, customer_id, owner_user_id, nickname, label, address_line1, address_line2, city, state, zip, postal_code, notes",
    )
    .eq("id", locationId)
    .maybeSingle();

  if (locationError) throw locationError;
  if (!location || String((location as any).owner_user_id ?? "").trim() !== accountOwnerUserId) {
    throw new Error("Location not found in internal account scope");
  }

  let customer: CustomerBillingRow | null = null;
  const customerId = String((location as any).customer_id ?? "").trim();
  if (customerId) {
    const { data: customerRow, error: customerError } = await admin
      .from("customers")
      .select(
        "id, owner_user_id, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip",
      )
      .eq("id", customerId)
      .eq("owner_user_id", accountOwnerUserId)
      .maybeSingle();

    if (customerError) throw customerError;
    customer = (customerRow as CustomerBillingRow | null) ?? null;
  }

  return {
    admin,
    accountOwnerUserId,
    location: location as LocationAddressRow,
    customer,
  };
}

export async function updateLocationServiceAddressFromForm(formData: FormData) {
  const locationId = readTrimmed(formData, "location_id");
  if (!locationId) throw new Error("Missing location_id");

  const addressLine1 = readTrimmed(formData, "address_line1");
  const city = readTrimmed(formData, "city");
  const state = readTrimmed(formData, "state");
  const zip = readTrimmed(formData, "zip");

  if (!addressLine1) throw new Error("Service address line 1 is required");
  if (!city) throw new Error("Service address city is required");
  if (!state) throw new Error("Service address state is required");
  if (!zip) throw new Error("Service address zip is required");

  const addressLine2 = readTrimmed(formData, "address_line2");
  const nickname = readTrimmed(formData, "nickname");
  const label = readTrimmed(formData, "label");
  const notes = readTrimmed(formData, "notes");

  const { admin, location, customer } =
    await loadScopedLocationForInternalMutation(locationId);

  const locationUpdate = {
    nickname: emptyToNull(nickname),
    label: emptyToNull(label),
    address_line1: addressLine1,
    address_line2: emptyToNull(addressLine2),
    city,
    state,
    zip,
    postal_code: zip,
    notes: emptyToNull(notes),
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await admin
    .from("locations")
    .update(locationUpdate)
    .eq("id", locationId);

  if (updateError) throw updateError;

  const shouldSyncBilling =
    customer &&
    (allBillingFieldsBlank(customer) || billingMatchesOldLocation(customer, location));

  if (shouldSyncBilling) {
    const { error: customerUpdateError } = await admin
      .from("customers")
      .update({
        billing_address_line1: addressLine1,
        billing_address_line2: emptyToNull(addressLine2),
        billing_city: city,
        billing_state: state,
        billing_zip: zip,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customer.id)
      .eq("owner_user_id", customer.owner_user_id);

    if (customerUpdateError) throw customerUpdateError;
  }

  revalidatePath(`/locations/${locationId}`);
  if (location.customer_id) {
    revalidatePath(`/customers/${location.customer_id}`);
  }

  redirect(`/locations/${locationId}?saved=service_address`);
}

export async function updateLocationNotesFromForm(formData: FormData) {
  const locationId = String(formData.get("location_id") ?? "").trim();
  if (!locationId) throw new Error("Missing location_id");

  const notesRaw = String(formData.get("notes") ?? "");
  const notes = notesRaw.trim();
  const { admin } = await loadScopedLocationForInternalMutation(locationId);

  const { error } = await admin
    .from("locations")
    .update({ notes: notes ? notes : null })
    .eq("id", locationId);

  if (error) throw error;

  revalidatePath(`/locations/${locationId}`);

  redirect(`/locations/${locationId}`);
}
