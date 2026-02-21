"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createContractorFromForm(formData: FormData) {
  const supabase = await createClient();

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
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/contractors");
  revalidatePath("/ops");

  redirect(`/contractors/${data.id}/edit`);
}

// keep your existing updateContractorFromForm here (unchanged)
export async function updateContractorFromForm(formData: FormData) {
  const supabase = await createClient();

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
    })
    .eq("id", contractor_id);

  if (error) throw new Error(error.message);

  revalidatePath("/contractors");
  revalidatePath(`/contractors/${contractor_id}/edit`);
  revalidatePath("/ops");
  redirect(`/contractors/${contractor_id}/edit?saved=1`);
}