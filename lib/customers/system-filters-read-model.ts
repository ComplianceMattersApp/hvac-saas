export type JobSystemFilterRow = {
  id: string;
  system_id: string;
  account_owner_user_id: string;
  label: string | null;
  length: number;
  width: number;
  height: number;
  date_changed: string;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by_user_id: string | null;
};

export type SystemFilterInput = {
  systemId: string;
  accountOwnerUserId: string;
  label?: string | null;
  length: unknown;
  width: unknown;
  height: unknown;
  dateChanged: unknown;
  notes?: string | null;
  userId?: string | null;
};

export type SystemFilterUpdateInput = {
  filterId: string;
  accountOwnerUserId: string;
  label?: string | null;
  length?: unknown;
  width?: unknown;
  height?: unknown;
  dateChanged?: unknown;
  notes?: string | null;
  userId?: string | null;
};

type ParentSystemScope = {
  id: string;
  job_id: string;
  jobs?: {
    id?: string | null;
    account_owner_user_id?: string | null;
    customer_id?: string | null;
    deleted_at?: string | null;
  } | null;
};

const SYSTEM_FILTER_SELECT = [
  "id",
  "system_id",
  "account_owner_user_id",
  "label",
  "length",
  "width",
  "height",
  "date_changed",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
  "archived_by_user_id",
].join(", ");

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullable(value: unknown) {
  const normalized = clean(value);
  return normalized || null;
}

function positiveNumber(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`SYSTEM_FILTER_${fieldName.toUpperCase()}_MUST_BE_POSITIVE`);
  }
  return parsed;
}

function normalizeDateOnly(value: unknown) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("SYSTEM_FILTER_DATE_CHANGED_INVALID");
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error("SYSTEM_FILTER_DATE_CHANGED_INVALID");
  }

  return raw;
}

function mapFilterRow(row: any): JobSystemFilterRow {
  return {
    id: clean(row?.id),
    system_id: clean(row?.system_id),
    account_owner_user_id: clean(row?.account_owner_user_id),
    label: cleanNullable(row?.label),
    length: Number(row?.length),
    width: Number(row?.width),
    height: Number(row?.height),
    date_changed: clean(row?.date_changed),
    notes: cleanNullable(row?.notes),
    created_by_user_id: cleanNullable(row?.created_by_user_id),
    updated_by_user_id: cleanNullable(row?.updated_by_user_id),
    created_at: clean(row?.created_at),
    updated_at: clean(row?.updated_at),
    archived_at: cleanNullable(row?.archived_at),
    archived_by_user_id: cleanNullable(row?.archived_by_user_id),
  };
}

function uniqueCleanIds(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

export function normalizeSystemFilterCreateInput(input: SystemFilterInput) {
  const systemId = clean(input.systemId);
  const accountOwnerUserId = clean(input.accountOwnerUserId);
  if (!systemId) throw new Error("SYSTEM_FILTER_SYSTEM_REQUIRED");
  if (!accountOwnerUserId) throw new Error("SYSTEM_FILTER_ACCOUNT_REQUIRED");

  const userId = cleanNullable(input.userId);

  return {
    system_id: systemId,
    account_owner_user_id: accountOwnerUserId,
    label: cleanNullable(input.label),
    length: positiveNumber(input.length, "length"),
    width: positiveNumber(input.width, "width"),
    height: positiveNumber(input.height, "height"),
    date_changed: normalizeDateOnly(input.dateChanged),
    notes: cleanNullable(input.notes),
    created_by_user_id: userId,
    updated_by_user_id: userId,
  };
}

export function normalizeSystemFilterUpdateInput(input: SystemFilterUpdateInput) {
  const filterId = clean(input.filterId);
  const accountOwnerUserId = clean(input.accountOwnerUserId);
  if (!filterId) throw new Error("SYSTEM_FILTER_ID_REQUIRED");
  if (!accountOwnerUserId) throw new Error("SYSTEM_FILTER_ACCOUNT_REQUIRED");

  const update: Record<string, unknown> = {};
  if ("label" in input) update.label = cleanNullable(input.label);
  if ("length" in input) update.length = positiveNumber(input.length, "length");
  if ("width" in input) update.width = positiveNumber(input.width, "width");
  if ("height" in input) update.height = positiveNumber(input.height, "height");
  if ("dateChanged" in input) update.date_changed = normalizeDateOnly(input.dateChanged);
  if ("notes" in input) update.notes = cleanNullable(input.notes);
  if ("userId" in input) update.updated_by_user_id = cleanNullable(input.userId);

  return {
    filterId,
    accountOwnerUserId,
    update,
  };
}

async function loadScopedParentSystem(params: {
  supabase: any;
  accountOwnerUserId: string;
  systemId: string;
}) {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const systemId = clean(params.systemId);
  if (!accountOwnerUserId || !systemId) return null;

  const { data, error } = await params.supabase
    .from("job_systems")
    .select("id, job_id, jobs(id, account_owner_user_id, customer_id, deleted_at)")
    .eq("id", systemId)
    .maybeSingle();

  if (error) throw error;

  const system = (data ?? null) as ParentSystemScope | null;
  if (!system?.id) return null;

  const job = Array.isArray(system.jobs) ? system.jobs[0] : system.jobs;
  if (clean(job?.account_owner_user_id) !== accountOwnerUserId) return null;
  if (clean(job?.deleted_at)) return null;

  return system;
}

export async function listSystemFiltersBySystemIds(params: {
  supabase: any;
  accountOwnerUserId: string;
  systemIds: string[];
  includeArchived?: boolean;
}) {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const systemIds = uniqueCleanIds(params.systemIds);
  if (!accountOwnerUserId || systemIds.length === 0) return [];

  let query = params.supabase
    .from("job_system_filters")
    .select(SYSTEM_FILTER_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .in("system_id", systemIds)
    .order("date_changed", { ascending: false })
    .order("created_at", { ascending: false });

  if (!params.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapFilterRow);
}

export async function listSystemFiltersForCustomerSystems(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
  includeArchived?: boolean;
}) {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);
  if (!accountOwnerUserId || !customerId) return [];

  const { data: jobs, error: jobsError } = await params.supabase
    .from("jobs")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("customer_id", customerId)
    .is("deleted_at", null);

  if (jobsError) throw jobsError;

  const jobIds = uniqueCleanIds(((jobs ?? []) as any[]).map((job) => job.id));
  if (jobIds.length === 0) return [];

  const { data: systems, error: systemsError } = await params.supabase
    .from("job_systems")
    .select("id")
    .in("job_id", jobIds);

  if (systemsError) throw systemsError;

  const systemIds = uniqueCleanIds(((systems ?? []) as any[]).map((system) => system.id));
  return listSystemFiltersBySystemIds({
    supabase: params.supabase,
    accountOwnerUserId,
    systemIds,
    includeArchived: params.includeArchived,
  });
}

export async function createSystemFilter(params: {
  supabase: any;
  input: SystemFilterInput;
}) {
  const insert = normalizeSystemFilterCreateInput(params.input);
  const scopedSystem = await loadScopedParentSystem({
    supabase: params.supabase,
    accountOwnerUserId: insert.account_owner_user_id,
    systemId: insert.system_id,
  });

  if (!scopedSystem) throw new Error("SYSTEM_FILTER_SYSTEM_SCOPE_DENIED");

  const { data, error } = await params.supabase
    .from("job_system_filters")
    .insert(insert)
    .select(SYSTEM_FILTER_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data ? mapFilterRow(data) : null;
}

export async function updateSystemFilter(params: {
  supabase: any;
  input: SystemFilterUpdateInput;
}) {
  const normalized = normalizeSystemFilterUpdateInput(params.input);
  if (Object.keys(normalized.update).length === 0) {
    throw new Error("SYSTEM_FILTER_UPDATE_EMPTY");
  }

  const { data, error } = await params.supabase
    .from("job_system_filters")
    .update(normalized.update)
    .eq("id", normalized.filterId)
    .eq("account_owner_user_id", normalized.accountOwnerUserId)
    .is("archived_at", null)
    .select(SYSTEM_FILTER_SELECT)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("SYSTEM_FILTER_NOT_FOUND");
  return mapFilterRow(data);
}

export async function archiveSystemFilter(params: {
  supabase: any;
  filterId: string;
  accountOwnerUserId: string;
  userId?: string | null;
  archivedAt?: string | null;
}) {
  const filterId = clean(params.filterId);
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  if (!filterId) throw new Error("SYSTEM_FILTER_ID_REQUIRED");
  if (!accountOwnerUserId) throw new Error("SYSTEM_FILTER_ACCOUNT_REQUIRED");

  const archivedAt = cleanNullable(params.archivedAt) || new Date().toISOString();

  const { data, error } = await params.supabase
    .from("job_system_filters")
    .update({
      archived_at: archivedAt,
      archived_by_user_id: cleanNullable(params.userId),
      updated_by_user_id: cleanNullable(params.userId),
    })
    .eq("id", filterId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .is("archived_at", null)
    .select(SYSTEM_FILTER_SELECT)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("SYSTEM_FILTER_NOT_FOUND");
  return mapFilterRow(data);
}
