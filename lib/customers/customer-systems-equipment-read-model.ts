import {
  listSystemFiltersBySystemIds,
  type JobSystemFilterRow,
} from "@/lib/customers/system-filters-read-model";

export type CustomerEquipmentSummaryRow = {
  id: string;
  jobId: string | null;
  sourceType: "job" | "profile";
  equipmentRole: string | null;
  componentType: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  tonnage: string | null;
  refrigerantType: string | null;
  heatingCapacityKbtu: string | null;
  heatingOutputBtu: string | null;
  heatingEfficiencyPercent: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  sourceJob: CustomerEquipmentSourceJob | null;
};

export type CustomerEquipmentSourceJob = {
  id: string;
  title: string | null;
  jobDisplayNumber: string | number | null;
  scheduledDate: string | null;
  createdAt: string | null;
  jobType: string | null;
};

export type CustomerSystemSummary = {
  id: string;
  name: string;
  sourceJob: CustomerEquipmentSourceJob | null;
  filters: CustomerSystemFilterSummary[];
  equipment: CustomerEquipmentSummaryRow[];
};

export type CustomerSystemFilterSummary = {
  id: string;
  label: string | null;
  length: number;
  width: number;
  height: number;
  dateChanged: string;
  notes: string | null;
};

export type CustomerEquipmentLocationSummary = {
  id: string;
  label: string;
  address: string | null;
  systems: CustomerSystemSummary[];
};

export type CustomerSystemsEquipmentSummary = {
  locations: CustomerEquipmentLocationSummary[];
  totalSystemCount: number;
  totalEquipmentCount: number;
};

type LocationRow = {
  id?: string | null;
  nickname?: string | null;
  label?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postal_code?: string | null;
};

type JobRow = {
  id?: string | null;
  job_display_number?: string | number | null;
  title?: string | null;
  job_type?: string | null;
  location_id?: string | null;
  job_address?: string | null;
  city?: string | null;
  scheduled_date?: string | null;
  created_at?: string | null;
};

type SystemRow = {
  id?: string | null;
  job_id?: string | null;
  name?: string | null;
};

type EquipmentRow = {
  id?: string | null;
  job_id?: string | null;
  system_id?: string | null;
  equipment_role?: string | null;
  component_type?: string | null;
  system_location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  model_number?: string | null;
  serial?: string | null;
  tonnage?: string | number | null;
  refrigerant_type?: string | null;
  heating_capacity_kbtu?: string | number | null;
  heating_output_btu?: string | number | null;
  heating_efficiency_percent?: string | number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProfileSystemRow = {
  id?: string | null;
  owner_user_id?: string | null;
  customer_id?: string | null;
  location_id?: string | null;
  name?: string | null;
  system_type?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
};

type ProfileEquipmentRow = {
  id?: string | null;
  location_id?: string | null;
  system_id?: string | null;
  equipment_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullable(value: unknown) {
  const normalized = clean(value);
  return normalized || null;
}

function locationLabel(location: LocationRow | null | undefined, fallbackAddress: string | null) {
  const nickname = clean(location?.nickname);
  if (nickname) return nickname;
  const label = clean(location?.label);
  if (label) return label;
  return fallbackAddress || "Unassigned service location";
}

function locationAddress(location: LocationRow | null | undefined) {
  const line1 = clean(location?.address_line1);
  const line2 = clean(location?.address_line2);
  const city = clean(location?.city);
  const state = clean(location?.state);
  const zip = clean(location?.zip ?? location?.postal_code);
  const cityStateZip = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
  return [[line1, line2].filter(Boolean).join(", "), cityStateZip].filter(Boolean).join(" | ") || null;
}

function jobAddress(job: JobRow) {
  return [job.job_address, job.city].map(clean).filter(Boolean).join(", ") || null;
}

function sourceJob(job: JobRow): CustomerEquipmentSourceJob {
  return {
    id: clean(job.id),
    title: cleanNullable(job.title),
    jobDisplayNumber: job.job_display_number ?? null,
    scheduledDate: cleanNullable(job.scheduled_date),
    createdAt: cleanNullable(job.created_at),
    jobType: cleanNullable(job.job_type),
  };
}

function compareLatestEquipment(a: CustomerEquipmentSummaryRow, b: CustomerEquipmentSummaryRow) {
  const aDate = a.updatedAt || a.createdAt || a.sourceJob?.scheduledDate || a.sourceJob?.createdAt || "";
  const bDate = b.updatedAt || b.createdAt || b.sourceJob?.scheduledDate || b.sourceJob?.createdAt || "";
  return bDate.localeCompare(aDate);
}

function compareSystems(a: CustomerSystemSummary, b: CustomerSystemSummary) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function compareFilters(a: CustomerSystemFilterSummary, b: CustomerSystemFilterSummary) {
  return b.dateChanged.localeCompare(a.dateChanged) || a.id.localeCompare(b.id);
}

function mapSystemFilter(filter: JobSystemFilterRow): CustomerSystemFilterSummary {
  return {
    id: filter.id,
    label: filter.label,
    length: filter.length,
    width: filter.width,
    height: filter.height,
    dateChanged: filter.date_changed,
    notes: filter.notes,
  };
}

export async function loadCustomerSystemsEquipmentSummary(params: {
  supabase: any;
  accountOwnerUserId: string;
  customerId: string;
  jobLimit?: number;
  equipmentLimit?: number;
}): Promise<CustomerSystemsEquipmentSummary> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);

  const empty: CustomerSystemsEquipmentSummary = {
    locations: [],
    totalSystemCount: 0,
    totalEquipmentCount: 0,
  };

  if (!accountOwnerUserId || !customerId) return empty;

  const { data: scopedCustomer, error: customerErr } = await params.supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (customerErr) throw customerErr;
  if (!scopedCustomer?.id) return empty;

  const { data: locationRows, error: locationErr } = await params.supabase
    .from("locations")
    .select("id, nickname, label, address_line1, address_line2, city, state, zip, postal_code")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (locationErr) throw locationErr;

  const { data: jobRows, error: jobErr } = await params.supabase
    .from("jobs")
    .select("id, job_display_number, title, job_type, location_id, job_address, city, scheduled_date, created_at")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(params.jobLimit ?? 200);

  if (jobErr) throw jobErr;

  const jobs = ((jobRows ?? []) as JobRow[]).filter((job) => clean(job.id));

  const jobIds = jobs.map((job) => clean(job.id)).filter(Boolean);

  let systemRows: SystemRow[] = [];
  let equipmentRows: EquipmentRow[] = [];

  if (jobIds.length > 0) {
    const { data: jobSystemRows, error: systemErr } = await params.supabase
      .from("job_systems")
      .select("id, job_id, name")
      .in("job_id", jobIds)
      .order("name", { ascending: true });

    if (systemErr) throw systemErr;
    systemRows = (jobSystemRows ?? []) as SystemRow[];

    const { data: jobEquipmentRows, error: equipmentErr } = await params.supabase
      .from("job_equipment")
      .select(
        [
          "id",
          "job_id",
          "system_id",
          "equipment_role",
          "component_type",
          "system_location",
          "manufacturer",
          "model",
          "model_number",
          "serial",
          "tonnage",
          "refrigerant_type",
          "heating_capacity_kbtu",
          "heating_output_btu",
          "heating_efficiency_percent",
          "created_at",
          "updated_at",
        ].join(", "),
      )
      .in("job_id", jobIds)
      .order("updated_at", { ascending: false })
      .limit(params.equipmentLimit ?? 500);

    if (equipmentErr) throw equipmentErr;
    equipmentRows = (jobEquipmentRows ?? []) as EquipmentRow[];
  }

  const locationIds = ((locationRows ?? []) as LocationRow[]).map((location) => clean(location.id)).filter(Boolean);
  let profileSystemRows: ProfileSystemRow[] = [];
  let profileEquipmentRows: ProfileEquipmentRow[] = [];

  if (locationIds.length > 0) {
    const { data: profileSystemsData, error: profileSystemsErr } = await params.supabase
      .from("customer_location_systems")
      .select("id, owner_user_id, customer_id, location_id, name, system_type, notes, created_at, updated_at, archived_at")
      .eq("owner_user_id", accountOwnerUserId)
      .eq("customer_id", customerId)
      .in("location_id", locationIds)
      .is("archived_at", null)
      .order("name", { ascending: true });

    if (profileSystemsErr) throw profileSystemsErr;
    profileSystemRows = (profileSystemsData ?? []) as ProfileSystemRow[];

    const profileSystemIds = profileSystemRows.map((system) => clean(system.id)).filter(Boolean);
    if (profileSystemIds.length > 0) {
      const { data: profileEquipmentData, error: profileEquipmentErr } = await params.supabase
        .from("equipment")
        .select("id, location_id, system_id, equipment_type, manufacturer, model, serial, notes, created_at, updated_at")
        .eq("owner_user_id", accountOwnerUserId)
        .in("system_id", profileSystemIds)
        .order("updated_at", { ascending: false });

      if (profileEquipmentErr) throw profileEquipmentErr;
      profileEquipmentRows = (profileEquipmentData ?? []) as ProfileEquipmentRow[];
    }
  }

  const locationsById = new Map<string, LocationRow>();
  for (const location of (locationRows ?? []) as LocationRow[]) {
    const id = clean(location.id);
    if (id) locationsById.set(id, location);
  }

  const jobsById = new Map<string, JobRow>();
  for (const job of jobs) {
    jobsById.set(clean(job.id), job);
  }

  const systemsById = new Map<string, SystemRow>();
  for (const system of systemRows) {
    const id = clean(system.id);
    if (id) systemsById.set(id, system);
  }

  const filterRows = await listSystemFiltersBySystemIds({
    supabase: params.supabase,
    accountOwnerUserId,
    systemIds: Array.from(systemsById.keys()),
  });

  const locationMap = new Map<string, CustomerEquipmentLocationSummary>();
  const systemMap = new Map<string, CustomerSystemSummary>();

  function ensureLocation(job: JobRow) {
    const locationId = clean(job.location_id);
    const location = locationId ? locationsById.get(locationId) : null;
    const fallbackAddress = location ? locationAddress(location) : jobAddress(job);
    const key = locationId || `job:${clean(job.id)}`;
    let summary = locationMap.get(key);
    if (!summary) {
      summary = {
        id: key,
        label: locationLabel(location, fallbackAddress),
        address: fallbackAddress,
        systems: [],
      };
      locationMap.set(key, summary);
    }
    return summary;
  }

  function ensureSystem(args: {
    job: JobRow;
    systemId: string;
    systemName: string | null;
  }) {
    const location = ensureLocation(args.job);
    const key = args.systemId || `job:${clean(args.job.id)}:${args.systemName || "system"}`;
    let system = systemMap.get(key);
    if (!system) {
      system = {
        id: key,
        name: args.systemName || "System",
        sourceJob: sourceJob(args.job),
        filters: [],
        equipment: [],
      };
      systemMap.set(key, system);
      location.systems.push(system);
    }
    return system;
  }

  function ensureProfileLocation(locationId: string) {
    const location = locationsById.get(locationId) ?? null;
    const fallbackAddress = locationAddress(location);
    let summary = locationMap.get(locationId);
    if (!summary) {
      summary = {
        id: locationId,
        label: locationLabel(location, fallbackAddress),
        address: fallbackAddress,
        systems: [],
      };
      locationMap.set(locationId, summary);
    }
    return summary;
  }

  function ensureProfileSystem(profileSystem: ProfileSystemRow) {
    const systemId = clean(profileSystem.id);
    const locationId = clean(profileSystem.location_id);
    if (!systemId || !locationId) return null;
    const location = ensureProfileLocation(locationId);
    const key = `profile:${systemId}`;
    let system = systemMap.get(key);
    if (!system) {
      system = {
        id: key,
        name: cleanNullable(profileSystem.name) || "System",
        sourceJob: null,
        filters: [],
        equipment: [],
      };
      systemMap.set(key, system);
      location.systems.push(system);
    }
    return system;
  }

  for (const system of systemRows) {
    const job = jobsById.get(clean(system.job_id));
    if (!job) continue;
    ensureSystem({
      job,
      systemId: clean(system.id),
      systemName: cleanNullable(system.name),
    });
  }

  for (const profileSystem of profileSystemRows) {
    ensureProfileSystem(profileSystem);
  }

  let totalEquipmentCount = 0;
  for (const equipment of equipmentRows) {
    const equipmentId = clean(equipment.id);
    const job = jobsById.get(clean(equipment.job_id));
    if (!equipmentId || !job) continue;

    const system = systemsById.get(clean(equipment.system_id));
    const summary = ensureSystem({
      job,
      systemId: clean(equipment.system_id),
      systemName: cleanNullable(system?.name) || cleanNullable(equipment.system_location),
    });

    summary.equipment.push({
      id: equipmentId,
      jobId: clean(job.id),
      sourceType: "job",
      equipmentRole: cleanNullable(equipment.equipment_role),
      componentType: cleanNullable(equipment.component_type),
      manufacturer: cleanNullable(equipment.manufacturer),
      model: cleanNullable(equipment.model) || cleanNullable(equipment.model_number),
      serial: cleanNullable(equipment.serial),
      tonnage: cleanNullable(equipment.tonnage),
      refrigerantType: cleanNullable(equipment.refrigerant_type),
      heatingCapacityKbtu: cleanNullable(equipment.heating_capacity_kbtu),
      heatingOutputBtu: cleanNullable(equipment.heating_output_btu),
      heatingEfficiencyPercent: cleanNullable(equipment.heating_efficiency_percent),
      updatedAt: cleanNullable(equipment.updated_at),
      createdAt: cleanNullable(equipment.created_at),
      sourceJob: sourceJob(job),
    });
    totalEquipmentCount += 1;
  }

  const profileSystemsById = new Map<string, ProfileSystemRow>();
  for (const system of profileSystemRows) {
    const id = clean(system.id);
    if (id) profileSystemsById.set(id, system);
  }

  for (const equipment of profileEquipmentRows) {
    const equipmentId = clean(equipment.id);
    const profileSystem = profileSystemsById.get(clean(equipment.system_id));
    const system = profileSystem ? ensureProfileSystem(profileSystem) : null;
    if (!equipmentId || !system) continue;

    system.equipment.push({
      id: equipmentId,
      jobId: null,
      sourceType: "profile",
      equipmentRole: cleanNullable(equipment.equipment_type),
      componentType: cleanNullable(equipment.equipment_type),
      manufacturer: cleanNullable(equipment.manufacturer),
      model: cleanNullable(equipment.model),
      serial: cleanNullable(equipment.serial),
      tonnage: null,
      refrigerantType: null,
      heatingCapacityKbtu: null,
      heatingOutputBtu: null,
      heatingEfficiencyPercent: null,
      updatedAt: cleanNullable(equipment.updated_at),
      createdAt: cleanNullable(equipment.created_at),
      sourceJob: null,
    });
    totalEquipmentCount += 1;
  }

  for (const filter of filterRows) {
    const system = systemMap.get(filter.system_id);
    if (!system) continue;
    system.filters.push(mapSystemFilter(filter));
  }

  const locations = Array.from(locationMap.values())
    .map((location) => ({
      ...location,
      systems: location.systems
        .filter((system) => system.equipment.length > 0 || system.sourceJob || system.id.startsWith("profile:"))
        .map((system) => ({
          ...system,
          filters: system.filters.slice().sort(compareFilters),
          equipment: system.equipment.slice().sort(compareLatestEquipment),
        }))
        .sort(compareSystems),
    }))
    .filter((location) => location.systems.length > 0);

  return {
    locations,
    totalSystemCount: locations.reduce((count, location) => count + location.systems.length, 0),
    totalEquipmentCount,
  };
}
