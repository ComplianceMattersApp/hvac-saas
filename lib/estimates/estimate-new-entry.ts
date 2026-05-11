export type NewEstimatePrefillQuery = {
  customerId: string;
  locationId: string;
  originJobId: string;
  serviceCaseId: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getStringParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  if (typeof value !== "string") return "";
  return value.trim();
}

function safeUuidParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = getStringParam(params, key);
  return value && isUuid(value) ? value : "";
}

export function resolveEstimateNewPrefillQuery(
  params?: Record<string, string | string[] | undefined>
): NewEstimatePrefillQuery {
  const source = params ?? {};
  return {
    customerId: safeUuidParam(source, "customer_id"),
    locationId: safeUuidParam(source, "location_id"),
    originJobId: safeUuidParam(source, "origin_job_id"),
    serviceCaseId: safeUuidParam(source, "service_case_id"),
  };
}

export function resolveEstimateNewInitialSelection(args: {
  requestedCustomerId: string;
  requestedLocationId: string;
  customers: Array<{ id: string }>;
  locations: Array<{ id: string; customer_id: string }>;
}): { initialCustomerId: string; initialLocationId: string } {
  const customerIds = new Set(args.customers.map((customer) => customer.id));
  const locationById = new Map(args.locations.map((location) => [location.id, location] as const));

  let initialCustomerId =
    args.requestedCustomerId && customerIds.has(args.requestedCustomerId)
      ? args.requestedCustomerId
      : "";
  let initialLocationId = "";

  if (args.requestedLocationId) {
    const location = locationById.get(args.requestedLocationId);
    if (location) {
      if (!initialCustomerId) {
        initialCustomerId = customerIds.has(location.customer_id)
          ? location.customer_id
          : "";
      }
      if (initialCustomerId && location.customer_id === initialCustomerId) {
        initialLocationId = location.id;
      }
    }
  }

  return { initialCustomerId, initialLocationId };
}

export function buildEstimateDraftCreatePayload(args: {
  customerId: string;
  locationId: string;
  title: string;
  notes: string | null;
  originJobId?: string;
  serviceCaseId?: string;
}) {
  return {
    customerId: args.customerId,
    locationId: args.locationId,
    title: args.title,
    notes: args.notes,
    originJobId: args.originJobId?.trim() || null,
    serviceCaseId: args.serviceCaseId?.trim() || null,
  };
}
