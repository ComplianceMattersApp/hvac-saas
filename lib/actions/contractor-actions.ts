"use server";

import { createClient } from "@/lib/supabase/server";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { loadScopedInternalContractorForMutation } from "@/lib/auth/internal-contractor-scope";
import { inviteContractor } from "@/lib/actions/contractor-invite-actions";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type ContractorCreateNotice =
  | "contractor_created_invite_sent"
  | "contractor_created_no_email"
  | "contractor_created_invite_failed";

function withNotice(path: string, notice: ContractorCreateNotice) {
  const url = new URL(`http://local${path}`);
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}

function normalizeInviteEmail(raw: string | null) {
  const value = String(raw ?? "").trim().toLowerCase();
  return value || null;
}

async function requireOperationalContractorMutationAccessOrRedirect(params: {
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

async function requireInternalAdminContractorMutationContext(params: {
  supabase?: Awaited<ReturnType<typeof createClient>>;
}) {
  const supabase = params.supabase ?? (await createClient());
  const { internalUser } = await requireInternalRole("admin", {
    supabase,
  });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  return {
    supabase,
    internalUser,
    accountOwnerUserId,
  };
}

async function requireScopedContractorEdgeMutation(params: {
  accountOwnerUserId: string;
  contractorId: string;
}) {
  const scopedContractor = await loadScopedInternalContractorForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    contractorId: params.contractorId,
  });

  if (!scopedContractor?.id) {
    throw new Error("Access denied");
  }

  return scopedContractor;
}

function resolveScopedOwnerForCreate(params: {
  accountOwnerUserId: string;
  requestedOwnerUserId: string | null;
}) {
  const requestedOwnerUserId = String(params.requestedOwnerUserId ?? "").trim();
  if (requestedOwnerUserId && requestedOwnerUserId !== params.accountOwnerUserId) {
    throw new Error("Access denied");
  }

  return params.accountOwnerUserId;
}

async function getCreateNotice(params: {
  contractorId: string;
  email: string | null;
}): Promise<ContractorCreateNotice> {
  const email = normalizeInviteEmail(params.email);

  if (!email || !email.includes("@")) {
    return "contractor_created_no_email";
  }

  try {
    await inviteContractor({
      contractorId: params.contractorId,
      email,
    });
    return "contractor_created_invite_sent";
  } catch {
    return "contractor_created_invite_failed";
  }
}

export async function createContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole(["admin", "office"], {
    supabase,
  });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  await requireOperationalContractorMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Contractor name is required.");

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const billing_name = String(formData.get("billing_name") ?? "").trim() || null;
  const billing_email = String(formData.get("billing_email") ?? "").trim() || null;
  const billing_phone = String(formData.get("billing_phone") ?? "").trim() || null;

  const billing_address_line1 = String(formData.get("billing_address_line1") ?? "").trim() || null;
  const billing_address_line2 = String(formData.get("billing_address_line2") ?? "").trim() || null;
  const billing_city = String(formData.get("billing_city") ?? "").trim() || null;
  const billing_state = String(formData.get("billing_state") ?? "").trim() || null;
  const billing_zip = String(formData.get("billing_zip") ?? "").trim() || null;

  const { data, error } = await supabase
    .from("contractors")
    .insert({
      name,
      phone,
      email,
      notes,
      billing_name: billing_name || name, // default
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
      owner_user_id: accountOwnerUserId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const notice = await getCreateNotice({
    contractorId: String(data.id),
    email,
  });

  revalidatePath("/ops/admin/contractors");
  revalidatePath("/ops");

  redirect(withNotice(`/contractors/${data.id}/edit`, notice));
}

// keep your existing updateContractorFromForm here (unchanged)
export async function updateContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole(["admin", "office"], {
    supabase,
  });
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!accountOwnerUserId) throw new Error("Missing account owner scope");

  const contractor_id = String(formData.get("contractor_id") ?? "").trim();
  if (!contractor_id) throw new Error("Missing contractor_id");

  const name = String(formData.get("name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const billing_name = String(formData.get("billing_name") ?? "").trim() || null;
  const billing_email = String(formData.get("billing_email") ?? "").trim() || null;
  const billing_phone = String(formData.get("billing_phone") ?? "").trim() || null;

  const billing_address_line1 = String(formData.get("billing_address_line1") ?? "").trim() || null;
  const billing_address_line2 = String(formData.get("billing_address_line2") ?? "").trim() || null;
  const billing_city = String(formData.get("billing_city") ?? "").trim() || null;
  const billing_state = String(formData.get("billing_state") ?? "").trim() || null;
  const billing_zip = String(formData.get("billing_zip") ?? "").trim() || null;

  const scopedContractor = await loadScopedInternalContractorForMutation({
    accountOwnerUserId,
    contractorId: contractor_id,
  });
  if (!scopedContractor?.id) throw new Error("Access denied");

  await requireOperationalContractorMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const { error } = await supabase
    .from("contractors")
    .update({
      name,
      phone,
      email,
      notes,
      billing_name,
      billing_email,
      billing_phone,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
      owner_user_id: accountOwnerUserId,
    })
    .eq("id", contractor_id);

  if (error) throw new Error(error.message);

  revalidatePath("/ops/admin/contractors");
  revalidatePath(`/contractors/${contractor_id}/edit`);
  revalidatePath("/ops");
  redirect(`/contractors/${contractor_id}/edit?saved=1`);
}

export async function updateContractorNameAndEmailFromForm(formData: FormData) {
  const supabase = await createClient();
  const { accountOwnerUserId } = await requireInternalAdminContractorMutationContext({
    supabase,
  });

  const contractor_id = String(formData.get("contractor_id") ?? "").trim();
  if (!contractor_id) throw new Error("Missing contractor_id");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Contractor name is required.");

  const email = String(formData.get("email") ?? "").trim() || null;

  await requireScopedContractorEdgeMutation({
    accountOwnerUserId,
    contractorId: contractor_id,
  });

  await requireOperationalContractorMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const { error } = await supabase
    .from("contractors")
    .update({
      name,
      email,
    })
    .eq("id", contractor_id);

  if (error) throw new Error(error.message);

  revalidatePath("/ops/admin/contractors");
}

export async function createQuickContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { accountOwnerUserId } = await requireInternalAdminContractorMutationContext({
    supabase,
  });

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Contractor name is required.");

  const email = String(formData.get("email") ?? "").trim() || null;
  const ownerUserId = resolveScopedOwnerForCreate({
    accountOwnerUserId,
    requestedOwnerUserId: String(formData.get("owner_user_id") ?? "").trim() || null,
  });

  await requireOperationalContractorMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId: ownerUserId,
  });

  const { data, error } = await supabase
    .from("contractors")
    .insert({
      name,
      email,
      owner_user_id: ownerUserId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const notice = await getCreateNotice({
    contractorId: String(data.id),
    email,
  });

  revalidatePath("/ops/admin/contractors");
  redirect(withNotice("/ops/admin/contractors", notice));
}

export async function archiveContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { accountOwnerUserId, internalUser } = await requireInternalAdminContractorMutationContext({
    supabase,
  });

  const contractor_id = String(formData.get("contractor_id") ?? "").trim();
  if (!contractor_id) throw new Error("Missing contractor_id");

  const archivedReason = String(formData.get("archived_reason") ?? "").trim() || null;

  await requireScopedContractorEdgeMutation({
    accountOwnerUserId,
    contractorId: contractor_id,
  });

  await requireOperationalContractorMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const { error } = await supabase
    .from("contractors")
    .update({
      lifecycle_state: "archived",
      archived_at: new Date().toISOString(),
      archived_by_user_id: internalUser.user_id,
      archived_reason: archivedReason,
    })
    .eq("id", contractor_id)
    .eq("owner_user_id", accountOwnerUserId);

  if (error) throw new Error(error.message);

  // Revoke open invites without deleting invite history.
  const { error: inviteErr } = await supabase
    .from("contractor_invites")
    .update({ status: "revoked" })
    .eq("owner_user_id", accountOwnerUserId)
    .eq("contractor_id", contractor_id)
    .eq("status", "pending");

  if (inviteErr) throw new Error(inviteErr.message);

  revalidatePath("/ops/admin/contractors");
  revalidatePath(`/contractors/${contractor_id}/edit`);
  revalidatePath("/ops");
  revalidatePath("/jobs");
  revalidatePath("/portal");

  redirect(`/contractors/${contractor_id}/edit?saved=1&notice=contractor_archived`);
}

export async function unarchiveContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { accountOwnerUserId } = await requireInternalAdminContractorMutationContext({
    supabase,
  });

  const contractor_id = String(formData.get("contractor_id") ?? "").trim();
  if (!contractor_id) throw new Error("Missing contractor_id");

  await requireScopedContractorEdgeMutation({
    accountOwnerUserId,
    contractorId: contractor_id,
  });

  await requireOperationalContractorMutationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  const { error } = await supabase
    .from("contractors")
    .update({
      lifecycle_state: "active",
      archived_at: null,
      archived_by_user_id: null,
      archived_reason: null,
    })
    .eq("id", contractor_id)
    .eq("owner_user_id", accountOwnerUserId);

  if (error) throw new Error(error.message);

  revalidatePath("/ops/admin/contractors");
  revalidatePath(`/contractors/${contractor_id}/edit`);
  revalidatePath("/ops");
  revalidatePath("/jobs");
  revalidatePath("/portal");

  redirect(`/contractors/${contractor_id}/edit?saved=1&notice=contractor_unarchived`);
}