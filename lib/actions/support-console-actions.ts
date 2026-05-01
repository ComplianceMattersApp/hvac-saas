"use server";

import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  endSupportSession,
  isSupportConsoleError,
  startReadOnlySupportSession,
} from "@/lib/support/support-console";

const SUPPORT_CONSOLE_PATH = "/ops/admin/users/support";

function safeReturnTo(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed.startsWith("/")) return SUPPORT_CONSOLE_PATH;
  if (trimmed.startsWith("//")) return SUPPORT_CONSOLE_PATH;
  return trimmed;
}

function withNotice(path: string, notice: string, accountOwnerUserId?: string): string {
  const url = new URL(`http://local${path}`);
  if (accountOwnerUserId) {
    url.searchParams.set("account_owner_user_id", accountOwnerUserId);
  }
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}

export async function startSupportSessionFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId } = await requireInternalRole("admin", { supabase });

  const accountOwnerUserId = String(formData.get("account_owner_user_id") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("return_to") ?? SUPPORT_CONSOLE_PATH));

  if (!accountOwnerUserId) {
    redirect(withNotice(returnTo, "invalid_target"));
  }

  try {
    await startReadOnlySupportSession({
      actorUserId: userId,
      accountOwnerUserId,
    });

    redirect(withNotice(returnTo, "session_started", accountOwnerUserId));
  } catch (error) {
    if (isSupportConsoleError(error)) {
      redirect(withNotice(returnTo, "access_denied", accountOwnerUserId));
    }

    throw error;
  }
}

export async function endSupportSessionFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId } = await requireInternalRole("admin", { supabase });

  const accountOwnerUserId = String(formData.get("account_owner_user_id") ?? "").trim();
  const supportAccessSessionId = String(formData.get("support_access_session_id") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("return_to") ?? SUPPORT_CONSOLE_PATH));

  if (!accountOwnerUserId || !supportAccessSessionId) {
    redirect(withNotice(returnTo, "invalid_target", accountOwnerUserId));
  }

  try {
    await endSupportSession({
      actorUserId: userId,
      accountOwnerUserId,
      supportAccessSessionId,
    });

    redirect(withNotice(returnTo, "session_ended", accountOwnerUserId));
  } catch (error) {
    if (isSupportConsoleError(error)) {
      redirect(withNotice(returnTo, "access_denied", accountOwnerUserId));
    }

    throw error;
  }
}
