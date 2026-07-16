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
