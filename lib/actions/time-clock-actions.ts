"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  assertTimeClockWriteEnabled,
  runClockIn,
  runClockOut,
  runEndLunch,
  runStartLunch,
} from "@/lib/time-clock/mutations";

function withNotice(notice: string) {
  return `/time-clock?notice=${encodeURIComponent(notice)}`;
}

async function requireClockWriteContext() {
  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const [{ data: accountSettings, error: accountErr }, { data: internalUserRow, error: userErr }] = await Promise.all([
    supabase
      .from("account_settings")
      .select("time_clock_enabled")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .maybeSingle(),
    supabase
      .from("internal_users")
      .select("time_tracking_enabled")
      .eq("user_id", internalUser.user_id)
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .maybeSingle(),
  ]);

  if (accountErr) throw accountErr;
  if (userErr) throw userErr;

  assertTimeClockWriteEnabled({
    accountTimeClockEnabled: Boolean((accountSettings as any)?.time_clock_enabled),
    userTimeTrackingEnabled: Boolean((internalUserRow as any)?.time_tracking_enabled),
  });

  return {
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserId: internalUser.user_id,
  };
}

function redirectWithOutcome(error: unknown, successNotice: string) {
  if (!error) {
    redirect(withNotice(successNotice));
  }

  const message = String((error as any)?.message ?? "").trim();

  if (message === "TIME_CLOCK_ACCOUNT_DISABLED") {
    redirect(withNotice("account_disabled"));
  }

  if (message === "TIME_CLOCK_USER_DISABLED") {
    redirect(withNotice("user_not_tracked"));
  }

  if (message === "TIME_CLOCK_ACTIVE_ENTRY_EXISTS") {
    redirect(withNotice("already_clocked_in"));
  }

  if (message === "TIME_CLOCK_OPEN_ENTRY_REQUIRED" || message === "TIME_CLOCK_LUNCH_ENTRY_REQUIRED") {
    redirect(withNotice("invalid_state"));
  }

  if (message === "TIME_CLOCK_ACTIVE_ENTRY_REQUIRED") {
    redirect(withNotice("no_active_entry"));
  }

  throw error;
}

export async function clockInFromForm(): Promise<void> {
  try {
    const context = await requireClockWriteContext();
    await runClockIn({
      supabase: context.supabase,
      accountOwnerUserId: context.accountOwnerUserId,
      internalUserId: context.internalUserId,
    });

    revalidatePath("/time-clock");
    redirectWithOutcome(null, "clocked_in");
  } catch (error) {
    redirectWithOutcome(error, "clocked_in");
  }
}

export async function startLunchFromForm(): Promise<void> {
  try {
    const context = await requireClockWriteContext();
    await runStartLunch({
      supabase: context.supabase,
      accountOwnerUserId: context.accountOwnerUserId,
      internalUserId: context.internalUserId,
    });

    revalidatePath("/time-clock");
    redirectWithOutcome(null, "lunch_started");
  } catch (error) {
    redirectWithOutcome(error, "lunch_started");
  }
}

export async function endLunchFromForm(): Promise<void> {
  try {
    const context = await requireClockWriteContext();
    await runEndLunch({
      supabase: context.supabase,
      accountOwnerUserId: context.accountOwnerUserId,
      internalUserId: context.internalUserId,
    });

    revalidatePath("/time-clock");
    redirectWithOutcome(null, "lunch_ended");
  } catch (error) {
    redirectWithOutcome(error, "lunch_ended");
  }
}

export async function clockOutFromForm(): Promise<void> {
  try {
    const context = await requireClockWriteContext();
    await runClockOut({
      supabase: context.supabase,
      accountOwnerUserId: context.accountOwnerUserId,
      internalUserId: context.internalUserId,
    });

    revalidatePath("/time-clock");
    redirectWithOutcome(null, "clocked_out");
  } catch (error) {
    redirectWithOutcome(error, "clocked_out");
  }
}
