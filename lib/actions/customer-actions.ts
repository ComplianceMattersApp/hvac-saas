//lib/actions/customer-actions
"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { mapToCanonicalRole, sanitizeEquipmentFields } from "@/lib/utils/equipment-domain";
import { nextDefaultSystemLabel } from "@/lib/customers/system-label";
import { assertNoClientSuppliedOwnerId, requireScopedEquipmentForMutation } from "@/lib/customers/scoped-equipment";
import {
  loadEquipmentReplacementHistory,
  type CustomerEquipmentHistoryUnitSummary,
} from "@/lib/customers/customer-systems-equipment-read-model";
import { redirect } from "next/navigation"

function toFullName(first?: string | null, last?: string | null) {
  const f = String(first ?? "").trim();
  const l = String(last ?? "").trim();
  return [f, l].filter(Boolean).join(" ").trim();
}

function readTrimmed(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function customerSystemsEquipmentHref(customerId: string, params: Record<string, string>) {
  const search = new URLSearchParams({ tab: "systems-equipment", ...params });
  return `/customers/${customerId}?${search.toString()}#systems-equipment`;
}

function normalizeAddressPart(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function requireOperationalCustomerMutationAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}

async function requireInternalScopedCustomerForMutation(params: {
  supabase: any;
  customerId: string;
}) {
  const customerId = String(params.customerId ?? "").trim();
  if (!customerId) throw new Error("Missing customer_id");

  const { internalUser } = await requireInternalUser({ supabase: params.supabase });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  const admin = createAdminClient();
  const { data: scopedCustomer, error: scopedCustomerErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (scopedCustomerErr) throw scopedCustomerErr;
  if (!scopedCustomer?.id) {
    throw new Error("Customer not found in internal account scope");
  }

  await requireOperationalCustomerMutationAccessOrRedirect({
    supabase: params.supabase,
    accountOwnerUserId,
  });

  return { internalUser, accountOwnerUserId, customerId };
}

export async function upsertCustomerProfileFromForm(formData: FormData) {
  const supabase = await createClient();
  let scopedCustomer;
  try {
    scopedCustomer = await requireInternalScopedCustomerForMutation({
      supabase,
      customerId: String(formData.get("customer_id") ?? "").trim(),
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  const customer_id = scopedCustomer.customerId;
  const admin = createAdminClient();

  // Customer identity/contact
  const first_name = String(formData.get("first_name") ?? "").trim() || null;
  const last_name = String(formData.get("last_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  // Billing address (customers table)
  const billing_address_line1 = String(formData.get("billing_address_line1") ?? "").trim() || null;
  const billing_address_line2 = String(formData.get("billing_address_line2") ?? "").trim() || null;
  const billing_city = String(formData.get("billing_city") ?? "").trim() || null;
  const billing_state = String(formData.get("billing_state") ?? "").trim() || null;
  const billing_zip = String(formData.get("billing_zip") ?? "").trim() || null;

  const full_name = toFullName(first_name, last_name) || null;

  // 1) Update customer
  const { error: custErr } = await admin
    .from("customers")
    .update({
      first_name,
      last_name,
      full_name,
      phone,
      email,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customer_id);

  if (custErr) throw custErr;

  // 1B) Sync job snapshot fields for all jobs tied to this customer
  // This keeps /ops + job cards accurate even if they still read from jobs.* fields.
  const { error: jobsSnapErr } = await admin
    .from("jobs")
    .update({
      customer_first_name: first_name,
      customer_last_name: last_name,
      customer_email: email,
      customer_phone: phone ?? "",
    })
    .eq("customer_id", customer_id);

  if (jobsSnapErr) throw jobsSnapErr;

  

  // Refresh UI
  revalidatePath(`/customers/${customer_id}`);
  revalidatePath(`/customers/${customer_id}/edit`);
  revalidatePath("/customers");
  revalidatePath("/ops");
  revalidatePath("/jobs");

  // ✅ this is what makes the banner possible
  redirect(`/customers/${customer_id}/edit?saved=1`);
}

export async function archiveCustomerFromForm(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const customer_id = String(formData.get("customer_id") ?? "").trim();

  try {
    await requireInternalScopedCustomerForMutation({
      supabase,
      customerId: customer_id,
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  // Safety: do not archive if customer has jobs
  const { count: jobsCount, error: jobsErr } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer_id)
    .is("deleted_at", null);

  if (jobsErr) throw jobsErr;
  if ((jobsCount ?? 0) > 0) {
    redirect(`/customers/${customer_id}?err=has_jobs`);
  }

  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customer_id);

  if (error) throw error;

  revalidatePath("/customers");
  revalidatePath(`/customers/${customer_id}`);
  revalidatePath("/ops");
  revalidatePath("/jobs");

  redirect(`/customers?saved=archived`);
}

export async function updateCustomerNotesFromForm(formData: FormData) {
  const supabase = await createClient();
  const customer_id = String(formData.get("customer_id") ?? "").trim();

  try {
    await requireInternalScopedCustomerForMutation({
      supabase,
      customerId: customer_id,
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  const notesRaw = String(formData.get("notes") ?? "");
  const notes = notesRaw.trim();

  const { error } = await supabase
    .from("customers")
    .update({
      notes: notes ? notes : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customer_id);

  if (error) throw error;

  revalidatePath(`/customers/${customer_id}`);
  revalidatePath(`/customers/${customer_id}/edit`);
  revalidatePath("/customers");

  redirect(`/customers/${customer_id}#customer-notes`);
}

/**
 * Assigns owner_user_id on a customer row that currently has owner_user_id = NULL.
 * Only internal (non-contractor) authenticated users may call this.
 * The row must be truly ownerless — if already owned by another user this is a no-op error.
 */
export async function claimNullOwnerCustomer(customerId: string, _formData: FormData) {
  const supabase = await createClient();
  const normalizedCustomerId = String(customerId ?? "").trim();
  if (!normalizedCustomerId) {
    redirect(`/customers/${customerId}/edit?claimError=missing_customer_id`);
  }

  let internalUser;
  try {
    ({ internalUser } = await requireInternalUser({ supabase }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  const admin = createAdminClient();
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  await requireOperationalCustomerMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const { data: row, error: rowErr } = await admin
    .from("customers")
    .select("id, owner_user_id")
    .eq("id", normalizedCustomerId)
    .maybeSingle();

  if (rowErr || !row) {
    redirect(`/customers/${normalizedCustomerId}/edit?claimError=row_not_found`);
  }

  if (row.owner_user_id !== null) {
    redirect(`/customers/${normalizedCustomerId}/edit?claimError=already_owned`);
  }

  const { data: claimedRow, error: updateErr } = await admin
    .from("customers")
    .update({ owner_user_id: accountOwnerUserId })
    .eq("id", normalizedCustomerId)
    .is("owner_user_id", null) // guard: only update if still null
    .select("id, owner_user_id")
    .maybeSingle();

  if (updateErr) {
    redirect(`/customers/${normalizedCustomerId}/edit?claimError=${encodeURIComponent(updateErr.message)}`);
  }

  const claimedOwnerUserId = String(claimedRow?.owner_user_id ?? "").trim();
  if (!claimedRow?.id || claimedOwnerUserId !== accountOwnerUserId) {
    redirect(`/customers/${normalizedCustomerId}/edit?claimError=already_owned`);
  }

  revalidatePath(`/customers/${normalizedCustomerId}/edit`);
  revalidatePath(`/customers/${normalizedCustomerId}`);
  redirect(`/customers/${normalizedCustomerId}/edit`);
}

/**
 * Standalone new-customer creation action.
 * Requires an authenticated active internal user.
 * Optionally creates a primary service location when address fields are provided.
 * Does NOT create any job, estimate, invoice, or service case.
 * On success, redirects to the new customer profile.
 */
export async function createCustomerOnlyFromForm(formData: FormData) {
  const supabase = await createClient();

  let internalUser;
  try {
    ({ internalUser } = await requireInternalUser({ supabase }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }
    throw error;
  }

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  await requireOperationalCustomerMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const first_name = String(formData.get("first_name") ?? "").trim() || null;
  const last_name = String(formData.get("last_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!first_name && !last_name) {
    throw new Error("At least a first name or last name is required.");
  }

  const full_name = toFullName(first_name, last_name) || null;

  const admin = createAdminClient();

  const { data: customer, error: custErr } = await admin
    .from("customers")
    .insert({
      first_name,
      last_name,
      full_name,
      phone,
      email,
      notes,
      owner_user_id: accountOwnerUserId,
    })
    .select("id")
    .single();

  if (custErr) throw new Error(`Customer insert failed: ${custErr.message}`);
  const customerId = customer.id as string;

  // Optionally create primary service location
  const address_line1 = String(formData.get("address_line1") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const state = String(formData.get("state") ?? "").trim() || null;
  const zip = String(formData.get("zip") ?? "").trim() || null;

  const hasAddress = Boolean(address_line1 && city && zip);
  if (hasAddress) {
    const { error: locErr } = await admin
      .from("locations")
      .insert({
        customer_id: customerId,
        address_line1,
        city,
        state: state || null,
        zip,
        postal_code: zip,
        owner_user_id: accountOwnerUserId,
      });

    if (locErr) throw new Error(`Location insert failed: ${locErr.message}`);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/ops");

  redirect(`/customers/${customerId}?created=1`);
}

export const createCustomerFromForm = createCustomerOnlyFromForm;

export async function addCustomerServiceLocationFromForm(formData: FormData) {
  const supabase = await createClient();
  let scopedCustomer;
  try {
    scopedCustomer = await requireInternalScopedCustomerForMutation({
      supabase,
      customerId: readTrimmed(formData, "customer_id"),
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  const customerId = scopedCustomer.customerId;
  const accountOwnerUserId = scopedCustomer.accountOwnerUserId;
  const nickname = readTrimmed(formData, "nickname");
  const label = readTrimmed(formData, "label");
  const addressLine1 = readTrimmed(formData, "address_line1");
  const addressLine2 = readTrimmed(formData, "address_line2");
  const city = readTrimmed(formData, "city");
  const state = readTrimmed(formData, "state");
  const zip = readTrimmed(formData, "zip");
  const notes = readTrimmed(formData, "notes");

  if (!addressLine1) throw new Error("Service address line 1 is required");
  if (!city) throw new Error("Service address city is required");
  if (!state) throw new Error("Service address state is required");
  if (!zip) throw new Error("Service address zip is required");

  const admin = createAdminClient();
  const { data: existingLocations, error: existingLocationsErr } = await admin
    .from("locations")
    .select("id, address_line1, city, state, zip, postal_code")
    .eq("customer_id", customerId)
    .eq("owner_user_id", accountOwnerUserId);

  if (existingLocationsErr) throw existingLocationsErr;

  const normalizedAddressLine1 = normalizeAddressPart(addressLine1);
  const normalizedCity = normalizeAddressPart(city);
  const normalizedState = normalizeAddressPart(state);
  const normalizedZip = normalizeAddressPart(zip);
  const reusableLocation = ((existingLocations ?? []) as Array<Record<string, unknown>>).find((loc) => {
    const locAddress = normalizeAddressPart(loc.address_line1 as string | null);
    const locCity = normalizeAddressPart(loc.city as string | null);
    const locState = normalizeAddressPart(loc.state as string | null);
    const locZip = normalizeAddressPart(
      (loc.zip as string | null) ?? (loc.postal_code as string | null),
    );

    return (
      locAddress === normalizedAddressLine1 &&
      locCity === normalizedCity &&
      locState === normalizedState &&
      locZip === normalizedZip
    );
  });

  if (reusableLocation?.id) {
    redirect(`/customers/${customerId}?tab=locations-contacts&locSaved=existing#location-contacts-${reusableLocation.id}`);
  }

  const { data: createdLocation, error: insertErr } = await admin
    .from("locations")
    .insert({
      customer_id: customerId,
      owner_user_id: accountOwnerUserId,
      nickname: emptyToNull(nickname),
      label: emptyToNull(label),
      address_line1: addressLine1,
      address_line2: emptyToNull(addressLine2),
      city,
      state,
      zip,
      postal_code: zip,
      notes: emptyToNull(notes),
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/jobs/new");

  const createdLocationId = String(createdLocation?.id ?? "").trim();
  redirect(
    `/customers/${customerId}?tab=locations-contacts&locSaved=created${
      createdLocationId ? `#location-contacts-${createdLocationId}` : ""
    }`,
  );
}

async function requireInternalScopedCustomerLocationForMutation(params: {
  supabase: any;
  customerId: string;
  locationId: string;
}) {
  const scopedCustomer = await requireInternalScopedCustomerForMutation({
    supabase: params.supabase,
    customerId: params.customerId,
  });

  const locationId = String(params.locationId ?? "").trim();
  if (!locationId) throw new Error("Location is required");

  const admin = createAdminClient();
  const { data: location, error: locationErr } = await admin
    .from("locations")
    .select("id, customer_id, owner_user_id")
    .eq("id", locationId)
    .eq("customer_id", scopedCustomer.customerId)
    .eq("owner_user_id", scopedCustomer.accountOwnerUserId)
    .maybeSingle();

  if (locationErr) throw locationErr;
  if (!location?.id) throw new Error("Location not found in internal account scope");

  return {
    ...scopedCustomer,
    locationId,
    admin,
  };
}

export async function addCustomerLocationSystemFromForm(formData: FormData) {
  "use server";

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const requestedName = readTrimmed(formData, "name");
  const systemType = readTrimmed(formData, "system_type");
  const notes = readTrimmed(formData, "notes");

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const name = requestedName || (await nextDefaultSystemLabel({ admin: scoped.admin, locationId: scoped.locationId }));

  const { error } = await scoped.admin
    .from("customer_location_systems")
    .insert({
      owner_user_id: scoped.accountOwnerUserId,
      customer_id: scoped.customerId,
      location_id: scoped.locationId,
      name,
      system_type: emptyToNull(systemType),
      notes: emptyToNull(notes),
    });

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "system_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "system_added" }));
}

export async function updateCustomerLocationSystemFromForm(formData: FormData) {
  "use server";

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const systemId = readTrimmed(formData, "system_id");
  const name = readTrimmed(formData, "name");
  const systemType = readTrimmed(formData, "system_type");
  const notes = readTrimmed(formData, "notes");

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");
  if (!systemId) throw new Error("System is required");
  if (!name) redirect(customerSystemsEquipmentHref(customerId, { err: "system_required" }));

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const { error } = await scoped.admin
    .from("customer_location_systems")
    .update({
      name,
      system_type: emptyToNull(systemType),
      notes: emptyToNull(notes),
    })
    .eq("id", systemId)
    .eq("customer_id", scoped.customerId)
    .eq("location_id", scoped.locationId)
    .eq("owner_user_id", scoped.accountOwnerUserId)
    .is("archived_at", null);

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "system_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "system_updated" }));
}

export async function archiveCustomerLocationSystemFromForm(formData: FormData) {
  "use server";

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const systemId = readTrimmed(formData, "system_id");

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");
  if (!systemId) throw new Error("System is required");

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  // Safety: mirrors archiveCustomerFromForm's "don't archive if it still has
  // jobs" guard — don't archive a system that still has active equipment,
  // since new equipment can't be attached to an archived system afterward.
  const { count: activeEquipmentCount, error: countErr } = await scoped.admin
    .from("equipment")
    .select("id", { count: "exact", head: true })
    .eq("system_id", systemId)
    .eq("status", "active");

  if (countErr) throw countErr;
  if ((activeEquipmentCount ?? 0) > 0) {
    redirect(customerSystemsEquipmentHref(customerId, { err: "system_has_active_equipment" }));
  }

  const { error } = await scoped.admin
    .from("customer_location_systems")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", systemId)
    .eq("customer_id", scoped.customerId)
    .eq("location_id", scoped.locationId)
    .eq("owner_user_id", scoped.accountOwnerUserId);

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "system_archive_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "system_archived" }));
}

/** Shared numeric-field parsing for equipment forms — mirrors job-actions.ts. */
function readOptionalNumber(formData: FormData, key: string): number | null {
  const raw = readTrimmed(formData, key);
  return raw ? Number(raw) : null;
}

/**
 * install_source / source_job_id read + validation, shared by create and
 * replace. Defaults to 'standalone' with no job when the form doesn't supply
 * a source (true for every current caller — no UI sets these fields yet).
 * equipment_source_job_consistency_chk enforces the same rule at the DB
 * layer; this just gives a friendlier redirect instead of a raw constraint error.
 */
function readInstallSource(formData: FormData): { installSource: string; sourceJobId: string | null } {
  const installSource = readTrimmed(formData, "install_source") || "standalone";
  const sourceJobId = readTrimmed(formData, "source_job_id") || null;

  if (installSource === "job" && !sourceJobId) {
    throw new Error("source_job_id is required when install_source is 'job'");
  }
  if (installSource !== "job" && sourceJobId) {
    throw new Error("source_job_id must be empty unless install_source is 'job'");
  }

  return { installSource, sourceJobId };
}

export async function addCustomerLocationEquipmentFromForm(formData: FormData) {
  "use server";

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const systemId = readTrimmed(formData, "system_id");
  const rawEquipmentType = readTrimmed(formData, "equipment_role") || readTrimmed(formData, "equipment_type");
  const equipmentRole = mapToCanonicalRole(rawEquipmentType || "other");
  const manufacturer = readTrimmed(formData, "manufacturer");
  const model = readTrimmed(formData, "model");
  const serial = readTrimmed(formData, "serial");
  const notes = readTrimmed(formData, "notes");
  const { installSource, sourceJobId } = readInstallSource(formData);

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");
  if (!systemId) throw new Error("System is required");
  if (!equipmentRole) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_required" }));

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const { data: system, error: systemErr } = await scoped.admin
    .from("customer_location_systems")
    .select("id")
    .eq("id", systemId)
    .eq("customer_id", scoped.customerId)
    .eq("location_id", scoped.locationId)
    .eq("owner_user_id", scoped.accountOwnerUserId)
    .is("archived_at", null)
    .maybeSingle();

  if (systemErr) throw systemErr;
  if (!system?.id) throw new Error("System not found in internal account scope");

  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole,
    manufacturer: emptyToNull(manufacturer),
    model: emptyToNull(model),
    serial: emptyToNull(serial),
    notes: emptyToNull(notes),
    tonnage: readOptionalNumber(formData, "tonnage"),
    refrigerantType: emptyToNull(readTrimmed(formData, "refrigerant_type")),
    heatingCapacityKbtu: readOptionalNumber(formData, "heating_capacity_kbtu"),
    heatingOutputBtu: readOptionalNumber(formData, "heating_output_btu"),
    heatingEfficiencyPercent: readOptionalNumber(formData, "heating_efficiency_percent"),
  });

  const { error } = await scoped.admin
    .from("equipment")
    .insert({
      owner_user_id: scoped.accountOwnerUserId,
      location_id: scoped.locationId,
      system_id: systemId,
      equipment_type: eqFields.equipment_role,
      manufacturer: eqFields.manufacturer,
      model: eqFields.model,
      serial: eqFields.serial,
      notes: eqFields.notes,
      tonnage: eqFields.tonnage,
      refrigerant_type: eqFields.refrigerant_type,
      heating_capacity_kbtu: eqFields.heating_capacity_kbtu,
      heating_output_btu: eqFields.heating_output_btu,
      heating_efficiency_percent: eqFields.heating_efficiency_percent,
      install_source: installSource,
      source_job_id: sourceJobId,
    });

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "equipment_added" }));
}

export async function updateCustomerLocationEquipmentFromForm(formData: FormData) {
  "use server";

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const equipmentId = readTrimmed(formData, "equipment_id");
  const rawEquipmentType = readTrimmed(formData, "equipment_role") || readTrimmed(formData, "equipment_type");
  const equipmentRole = mapToCanonicalRole(rawEquipmentType || "other");
  const manufacturer = readTrimmed(formData, "manufacturer");
  const model = readTrimmed(formData, "model");
  const serial = readTrimmed(formData, "serial");
  const notes = readTrimmed(formData, "notes");

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");
  if (!equipmentId) throw new Error("Equipment is required");
  if (!equipmentRole) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_required" }));

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole,
    manufacturer: emptyToNull(manufacturer),
    model: emptyToNull(model),
    serial: emptyToNull(serial),
    notes: emptyToNull(notes),
    tonnage: readOptionalNumber(formData, "tonnage"),
    refrigerantType: emptyToNull(readTrimmed(formData, "refrigerant_type")),
    heatingCapacityKbtu: readOptionalNumber(formData, "heating_capacity_kbtu"),
    heatingOutputBtu: readOptionalNumber(formData, "heating_output_btu"),
    heatingEfficiencyPercent: readOptionalNumber(formData, "heating_efficiency_percent"),
  });

  const { error } = await scoped.admin
    .from("equipment")
    .update({
      equipment_type: eqFields.equipment_role,
      manufacturer: eqFields.manufacturer,
      model: eqFields.model,
      serial: eqFields.serial,
      notes: eqFields.notes,
      tonnage: eqFields.tonnage,
      refrigerant_type: eqFields.refrigerant_type,
      heating_capacity_kbtu: eqFields.heating_capacity_kbtu,
      heating_output_btu: eqFields.heating_output_btu,
      heating_efficiency_percent: eqFields.heating_efficiency_percent,
    })
    .eq("id", equipmentId)
    .eq("location_id", scoped.locationId)
    .eq("owner_user_id", scoped.accountOwnerUserId);

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "equipment_updated" }));
}

/** Retire with no replacement — the unit was removed, not swapped. */
export async function retireCustomerLocationEquipmentFromForm(formData: FormData) {
  "use server";

  assertNoClientSuppliedOwnerId(formData);

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const equipmentId = readTrimmed(formData, "equipment_id");
  const retireReason = readTrimmed(formData, "retire_reason");

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");
  if (!equipmentId) throw new Error("Equipment is required");
  if (!["failure", "warranty", "upgrade"].includes(retireReason)) {
    redirect(customerSystemsEquipmentHref(customerId, { err: "retire_reason_required" }));
  }

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const { error } = await scoped.admin
    .from("equipment")
    .update({
      status: "retired",
      retired_at: new Date().toISOString(),
      retire_reason: retireReason,
    })
    .eq("id", equipmentId)
    .eq("location_id", scoped.locationId)
    .eq("owner_user_id", scoped.accountOwnerUserId)
    .eq("status", "active");

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_retire_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "equipment_retired" }));
}

/**
 * Retire the old unit and install its replacement in one atomic DB
 * transaction (public.replace_customer_location_equipment) — never leaves a
 * retired unit with no successor, or two active units, if one write fails.
 */
export async function replaceCustomerLocationEquipmentFromForm(formData: FormData) {
  "use server";

  assertNoClientSuppliedOwnerId(formData);

  const customerId = readTrimmed(formData, "customer_id");
  const locationId = readTrimmed(formData, "location_id");
  const oldEquipmentId = readTrimmed(formData, "equipment_id");
  const systemId = readTrimmed(formData, "system_id");
  const retireReason = readTrimmed(formData, "retire_reason");
  const rawEquipmentType = readTrimmed(formData, "equipment_role") || readTrimmed(formData, "equipment_type");
  const equipmentRole = mapToCanonicalRole(rawEquipmentType || "other");
  const manufacturer = readTrimmed(formData, "manufacturer");
  const model = readTrimmed(formData, "model");
  const serial = readTrimmed(formData, "serial");
  const notes = readTrimmed(formData, "notes");
  const { installSource, sourceJobId } = readInstallSource(formData);

  if (!customerId) throw new Error("Customer is required");
  if (!locationId) throw new Error("Location is required");
  if (!oldEquipmentId) throw new Error("Equipment to replace is required");
  if (!systemId) throw new Error("System is required");
  if (!["failure", "warranty", "upgrade"].includes(retireReason)) {
    redirect(customerSystemsEquipmentHref(customerId, { err: "retire_reason_required" }));
  }
  if (!equipmentRole) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_required" }));

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId,
      locationId,
    });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  // The RPC only re-checks owner_user_id, not location — an equipment_id from
  // a different location under the same account owner would otherwise still
  // be accepted. Confirm it belongs to *this* scoped location before calling it.
  let oldEquipment;
  try {
    oldEquipment = await requireScopedEquipmentForMutation({
      admin: scoped.admin,
      equipmentId: oldEquipmentId,
      locationId: scoped.locationId,
      ownerUserId: scoped.accountOwnerUserId,
    });
  } catch {
    redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_not_found" }));
  }
  if (oldEquipment.status !== "active") {
    redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_already_retired" }));
  }

  const eqFields = sanitizeEquipmentFields({
    canonicalRole: equipmentRole,
    manufacturer: emptyToNull(manufacturer),
    model: emptyToNull(model),
    serial: emptyToNull(serial),
    notes: emptyToNull(notes),
    tonnage: readOptionalNumber(formData, "tonnage"),
    refrigerantType: emptyToNull(readTrimmed(formData, "refrigerant_type")),
    heatingCapacityKbtu: readOptionalNumber(formData, "heating_capacity_kbtu"),
    heatingOutputBtu: readOptionalNumber(formData, "heating_output_btu"),
    heatingEfficiencyPercent: readOptionalNumber(formData, "heating_efficiency_percent"),
  });

  const { error } = await scoped.admin.rpc("replace_customer_location_equipment", {
    p_owner_user_id: scoped.accountOwnerUserId,
    p_old_equipment_id: oldEquipmentId,
    p_retire_reason: retireReason,
    p_location_id: scoped.locationId,
    p_system_id: systemId,
    p_equipment_type: eqFields.equipment_role,
    p_manufacturer: eqFields.manufacturer,
    p_model: eqFields.model,
    p_serial: eqFields.serial,
    p_notes: eqFields.notes,
    p_tonnage: eqFields.tonnage,
    p_refrigerant_type: eqFields.refrigerant_type,
    p_heating_capacity_kbtu: eqFields.heating_capacity_kbtu,
    p_heating_output_btu: eqFields.heating_output_btu,
    p_heating_efficiency_percent: eqFields.heating_efficiency_percent,
    p_install_source: installSource,
    p_source_job_id: sourceJobId,
  });

  if (error) redirect(customerSystemsEquipmentHref(customerId, { err: "equipment_replace_failed" }));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(customerSystemsEquipmentHref(customerId, { saved: "equipment_replaced" }));
}

/**
 * On-demand "view full history" — called directly from a client component
 * (not a <form action>), so it returns data instead of redirecting. Never
 * called as part of the main page render; the read model deliberately stops
 * at one hop (CustomerEquipmentSummaryRow.priorUnit) so a long replacement
 * chain costs nothing until a user explicitly asks to see it.
 */
export async function loadEquipmentReplacementHistoryForCustomer(params: {
  customerId: string;
  locationId: string;
  equipmentId: string;
}): Promise<CustomerEquipmentHistoryUnitSummary[]> {
  "use server";

  const supabase = await createClient();
  let scoped;
  try {
    scoped = await requireInternalScopedCustomerLocationForMutation({
      supabase,
      customerId: params.customerId,
      locationId: params.locationId,
    });
  } catch {
    return [];
  }

  return loadEquipmentReplacementHistory({
    supabase: scoped.admin,
    accountOwnerUserId: scoped.accountOwnerUserId,
    equipmentId: params.equipmentId,
  });
}
