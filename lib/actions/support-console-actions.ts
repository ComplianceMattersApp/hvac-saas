"use server";

import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { isSupportConsoleEnabled } from "@/lib/support/support-console-exposure";
import { createClient } from "@/lib/supabase/server";
import {
  endSupportSession,
  getSupportOperatorStatus,
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

function supportConsoleUnavailableRedirect(): string {
  return "/ops/admin/users?notice=support_console_unavailable";
}

function supportUserRequiredRedirect(): string {
  return "/ops/admin/users?notice=support_console_support_user_required";
}

export async function startSupportSessionFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId } = await requireInternalRole("admin", { supabase });

  if (!isSupportConsoleEnabled()) {
    redirect(supportConsoleUnavailableRedirect());
  }

  const accountOwnerUserId = String(formData.get("account_owner_user_id") ?? "").trim();
  const operatorReason = String(formData.get("operator_reason") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("return_to") ?? SUPPORT_CONSOLE_PATH));

  const operator = await getSupportOperatorStatus({ actorUserId: userId });
  if (!operator.supportUserId || !operator.isSupportUserActive) {
    redirect(supportUserRequiredRedirect());
  }

  if (!accountOwnerUserId) {
    redirect(withNotice(returnTo, "invalid_target"));
  }

  if (!operatorReason) {
    redirect(withNotice(returnTo, "reason_required", accountOwnerUserId));
  }

  try {
    await startReadOnlySupportSession({
      actorUserId: userId,
      accountOwnerUserId,
      operatorReason,
    });

    redirect(withNotice(returnTo, "session_started", accountOwnerUserId));
  } catch (error) {
    if (isSupportConsoleError(error)) {
      if (error.code === "SUPPORT_USER_NOT_FOUND" || error.code === "SUPPORT_USER_INACTIVE") {
        redirect(supportUserRequiredRedirect());
      }
      if (error.code === "SUPPORT_REASON_REQUIRED") {
        redirect(withNotice(returnTo, "reason_required", accountOwnerUserId));
      }
      redirect(withNotice(returnTo, "access_denied", accountOwnerUserId));
    }

    throw error;
  }
}

export async function endSupportSessionFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { userId } = await requireInternalRole("admin", { supabase });

  if (!isSupportConsoleEnabled()) {
    redirect(supportConsoleUnavailableRedirect());
  }

  const accountOwnerUserId = String(formData.get("account_owner_user_id") ?? "").trim();
  const supportAccessSessionId = String(formData.get("support_access_session_id") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("return_to") ?? SUPPORT_CONSOLE_PATH));

  const operator = await getSupportOperatorStatus({ actorUserId: userId });
  if (!operator.supportUserId || !operator.isSupportUserActive) {
    redirect(supportUserRequiredRedirect());
  }

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
      if (error.code === "SUPPORT_USER_NOT_FOUND" || error.code === "SUPPORT_USER_INACTIVE") {
        redirect(supportUserRequiredRedirect());
      }
      redirect(withNotice(returnTo, "access_denied", accountOwnerUserId));
    }

    throw error;
  }
}
