export type PlatformOwnerCustomerLiteRow = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  billingAddress: string;
  locationCount: number;
  jobCount: number;
  latestJobAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PlatformOwnerCustomerLiteLocation = {
  id: string;
  label: string;
  address: string;
  createdAt: string | null;
};

export type PlatformOwnerCustomerLiteJob = {
  id: string;
  title: string;
  status: string | null;
  opsStatus: string | null;
  jobType: string | null;
  scheduledDate: string | null;
  address: string;
  createdAt: string | null;
};

export type PlatformOwnerCustomerLiteSnapshot = {
  customer: PlatformOwnerCustomerLiteRow;
  locations: PlatformOwnerCustomerLiteLocation[];
  recentJobs: PlatformOwnerCustomerLiteJob[];
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCount(value: unknown) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.trunc(count));
}

function buildDisplayName(row: any) {
  const fullName = normalizeText(row?.full_name);
  if (fullName) return fullName;

  const firstName = normalizeText(row?.first_name);
  const lastName = normalizeText(row?.last_name);
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combined) return combined;

  const email = normalizeText(row?.email);
  if (email) return email;

  const phone = normalizeText(row?.phone);
  if (phone) return phone;

  return "Unnamed customer";
}

function buildBillingAddress(row: any) {
  const line1 = normalizeText(row?.billing_address_line1);
  const line2 = normalizeText(row?.billing_address_line2);
  const city = normalizeText(row?.billing_city);
  const state = normalizeText(row?.billing_state);
  const zip = normalizeText(row?.billing_zip);
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ").trim();
  const parts = [line1, line2, cityStateZip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No billing address visible";
}

function buildLocationAddress(row: any) {
  const line1 = normalizeText(row?.address_line1);
  const line2 = normalizeText(row?.address_line2);
  const city = normalizeText(row?.city);
  const state = normalizeText(row?.state);
  const zip = normalizeText(row?.zip || row?.postal_code);
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ").trim();
  const parts = [line1, line2, cityStateZip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No service address visible";
}

function buildJobAddress(row: any) {
  const address = normalizeText(row?.job_address);
  if (address) return address;
  const city = normalizeText(row?.city);
  return city || "No job address visible";
}

function rowMatchesQuery(row: PlatformOwnerCustomerLiteRow, query: string) {
  const normalized = normalizeText(query).toLowerCase();
  if (!normalized) return true;

  const haystack = [
    row.displayName,
    row.email,
    row.phone,
    row.billingAddress,
    row.id,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  return haystack.includes(normalized);
}

async function countLocations(params: { supabase: any; customerId: string }) {
  const { count, error } = await params.supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", params.customerId);

  if (error) throw error;
  return normalizeCount(count);
}

async function countJobs(params: { supabase: any; customerId: string }) {
  const { count, error } = await params.supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", params.customerId)
    .is("deleted_at", null);

  if (error) throw error;
  return normalizeCount(count);
}

async function latestJobAt(params: { supabase: any; customerId: string }) {
  const { data, error } = await params.supabase
    .from("jobs")
    .select("created_at, scheduled_date")
    .eq("customer_id", params.customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const scheduledDate = normalizeText(data?.scheduled_date);
  if (scheduledDate) return scheduledDate;

  const createdAt = normalizeText(data?.created_at);
  return createdAt || null;
}

async function projectCustomerRow(params: {
  supabase: any;
  row: any;
}): Promise<PlatformOwnerCustomerLiteRow> {
  const id = normalizeText(params.row?.id);
  const [locationCount, jobCount, latestJob] = await Promise.all([
    countLocations({ supabase: params.supabase, customerId: id }),
    countJobs({ supabase: params.supabase, customerId: id }),
    latestJobAt({ supabase: params.supabase, customerId: id }),
  ]);

  return {
    id,
    displayName: buildDisplayName(params.row),
    email: normalizeText(params.row?.email) || null,
    phone: normalizeText(params.row?.phone) || null,
    billingAddress: buildBillingAddress(params.row),
    locationCount,
    jobCount,
    latestJobAt: latestJob,
    createdAt: normalizeText(params.row?.created_at) || null,
    updatedAt: normalizeText(params.row?.updated_at) || null,
  };
}

async function loadCustomerById(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
}) {
  const { data, error } = await params.supabase
    .from("customers")
    .select(
      "id, first_name, last_name, full_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, created_at, updated_at",
    )
    .eq("id", params.customerId)
    .eq("owner_user_id", params.accountOwnerUserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function loadCustomerLocations(params: {
  supabase: any;
  customerId: string;
}) {
  const { data, error } = await params.supabase
    .from("locations")
    .select("id, label, nickname, address_line1, address_line2, city, state, zip, postal_code, created_at")
    .eq("customer_id", params.customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? []).map((row: any): PlatformOwnerCustomerLiteLocation => ({
    id: normalizeText(row?.id),
    label: normalizeText(row?.nickname) || normalizeText(row?.label) || "Service Location",
    address: buildLocationAddress(row),
    createdAt: normalizeText(row?.created_at) || null,
  }));
}

async function loadCustomerRecentJobs(params: {
  supabase: any;
  customerId: string;
}) {
  const { data, error } = await params.supabase
    .from("jobs")
    .select("id, title, status, ops_status, job_type, scheduled_date, job_address, city, created_at")
    .eq("customer_id", params.customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? []).map((row: any): PlatformOwnerCustomerLiteJob => ({
    id: normalizeText(row?.id),
    title: normalizeText(row?.title) || "Untitled job",
    status: normalizeText(row?.status) || null,
    opsStatus: normalizeText(row?.ops_status) || null,
    jobType: normalizeText(row?.job_type) || null,
    scheduledDate: normalizeText(row?.scheduled_date) || null,
    address: buildJobAddress(row),
    createdAt: normalizeText(row?.created_at) || null,
  }));
}

export async function loadPlatformOwnerCustomerLiteRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  query?: string;
  limit?: number;
}) {
  const accountOwnerUserId = normalizeText(params.accountOwnerUserId);
  if (!accountOwnerUserId) return [];

  const limit = Math.min(Math.max(Number(params.limit ?? 250) || 250, 1), 500);

  const { data, error } = await params.supabase
    .from("customers")
    .select(
      "id, first_name, last_name, full_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, created_at, updated_at",
    )
    .eq("owner_user_id", accountOwnerUserId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = await Promise.all(
    (data ?? []).map((row: any) => projectCustomerRow({ supabase: params.supabase, row })),
  );

  return rows.filter((row) => rowMatchesQuery(row, params.query ?? ""));
}

export async function loadPlatformOwnerCustomerLiteSnapshot(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
}): Promise<PlatformOwnerCustomerLiteSnapshot | null> {
  const accountOwnerUserId = normalizeText(params.accountOwnerUserId);
  const customerId = normalizeText(params.customerId);
  if (!accountOwnerUserId || !customerId) return null;

  const customerRow = await loadCustomerById({
    supabase: params.supabase,
    accountOwnerUserId,
    customerId,
  });

  if (!customerRow) return null;

  const [customer, locations, recentJobs] = await Promise.all([
    projectCustomerRow({ supabase: params.supabase, row: customerRow }),
    loadCustomerLocations({ supabase: params.supabase, customerId }),
    loadCustomerRecentJobs({ supabase: params.supabase, customerId }),
  ]);

  return {
    customer,
    locations,
    recentJobs,
  };
}
