"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation"

function toFullName(first?: string | null, last?: string | null) {
  const f = String(first ?? "").trim();
  const l = String(last ?? "").trim();
  return [f, l].filter(Boolean).join(" ").trim();
}

export async function upsertCustomerProfileFromForm(formData: FormData) {
  const supabase = await createClient();

  const customer_id = String(formData.get("customer_id") ?? "").trim();
  if (!customer_id) throw new Error("Missing customer_id");

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

  // Service address (locations table) — we will create or update the first location for this customer
  const address_line1 = String(formData.get("address_line1") ?? "").trim() || null;
  const address_line2 = String(formData.get("address_line2") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const state = String(formData.get("state") ?? "").trim() || null;
  const zip = String(formData.get("zip") ?? "").trim() || null;

  // 1) Update customer
  const { error: custErr } = await supabase
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
const { error: jobsSnapErr } = await supabase
  .from("jobs")
  .update({
  customer_first_name: first_name,
  customer_last_name: last_name,
  customer_email: email,
  customer_phone: phone,
  })
  .eq("customer_id", customer_id);

if (jobsSnapErr) throw jobsSnapErr;

  // 2) Upsert primary location
  // If all service fields are blank, do nothing (optional)
  const anyService =
    !!address_line1 || !!address_line2 || !!city || !!state || !!zip;

  if (anyService) {
    const { data: existingLoc, error: locFetchErr } = await supabase
      .from("locations")
      .select("id")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (locFetchErr) throw locFetchErr;

    if (existingLoc?.id) {
      const { error: locUpdErr } = await supabase
        .from("locations")
        .update({
          address_line1,
          address_line2,
          city,
          state,
          zip,
          postal_code: zip, // keep both fields consistent
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLoc.id);

      if (locUpdErr) throw locUpdErr;
      // 2B) Sync job address snapshots for jobs at this location
      const { error: jobsAddrErr } = await supabase
        .from("jobs")
        .update({
          job_address: address_line1,
          city,
        })
        .eq("location_id", existingLoc.id);

      if (jobsAddrErr) throw jobsAddrErr;

    } else {
      const { data: newLoc, error: locInsErr } = await supabase
        .from("locations")
        .insert({
          customer_id,
          nickname: null,
          label: "Primary",
          address_line1,
          address_line2,
          city,
          state,
          zip,
          postal_code: zip,
        })
        .select("id")
        .single();

      if (locInsErr) throw locInsErr;

      // Sync job address snapshots for jobs tied to this customer that may point at this new primary location later.
      // (Safe even if 0 rows match.)
      const { error: jobsAddrErr } = await supabase
        .from("jobs")
        .update({
          job_address: address_line1,
          city,
          updated_at: new Date().toISOString(),
        })
        .eq("location_id", newLoc.id);

      if (jobsAddrErr) throw jobsAddrErr;
    }
  }

  

  // Refresh UI
  revalidatePath(`/customers/${customer_id}`);
  revalidatePath(`/customers/${customer_id}/edit`);
  revalidatePath("/customers");
  revalidatePath("/ops");
  revalidatePath("/jobs");

  // ✅ this is what makes the banner possible
  redirect(`/customers/${customer_id}/edit?saved=1`);
}

