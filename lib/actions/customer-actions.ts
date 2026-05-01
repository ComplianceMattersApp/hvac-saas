//lib/actions/customer-actions
"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { redirect } from "next/navigation"

function toFullName(first?: string | null, last?: string | null) {
  const f = String(first ?? "").trim();
  const l = String(last ?? "").trim();
  return [f, l].filter(Boolean).join(" ").trim();
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