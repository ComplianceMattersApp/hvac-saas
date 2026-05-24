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
