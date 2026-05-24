"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalRole, requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  assertTimeClockWriteEnabled,
  runClockIn,
  runClockOut,
  runEndLunch,
  runStartLunch,
} from "@/lib/time-clock/mutations";
import { laWallClockToUtcIso } from "@/lib/utils/time";

function withNotice(notice: string) {
  return `/time-clock?notice=${encodeURIComponent(notice)}`;
}

function withAdminNotice(notice: string) {
  return `/ops/admin/time-clock?notice=${encodeURIComponent(notice)}`;
}

function parseOptionalLaDateTimeToUtcIso(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const [datePart, timePartRaw] = value.split("T");
  const timePart = String(timePartRaw ?? "").slice(0, 5);
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^\d{2}:\d{2}$/.test(timePart)) {
    throw new Error("TIME_CLOCK_INVALID_DATETIME");
  }

  const iso = laWallClockToUtcIso(datePart, timePart);
  if (!iso) {
    throw new Error("TIME_CLOCK_INVALID_DATETIME");
  }

  return iso;
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

export async function correctTimeEntryFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser: actorInternalUser } = await requireInternalRole("admin", { supabase });
  const admin = createAdminClient();

  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!entryId) {
    redirect(withAdminNotice("missing_entry"));
  }

  const adjustmentReason = String(formData.get("adjustment_reason") ?? "").trim();
  if (!adjustmentReason) {
    redirect(withAdminNotice("reason_required"));
  }

  const nextStatusRaw = String(formData.get("status") ?? "").trim().toLowerCase();
  const nextStatus = nextStatusRaw === "needs_review" ? "needs_review" : "closed";

  let clockOutAt: string | null = null;
  let lunchEndAt: string | null = null;

  try {
    clockOutAt = parseOptionalLaDateTimeToUtcIso(formData.get("clock_out_at_local"));
    lunchEndAt = parseOptionalLaDateTimeToUtcIso(formData.get("lunch_end_at_local"));
  } catch {
    redirect(withAdminNotice("invalid_datetime"));
  }

  const { data: targetEntry, error: readErr } = await admin
    .from("internal_user_time_entries")
    .select("id, account_owner_user_id")
    .eq("id", entryId)
    .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
    .maybeSingle();

  if (readErr) throw readErr;
  if (!targetEntry?.id) {
    redirect(withAdminNotice("entry_not_found"));
  }

  const nextPayload: Record<string, unknown> = {
    status: nextStatus,
    adjusted_by_user_id: actorInternalUser.user_id,
    adjusted_at: new Date().toISOString(),
    adjustment_reason: adjustmentReason.slice(0, 500),
  };

  if (clockOutAt) {
    nextPayload.clock_out_at = clockOutAt;
  }

  if (lunchEndAt) {
    nextPayload.lunch_end_at = lunchEndAt;
  }

  const { error: updateErr } = await admin
    .from("internal_user_time_entries")
    .update(nextPayload)
    .eq("id", entryId)
    .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
    .select("id")
    .single();

  if (updateErr) throw updateErr;

  revalidatePath("/ops/admin/time-clock");
  revalidatePath("/ops");
  revalidatePath("/time-clock");
  redirect(withAdminNotice("entry_corrected"));
}
