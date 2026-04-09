"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { redirect } from "next/navigation";

export async function updateLocationNotesFromForm(formData: FormData) {
  const supabase = await createClient();

  try {
    await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

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
