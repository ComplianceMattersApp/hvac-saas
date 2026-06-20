import { getInternalUser } from "@/lib/auth/internal-user";

export type CustomerVisibilityScope =
  | {
      kind: "internal";
      userId: string;
      accountOwnerUserId: string;
    }
  | {
      kind: "contractor";
      userId: string;
      contractorId: string;
    };

export type ScopedCustomerSearchResult = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locations_count: number;
  sample_location_id: string | null;
  sample_address: string | null;
  sample_city: string | null;
  last_job_date: string | null;
  open_job_count: number;
};

export type CustomerDirectorySort = "az" | "za";

type CustomerRow = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type LocationRow = {
  id?: string;
  customer_id?: string | null;
  address_line1?: string | null;
  city?: string | null;
  created_at?: string | null;
};

type JobRow = {
  customer_id?: string | null;
  location_id?: string | null;
  status?: string | null;
  ops_status?: string | null;
  scheduled_date?: string | null;
  created_at?: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhoneDigits(value: unknown) {
  return normalizeText(value).replace(/\D/g, "");
}

function looksLikePhoneDigitQuery(rawQuery: string) {
  const trimmed = normalizeText(rawQuery);
  const digits = normalizePhoneDigits(trimmed);
  return digits.length >= 2 && digits.length >= Math.max(trimmed.length - 2, 2);
}

function escapeLikePattern(raw: string) {
  return raw.replace(/[%_]/g, "\\$&");
}

function customerDisplayName(customer: CustomerRow) {
  const full = normalizeText(customer.full_name);
  if (full) return full;

  const first = normalizeText(customer.first_name);
  const last = normalizeText(customer.last_name);
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function matchesScopedCustomerSearch(params: {
  customer: CustomerRow;
  locations: LocationRow[];
  searchText: string;
  searchDigits: string;
}) {
  const q = normalizeText(params.searchText).toLowerCase();
  const digits = normalizeText(params.searchDigits);
  if (!q && !digits) return false;

  const displayName = customerDisplayName(params.customer)?.toLowerCase() ?? "";
  const email = normalizeText(params.customer.email).toLowerCase();
  const phoneDigits = normalizePhoneDigits(params.customer.phone);

  if (q && (displayName.includes(q) || email.includes(q))) {
    return true;
  }

  if (digits && phoneDigits.includes(digits)) {
    return true;
  }

  return params.locations.some((location) => {
    const address = normalizeText(location.address_line1).toLowerCase();
    const city = normalizeText(location.city).toLowerCase();
    return (q && (address.includes(q) || city.includes(q))) || false;
  });
}

function normalizeSortDirection(value: unknown): CustomerDirectorySort {
  return String(value ?? "").trim().toLowerCase() === "za" ? "za" : "az";
}

function compareDirectoryRows(
  a: ScopedCustomerSearchResult,
  b: ScopedCustomerSearchResult,
  sortDirection: CustomerDirectorySort,
) {
  const aName = normalizeText(a.full_name).toLowerCase();
  const bName = normalizeText(b.full_name).toLowerCase();
  const nameCompare = aName.localeCompare(bName, undefined, { sensitivity: "base" });
  if (nameCompare !== 0) return sortDirection === "za" ? -nameCompare : nameCompare;
  return a.customer_id.localeCompare(b.customer_id);
}

function isOperationallyActiveJob(job: JobRow) {
  const lifecycleStatus = normalizeText(job.status).toLowerCase();
  if (lifecycleStatus === "cancelled") return false;

  const opsStatus = normalizeText(job.ops_status).toLowerCase();
  return opsStatus !== "closed";
}

function compareJobsLatestFirst(a: JobRow, b: JobRow) {
  const aDate = normalizeText(a.scheduled_date) || normalizeText(a.created_at);
  const bDate = normalizeText(b.scheduled_date) || normalizeText(b.created_at);
  return bDate.localeCompare(aDate);
}

function buildScopedCustomerResults(params: {
  customers: CustomerRow[];
  locations: LocationRow[];
  jobs: JobRow[];
  searchText?: string | null;
  resultLimit: number;
  sortDirection?: CustomerDirectorySort;
}) {
  const q = normalizeText(params.searchText);
  const searchDigits = normalizePhoneDigits(q);

  const locationsByCustomerId = new Map<string, LocationRow[]>();
  for (const location of params.locations) {
    const customerId = normalizeText(location.customer_id);
    if (!customerId) continue;
    const rows = locationsByCustomerId.get(customerId) ?? [];
    rows.push(location);
    locationsByCustomerId.set(customerId, rows);
  }

  const jobsByCustomerId = new Map<string, JobRow[]>();
  for (const job of params.jobs) {
    const customerId = normalizeText(job.customer_id);
    if (!customerId) continue;
    const rows = jobsByCustomerId.get(customerId) ?? [];
    rows.push(job);
    jobsByCustomerId.set(customerId, rows);
  }

  return params.customers
    .filter((customer) => {
      if (!q) return true;
      const customerId = normalizeText(customer.id);
      return matchesScopedCustomerSearch({
        customer,
        locations: locationsByCustomerId.get(customerId) ?? [],
        searchText: q,
        searchDigits,
      });
    })
    .map((customer) => {
      const customerId = normalizeText(customer.id);
      const customerLocations = (locationsByCustomerId.get(customerId) ?? [])
        .slice()
        .sort((a, b) => {
          const createdA = normalizeText(a.created_at);
          const createdB = normalizeText(b.created_at);
          if (createdA || createdB) return createdB.localeCompare(createdA);

          const addressA = normalizeText(a.address_line1);
          const addressB = normalizeText(b.address_line1);
          return addressA.localeCompare(addressB, undefined, { sensitivity: "base" });
        });
      const customerJobs = (jobsByCustomerId.get(customerId) ?? []).slice().sort(compareJobsLatestFirst);
      const latestJob = customerJobs[0] ?? null;
      const latestJobLocationId = normalizeText(latestJob?.location_id);
      const sampleLocation =
        (latestJobLocationId
          ? customerLocations.find((location) => normalizeText(location.id) === latestJobLocationId)
          : null) ??
        customerLocations[0] ??
        null;

      return {
        customer_id: customerId,
        full_name: customerDisplayName(customer),
        phone: normalizeText(customer.phone) || null,
        email: normalizeText(customer.email) || null,
        locations_count: customerLocations.length,
        sample_location_id: normalizeText(sampleLocation?.id) || null,
        sample_address: normalizeText(sampleLocation?.address_line1) || null,
        sample_city: normalizeText(sampleLocation?.city) || null,
        last_job_date: normalizeText(latestJob?.scheduled_date) || normalizeText(latestJob?.created_at) || null,
        open_job_count: customerJobs.filter(isOperationallyActiveJob).length,
      } satisfies ScopedCustomerSearchResult;
    })
    .sort((a, b) => compareDirectoryRows(a, b, normalizeSortDirection(params.sortDirection)))
    .slice(0, params.resultLimit);
}

async function loadDirectoryInputs(params: {
  supabase: any;
  customerIds?: string[] | null;
  accountOwnerUserId?: string | null;
}) {
  let customerQuery = params.supabase
    .from("customers")
    .select("id, full_name, first_name, last_name, phone, email");

  const customerIds = params.customerIds?.map((id) => normalizeText(id)).filter(Boolean) ?? [];
  if (customerIds.length > 0) {
    customerQuery = customerQuery.in("id", customerIds);
  }

  const accountOwnerUserId = normalizeText(params.accountOwnerUserId);
  if (accountOwnerUserId) {
    customerQuery = customerQuery.eq("owner_user_id", accountOwnerUserId);
  }

  const { data: customerRows, error: customerErr } = await customerQuery;
  if (customerErr) throw customerErr;

  const customers = (customerRows ?? []) as CustomerRow[];
  const scopedCustomerIds = customers.map((row) => normalizeText(row.id)).filter(Boolean);
  let locations: LocationRow[] = [];
  let jobs: JobRow[] = [];

  if (scopedCustomerIds.length > 0) {
    const { data: locationRows, error: locationErr } = await params.supabase
      .from("locations")
      .select("id, customer_id, address_line1, city, created_at")
      .in("customer_id", scopedCustomerIds);

    if (locationErr) throw locationErr;
    locations = (locationRows ?? []) as LocationRow[];

    const { data: jobRows, error: jobErr } = await params.supabase
      .from("jobs")
      .select("customer_id, location_id, status, ops_status, scheduled_date, created_at")
      .in("customer_id", scopedCustomerIds);

    if (jobErr) throw jobErr;
    jobs = (jobRows ?? []) as JobRow[];
  }

  return { customers, locations, jobs };
}

export async function resolveCustomerVisibilityScope(params: {
  supabase: any;
  userId: string;
}): Promise<CustomerVisibilityScope | null> {
  const internalUser = await getInternalUser({
    supabase: params.supabase,
    userId: params.userId,
  });

  if (internalUser?.is_active) {
    return {
      kind: "internal",
      userId: params.userId,
      accountOwnerUserId: String(internalUser.account_owner_user_id ?? "").trim(),
    };
  }

  const { data: contractorUser, error } = await params.supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) throw error;

  const contractorId = normalizeText(contractorUser?.contractor_id);
  if (!contractorId) return null;

  return {
    kind: "contractor",
    userId: params.userId,
    contractorId,
  };
}

export async function searchScopedCustomers(params: {
  supabase: any;
  userId: string;
  searchText: string;
  resultLimit?: number;
  sortDirection?: CustomerDirectorySort;
}): Promise<{
  scope: CustomerVisibilityScope;
  results: ScopedCustomerSearchResult[];
}> {
  const scope = await resolveCustomerVisibilityScope({
    supabase: params.supabase,
    userId: params.userId,
  });

  if (!scope) {
    throw new Error("CUSTOMER_VISIBILITY_SCOPE_REQUIRED");
  }

  const q = normalizeText(params.searchText);
  if (!q) {
    return { scope, results: [] };
  }

  const resultLimit = params.resultLimit ?? 25;
  const inputs = await loadDirectoryInputs({ supabase: params.supabase });
  const results = buildScopedCustomerResults({
    ...inputs,
    searchText: q,
    resultLimit,
    sortDirection: params.sortDirection,
  });

  return { scope, results };
}

export async function listScopedCustomerDirectory(params: {
  supabase: any;
  userId: string;
  searchText?: string | null;
  resultLimit?: number;
  sortDirection?: CustomerDirectorySort;
  accountOwnerUserId?: string | null;
}): Promise<{
  scope: CustomerVisibilityScope;
  results: ScopedCustomerSearchResult[];
}> {
  const scope = await resolveCustomerVisibilityScope({
    supabase: params.supabase,
    userId: params.userId,
  });

  if (!scope) {
    throw new Error("CUSTOMER_VISIBILITY_SCOPE_REQUIRED");
  }

  const inputs = await loadDirectoryInputs({
    supabase: params.supabase,
    accountOwnerUserId: scope.kind === "internal" ? params.accountOwnerUserId : null,
  });

  return {
    scope,
    results: buildScopedCustomerResults({
      ...inputs,
      searchText: params.searchText,
      resultLimit: params.resultLimit ?? 100,
      sortDirection: params.sortDirection,
    }),
  };
}

export async function searchScopedCustomerSuggestions(params: {
  supabase: any;
  userId: string;
  searchText: string;
  resultLimit?: number;
}): Promise<{
  scope: CustomerVisibilityScope;
  results: ScopedCustomerSearchResult[];
}> {
  const q = normalizeText(params.searchText);
  const resultLimit = params.resultLimit ?? 6;

  if (!q) {
    const scope = await resolveCustomerVisibilityScope({
      supabase: params.supabase,
      userId: params.userId,
    });

    if (!scope) {
      throw new Error("CUSTOMER_VISIBILITY_SCOPE_REQUIRED");
    }

    return { scope, results: [] };
  }

  // Keep phone-digit matching on the canonical search path to preserve exact behavior.
  if (looksLikePhoneDigitQuery(q)) {
    return searchScopedCustomers({
      supabase: params.supabase,
      userId: params.userId,
      searchText: q,
      resultLimit,
    });
  }

  const scope = await resolveCustomerVisibilityScope({
    supabase: params.supabase,
    userId: params.userId,
  });

  if (!scope) {
    throw new Error("CUSTOMER_VISIBILITY_SCOPE_REQUIRED");
  }

  const escaped = escapeLikePattern(q);
  const like = `%${escaped}%`;
  const candidateLimit = Math.max(resultLimit * 8, 40);

  const { data: directCustomerRows, error: directCustomerErr } = await params.supabase
    .from("customers")
    .select("id")
    .or([
      `full_name.ilike.${like}`,
      `first_name.ilike.${like}`,
      `last_name.ilike.${like}`,
      `email.ilike.${like}`,
      `phone.ilike.${like}`,
    ].join(","))
    .limit(candidateLimit);

  if (directCustomerErr) throw directCustomerErr;

  const { data: locationSeedRows, error: locationSeedErr } = await params.supabase
    .from("locations")
    .select("customer_id")
    .or([`address_line1.ilike.${like}`, `city.ilike.${like}`].join(","))
    .limit(candidateLimit);

  if (locationSeedErr) throw locationSeedErr;

  const candidateIds = new Set<string>();

  for (const row of (directCustomerRows ?? []) as Array<{ id?: string }>) {
    const id = normalizeText(row.id);
    if (id) candidateIds.add(id);
  }

  for (const row of (locationSeedRows ?? []) as Array<{ customer_id?: string | null }>) {
    const id = normalizeText(row.customer_id);
    if (id) candidateIds.add(id);
  }

  const customerIds = Array.from(candidateIds);
  if (customerIds.length === 0) {
    return { scope, results: [] };
  }

  const { data: customerRows, error: customerErr } = await params.supabase
    .from("customers")
    .select("id, full_name, first_name, last_name, phone, email")
    .in("id", customerIds);

  if (customerErr) throw customerErr;

  const customers = (customerRows ?? []) as CustomerRow[];

  const { data: locationRows, error: locationErr } = await params.supabase
    .from("locations")
    .select("id, customer_id, address_line1, city, created_at")
    .in("customer_id", customerIds);

  if (locationErr) throw locationErr;

  const locations = (locationRows ?? []) as LocationRow[];

  const { data: jobRows, error: jobErr } = await params.supabase
    .from("jobs")
    .select("customer_id, location_id, status, ops_status, scheduled_date, created_at")
    .in("customer_id", customerIds);

  if (jobErr) throw jobErr;

  const results = buildScopedCustomerResults({
    customers,
    locations,
    jobs: (jobRows ?? []) as JobRow[],
    searchText: q,
    resultLimit,
    sortDirection: "az",
  });

  return { scope, results };
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCustomerDirectoryCsv(rows: ScopedCustomerSearchResult[]) {
  const headers = [
    "customer_id",
    "customer_name",
    "phone",
    "email",
    "service_address",
    "city",
    "locations_count",
    "last_job_date",
    "open_job_count",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.customer_id,
        row.full_name ?? "",
        row.phone ?? "",
        row.email ?? "",
        row.sample_address ?? "",
        row.sample_city ?? "",
        String(row.locations_count),
        row.last_job_date ?? "",
        String(row.open_job_count),
      ]
        .map((value) => csvEscape(String(value)))
        .join(","),
    );
  }

  return lines.join("\r\n");
}
