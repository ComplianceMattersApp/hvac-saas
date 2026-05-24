type SupabaseLike = {
  from(table: string): any;
};

export const INTERNAL_USER_TIME_ENTRY_SELECT = [
  "id",
  "account_owner_user_id",
  "internal_user_id",
  "status",
  "clock_in_at",
  "lunch_start_at",
  "lunch_end_at",
  "clock_out_at",
  "adjusted_by_user_id",
  "adjusted_at",
  "adjustment_reason",
  "created_at",
  "updated_at",
].join(", ");

export const INTERNAL_USER_TIME_ENTRY_ACTIVE_STATUSES = ["open", "on_lunch"] as const;

export type InternalUserTimeEntryStatus =
  | "open"
  | "on_lunch"
  | "closed"
  | "needs_review"
  | "voided";

export type TimeClockDerivedDisplayState = "clocked_out" | "clocked_in" | "on_lunch";

export type InternalUserTimeEntryRow = {
  id: string;
  account_owner_user_id: string;
  internal_user_id: string;
  status: InternalUserTimeEntryStatus;
  clock_in_at: string;
  lunch_start_at: string | null;
  lunch_end_at: string | null;
  clock_out_at: string | null;
  adjusted_by_user_id: string | null;
  adjusted_at: string | null;
  adjustment_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CurrentInternalUserClockState = {
  accountOwnerUserId: string;
  internalUserId: string;
  displayState: TimeClockDerivedDisplayState;
  activeEntry: InternalUserTimeEntryRow | null;
};

export type TeamClockStatusRow = {
  accountOwnerUserId: string;
  internalUserId: string;
  status: "open" | "on_lunch";
  clockInAt: string;
  lunchStartAt: string | null;
  clockOutAt: string | null;
  entryId: string;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function normalizeStatus(value: unknown): InternalUserTimeEntryStatus | null {
  const normalized = asTrimmed(value).toLowerCase();
  if (
    normalized === "open" ||
    normalized === "on_lunch" ||
    normalized === "closed" ||
    normalized === "needs_review" ||
    normalized === "voided"
  ) {
    return normalized;
  }

  return null;
}

function normalizeRow(row: any): InternalUserTimeEntryRow | null {
  const id = asTrimmed(row?.id);
  const accountOwnerUserId = asTrimmed(row?.account_owner_user_id);
  const internalUserId = asTrimmed(row?.internal_user_id);
  const status = normalizeStatus(row?.status);
  const clockInAt = asTrimmed(row?.clock_in_at);
  const createdAt = asTrimmed(row?.created_at);
  const updatedAt = asTrimmed(row?.updated_at);

  if (!id || !accountOwnerUserId || !internalUserId || !status || !clockInAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    account_owner_user_id: accountOwnerUserId,
    internal_user_id: internalUserId,
    status,
    clock_in_at: clockInAt,
    lunch_start_at: asTrimmed(row?.lunch_start_at) || null,
    lunch_end_at: asTrimmed(row?.lunch_end_at) || null,
    clock_out_at: asTrimmed(row?.clock_out_at) || null,
    adjusted_by_user_id: asTrimmed(row?.adjusted_by_user_id) || null,
    adjusted_at: asTrimmed(row?.adjusted_at) || null,
    adjustment_reason: asTrimmed(row?.adjustment_reason) || null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function isActiveEntry(
  row: InternalUserTimeEntryRow | null,
): row is InternalUserTimeEntryRow & { status: "open" | "on_lunch" } {
  return Boolean(row && (row.status === "open" || row.status === "on_lunch"));
}

function activeDisplayStateFromStatus(status: "open" | "on_lunch"): TimeClockDerivedDisplayState {
  return status === "on_lunch" ? "on_lunch" : "clocked_in";
}

export async function getCurrentInternalUserClockState(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  internalUserId: string | null | undefined;
}): Promise<CurrentInternalUserClockState> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const internalUserId = asTrimmed(params.internalUserId);

  const safeEmpty: CurrentInternalUserClockState = {
    accountOwnerUserId,
    internalUserId,
    displayState: "clocked_out",
    activeEntry: null,
  };

  if (!accountOwnerUserId || !internalUserId) return safeEmpty;

  const { data, error } = await params.supabase
    .from("internal_user_time_entries")
    .select(INTERNAL_USER_TIME_ENTRY_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("internal_user_id", internalUserId)
    .in("status", INTERNAL_USER_TIME_ENTRY_ACTIVE_STATUSES)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const activeEntry = normalizeRow(data);
  if (!activeEntry || (activeEntry.status !== "open" && activeEntry.status !== "on_lunch")) {
    return safeEmpty;
  }

  return {
    accountOwnerUserId,
    internalUserId,
    displayState: activeDisplayStateFromStatus(activeEntry.status),
    activeEntry,
  };
}

export async function listTeamClockStatusPreview(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  limit?: number | null;
}): Promise<TeamClockStatusRow[]> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  const normalizedLimit = Number(params.limit ?? 50);
  const limit = Number.isFinite(normalizedLimit)
    ? Math.min(Math.max(Math.trunc(normalizedLimit), 1), 500)
    : 50;

  const { data, error } = await params.supabase
    .from("internal_user_time_entries")
    .select(INTERNAL_USER_TIME_ENTRY_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .in("status", INTERNAL_USER_TIME_ENTRY_ACTIVE_STATUSES)
    .order("clock_in_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  return rows
    .map(normalizeRow)
    .filter(isActiveEntry)
    .map((row) => ({
      accountOwnerUserId: row.account_owner_user_id,
      internalUserId: row.internal_user_id,
      status: row.status,
      clockInAt: row.clock_in_at,
      lunchStartAt: row.lunch_start_at,
      clockOutAt: row.clock_out_at,
      entryId: row.id,
    }));
}
