"use server";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { getQboAvailability } from "@/lib/qbo/qbo-env";
import { buildQboAuthorizationUrl } from "@/lib/qbo/qbo-oauth-client";
import { disconnectQboConnection } from "@/lib/qbo/qbo-connection";
import {
  isMissingQboItemMappingColumnError,
  parseQboItemIdSelection,
} from "@/lib/qbo/qbo-item-mapping";
import { loadQboItemCatalog, resolveQboItemName } from "@/lib/qbo/qbo-item-catalog";

const STATE_COOKIE = "qbo_oauth_state";
const COMPANY_PROFILE_PATH = "/ops/admin/company-profile";

function isRedirectControlFlowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function initiateQboOAuthFromForm(
  _prevState: unknown,
  _formData: FormData,
): Promise<never> {
  let authorizationUrl: string;
  try {
    const supabase = await createClient();
    const { internalUser } = await requireInternalRole("admin", { supabase });

    const availability = getQboAvailability();
    if (!availability.available) {
      redirect(`${COMPANY_PROFILE_PATH}?notice=qbo_not_configured#integrations`);
    }

    const state = randomBytes(32).toString("hex");
    const stateHash = createHash("sha256").update(state).digest("hex");
    const { error: attemptError } = await supabase.rpc("register_qbo_oauth_attempt", {
      p_account_owner_user_id: internalUser.account_owner_user_id,
      p_state_hash: stateHash,
      p_ttl_seconds: 600,
    });
    if (attemptError) {
      throw new Error(`Failed to register QuickBooks authorization: ${attemptError.message}`);
    }
    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });

    authorizationUrl = buildQboAuthorizationUrl(state);
  } catch (error) {
    if (isRedirectControlFlowError(error)) throw error;
    redirect(`${COMPANY_PROFILE_PATH}?notice=qbo_connect_failed#integrations`);
  }

  redirect(authorizationUrl);
}

/**
 * Save the account-level default QuickBooks item.
 *
 * Applies to every invoice line whose pricebook item has no mapping of its own.
 * An empty selection clears both columns, which puts those lines back on the
 * app-owned "EveryStep Services" item.
 */
export async function saveDefaultQboItemFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });
  const accountOwnerUserId = internalUser.account_owner_user_id;

  const qboItemId = parseQboItemIdSelection(formData.get("default_qbo_item"));
  // The display name is resolved from the live catalog, never trusted from the
  // form: it is a cache for the admin UI, and QuickBooks may have renamed the
  // item since the page rendered.
  const qboItemName = qboItemId
    ? resolveQboItemName(await loadQboItemCatalog({ supabase, accountOwnerUserId }), qboItemId)
    : null;

  const { data, error } = await supabase
    .from("qbo_connections")
    .update({ default_qbo_item_id: qboItemId, default_qbo_item_name: qboItemName })
    // Only the live connection carries a default. Without this an update could
    // land on a disconnected row and report success for a mapping nothing reads.
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    const notice = isMissingQboItemMappingColumnError(error)
      ? "qbo_default_item_unavailable"
      : "qbo_default_item_failed";
    redirect(`${COMPANY_PROFILE_PATH}?notice=${notice}#integrations`);
  }
  // No row matched — the connection was disconnected or replaced while the form
  // was open. Never report a save that did not happen.
  if (!data?.id) {
    redirect(`${COMPANY_PROFILE_PATH}?notice=qbo_default_item_not_connected#integrations`);
  }

  revalidatePath(COMPANY_PROFILE_PATH);
  redirect(`${COMPANY_PROFILE_PATH}?notice=qbo_default_item_saved#integrations`);
}

export async function disconnectQboFromForm(
  _prevState: unknown,
  _formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { internalUser } = await requireInternalRole("admin", { supabase });

    await disconnectQboConnection({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    revalidatePath(COMPANY_PROFILE_PATH);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to disconnect QuickBooks Online.",
    };
  }
}
