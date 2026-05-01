// lib/actions/notes-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";

async function requireOperationalNotesEntitlementAccessOrRedirect(params: {
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

export async function createInternalNote(formData: FormData) {
  const { userId, internalUser } = await requireInternalUser();
  const body = String(formData.get("body") || "").trim();
  if (!body) return;

  const supabase = await createClient();
  
  await requireOperationalNotesEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("internal_notes")
    .insert({ user_id: userId, body });

  if (error) throw new Error(error.message);
  revalidatePath("/notes");
}

export async function togglePinInternalNote(formData: FormData) {
  const { userId, internalUser } = await requireInternalUser();
  const noteId = String(formData.get("note_id") || "").trim();
  const currentPinned = formData.get("is_pinned") === "1";
  if (!noteId) throw new Error("note_id required");

  const supabase = await createClient();

  await requireOperationalNotesEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("internal_notes")
    .update({ is_pinned: !currentPinned })
    .eq("id", noteId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/notes");
}

export async function deleteInternalNote(formData: FormData) {
  const { userId, internalUser } = await requireInternalUser();
  const noteId = String(formData.get("note_id") || "").trim();
  if (!noteId) throw new Error("note_id required");

  const supabase = await createClient();

  await requireOperationalNotesEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const { error } = await supabase
    .from("internal_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/notes");
}
