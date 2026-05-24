export const TIME_CLOCK_ACTIVE_STATUSES = ["open", "on_lunch"] as const;

type ActiveStatus = (typeof TIME_CLOCK_ACTIVE_STATUSES)[number];

type SupabaseLike = {
  from(table: string): any;
};

export type TimeClockEntryMutationRow = {
  id: string;
  account_owner_user_id: string;
  internal_user_id: string;
  status: string;
  clock_in_at: string;
  lunch_start_at: string | null;
  lunch_end_at: string | null;
  clock_out_at: string | null;
};

export function assertTimeClockWriteEnabled(params: {
  accountTimeClockEnabled: boolean;
  userTimeTrackingEnabled: boolean;
}) {
  if (!params.accountTimeClockEnabled) {
    throw new Error("TIME_CLOCK_ACCOUNT_DISABLED");
  }

  if (!params.userTimeTrackingEnabled) {
    throw new Error("TIME_CLOCK_USER_DISABLED");
  }
}

function asIsoNow(nowIso?: string | null) {
  const normalized = String(nowIso ?? "").trim();
  return normalized || new Date().toISOString();
}

async function getActiveEntry(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  internalUserId: string;
}): Promise<TimeClockEntryMutationRow | null> {
  const { data, error } = await params.supabase
    .from("internal_user_time_entries")
    .select("id, account_owner_user_id, internal_user_id, status, clock_in_at, lunch_start_at, lunch_end_at, clock_out_at")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("internal_user_id", params.internalUserId)
    .in("status", TIME_CLOCK_ACTIVE_STATUSES)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    id: String(data.id),
    account_owner_user_id: String(data.account_owner_user_id),
    internal_user_id: String(data.internal_user_id),
    status: String(data.status),
    clock_in_at: String(data.clock_in_at),
    lunch_start_at: data.lunch_start_at ? String(data.lunch_start_at) : null,
    lunch_end_at: data.lunch_end_at ? String(data.lunch_end_at) : null,
    clock_out_at: data.clock_out_at ? String(data.clock_out_at) : null,
  };
}

export async function runClockIn(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  internalUserId: string;
  nowIso?: string | null;
}) {
  const active = await getActiveEntry(params);
  if (active) {
    throw new Error("TIME_CLOCK_ACTIVE_ENTRY_EXISTS");
  }

  const nowIso = asIsoNow(params.nowIso);
  const row = {
    account_owner_user_id: params.accountOwnerUserId,
    internal_user_id: params.internalUserId,
    status: "open",
    clock_in_at: nowIso,
  };

  const { error } = await params.supabase
    .from("internal_user_time_entries")
    .insert(row);

  if (error) {
    if (String((error as any)?.code ?? "") === "23505") {
      throw new Error("TIME_CLOCK_ACTIVE_ENTRY_EXISTS");
    }
    throw error;
  }

  return row;
}

export async function runStartLunch(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  internalUserId: string;
  nowIso?: string | null;
}) {
  const active = await getActiveEntry(params);
  if (!active || active.status !== "open") {
    throw new Error("TIME_CLOCK_OPEN_ENTRY_REQUIRED");
  }

  const nowIso = asIsoNow(params.nowIso);

  const { error } = await params.supabase
    .from("internal_user_time_entries")
    .update({
      status: "on_lunch",
      lunch_start_at: nowIso,
      lunch_end_at: null,
    })
    .eq("id", active.id)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("internal_user_id", params.internalUserId)
    .eq("status", "open");

  if (error) throw error;

  return {
    id: active.id,
    status: "on_lunch" as ActiveStatus,
    lunch_start_at: nowIso,
  };
}

export async function runEndLunch(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  internalUserId: string;
  nowIso?: string | null;
}) {
  const active = await getActiveEntry(params);
  if (!active || active.status !== "on_lunch") {
    throw new Error("TIME_CLOCK_LUNCH_ENTRY_REQUIRED");
  }

  const nowIso = asIsoNow(params.nowIso);

  const { error } = await params.supabase
    .from("internal_user_time_entries")
    .update({
      status: "open",
      lunch_end_at: nowIso,
    })
    .eq("id", active.id)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("internal_user_id", params.internalUserId)
    .eq("status", "on_lunch");

  if (error) throw error;

  return {
    id: active.id,
    status: "open" as ActiveStatus,
    lunch_end_at: nowIso,
  };
}

export async function runClockOut(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  internalUserId: string;
  nowIso?: string | null;
}) {
  const active = await getActiveEntry(params);
  if (!active || (active.status !== "open" && active.status !== "on_lunch")) {
    throw new Error("TIME_CLOCK_ACTIVE_ENTRY_REQUIRED");
  }

  const nowIso = asIsoNow(params.nowIso);

  const { error } = await params.supabase
    .from("internal_user_time_entries")
    .update({
      status: "closed",
      clock_out_at: nowIso,
      lunch_end_at:
        active.status === "on_lunch" && !active.lunch_end_at
          ? nowIso
          : active.lunch_end_at,
    })
    .eq("id", active.id)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("internal_user_id", params.internalUserId)
    .in("status", TIME_CLOCK_ACTIVE_STATUSES);

  if (error) throw error;

  return {
    id: active.id,
    status: "closed",
    clock_out_at: nowIso,
    lunch_end_at:
      active.status === "on_lunch" && !active.lunch_end_at
        ? nowIso
        : active.lunch_end_at,
  };
}
