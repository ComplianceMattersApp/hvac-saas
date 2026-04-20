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
};

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
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhoneDigits(value: unknown) {
  return normalizeText(value).replace(/\D/g, "");
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

  const searchDigits = normalizePhoneDigits(q);
  const resultLimit = params.resultLimit ?? 25;

  let customers: CustomerRow[] = [];
  let locations: LocationRow[] = [];

  const { data: customerRows, error: customerErr } = await params.supabase
    .from("customers")
    .select("id, full_name, first_name, last_name, phone, email");

  if (customerErr) throw customerErr;
  customers = (customerRows ?? []) as CustomerRow[];

  const customerIds = customers
    .map((row) => normalizeText(row.id))
    .filter(Boolean);

  if (customerIds.length > 0) {
    const { data: locationRows, error: locationErr } = await params.supabase
      .from("locations")
      .select("id, customer_id, address_line1, city")
      .in("customer_id", customerIds);

    if (locationErr) throw locationErr;
    locations = (locationRows ?? []) as LocationRow[];
  }

  const locationsByCustomerId = new Map<string, LocationRow[]>();
  for (const location of locations) {
    const customerId = normalizeText(location.customer_id);
    if (!customerId) continue;
    const rows = locationsByCustomerId.get(customerId) ?? [];
    rows.push(location);
    locationsByCustomerId.set(customerId, rows);
  }

  const results = customers
    .filter((customer) => {
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
          const addressA = normalizeText(a.address_line1);
          const addressB = normalizeText(b.address_line1);
          return addressA.localeCompare(addressB, undefined, { sensitivity: "base" });
        });
      const sampleLocation = customerLocations[0] ?? null;

      return {
        customer_id: customerId,
        full_name: customerDisplayName(customer),
        phone: normalizeText(customer.phone) || null,
        email: normalizeText(customer.email) || null,
        locations_count: customerLocations.length,
        sample_location_id: normalizeText(sampleLocation?.id) || null,
        sample_address: normalizeText(sampleLocation?.address_line1) || null,
        sample_city: normalizeText(sampleLocation?.city) || null,
      } satisfies ScopedCustomerSearchResult;
    })
    .sort((a, b) => {
      const aName = normalizeText(a.full_name).toLowerCase();
      const bName = normalizeText(b.full_name).toLowerCase();
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    })
    .slice(0, resultLimit);

  return { scope, results };
}