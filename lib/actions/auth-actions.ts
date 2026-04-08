"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function normalizeText(raw: FormDataEntryValue | null, maxLength = 120) {
  return String(raw ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizePhone(raw: FormDataEntryValue | null) {
  return String(raw ?? "").replace(/\u0000/g, "").trim().slice(0, 40);
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  redirect("/login");
}

export async function updateOwnProfileFromForm(formData: FormData) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = userData?.user;
  if (!user) redirect("/login");

  const displayName = normalizeText(formData.get("display_name"));
  const phone = normalizePhone(formData.get("phone"));
  if (!displayName) {
    redirect("/account/edit?banner=missing_name");
  }

  const { data: existingProfile, error: profileReadErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileReadErr) throw profileReadErr;

  if (existingProfile?.id) {
    const { error: profileUpdateErr } = await supabase
      .from("profiles")
      .update({ full_name: displayName })
      .eq("id", user.id);

    if (profileUpdateErr) throw profileUpdateErr;
  } else {
    const { error: profileInsertErr } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: String(user.email ?? "").trim() || null,
        full_name: displayName,
      });

    if (profileInsertErr) throw profileInsertErr;
  }

  const existingMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { error: authUpdateErr } = await supabase.auth.updateUser({
    data: {
      ...existingMetadata,
      name: displayName,
      full_name: displayName,
      first_name: displayName.split(/\s+/)[0] ?? displayName,
      phone: phone || null,
      phone_number: phone || null,
    },
  });

  if (authUpdateErr) throw authUpdateErr;

  revalidatePath("/account");
  revalidatePath("/account/edit");
  revalidatePath("/");
  redirect("/account?banner=profile_updated");
}