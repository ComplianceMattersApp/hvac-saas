"use server";

import { createClient } from "@/lib/supabase/server";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { inviteContractor } from "@/lib/actions/contractor-invite-actions";
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
      owner_user_id: internalUser.account_owner_user_id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const notice = await getCreateNotice({
    contractorId: String(data.id),
    email,
  });

  revalidatePath("/contractors");
  revalidatePath("/ops");

  redirect(withNotice(`/contractors/${data.id}/edit`, notice));
}

// keep your existing updateContractorFromForm here (unchanged)
export async function updateContractorFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole(["admin", "office"], {
    supabase,
  });

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

  const { data: existingContractor, error: existingContractorError } = await supabase
    .from("contractors")
    .select("id, owner_user_id")
    .eq("id", contractor_id)
    .maybeSingle();

  if (existingContractorError) throw new Error(existingContractorError.message);
  if (!existingContractor?.id) throw new Error("Contractor not found");

  const owner_user_id =
    String(existingContractor.owner_user_id ?? "").trim() ||
    String(internalUser.account_owner_user_id ?? "").trim() ||
    null;

  if (!owner_user_id) {
    throw new Error("Contractor must have owner_user_id");
  }

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
      owner_user_id,
    })
    .eq("id", contractor_id);

  if (error) throw new Error(error.message);

  revalidatePath("/contractors");
  revalidatePath(`/contractors/${contractor_id}/edit`);
  revalidatePath("/ops");
  redirect(`/contractors/${contractor_id}/edit?saved=1`);
}

export async function updateContractorNameAndEmailFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", {
    supabase,
  });

  const contractor_id = String(formData.get("contractor_id") ?? "").trim();
  if (!contractor_id) throw new Error("Missing contractor_id");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Contractor name is required.");

  const email = String(formData.get("email") ?? "").trim() || null;

  const { data: existingContractor, error: existingContractorError } = await supabase
    .from("contractors")
    .select("id, owner_user_id")
    .eq("id", contractor_id)
    .maybeSingle();

  if (existingContractorError) throw new Error(existingContractorError.message);
  if (!existingContractor?.id) throw new Error("Contractor not found");

  if (existingContractor.owner_user_id !== internalUser.account_owner_user_id) {
    throw new Error("Access denied");
  }

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
  const { internalUser } = await requireInternalRole("admin", {
    supabase,
  });

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Contractor name is required.");

  const email = String(formData.get("email") ?? "").trim() || null;

  const { data, error } = await supabase
    .from("contractors")
    .insert({
      name,
      email,
      owner_user_id: internalUser.account_owner_user_id,
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