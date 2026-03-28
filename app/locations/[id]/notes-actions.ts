"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function updateLocationNotesFromForm(formData: FormData) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not authenticated");

  const locationId = String(formData.get("location_id") ?? "").trim();
  if (!locationId) throw new Error("Missing location_id");

  const notesRaw = String(formData.get("notes") ?? "");
  const notes = notesRaw.trim();

  const { error } = await supabase
    .from("locations")
    .update({ notes: notes ? notes : null })
    .eq("id", locationId);

  if (error) throw error;

  revalidatePath(`/locations/${locationId}`);

  redirect(`/locations/${locationId}`);
}
