/**
 * Location equipment adoption + seeding — the bridge between the two
 * equipment worlds (VISUAL-ALIGNMENT-SPEC.md §8):
 *
 *   job_equipment / job_systems              = per-job immutable snapshots
 *   equipment / customer_location_systems    = canonical, location-owned units
 *
 * §8.1 (locked): "Equipment belongs to the address (location), not the job.
 * A job is provenance, never the owner." These helpers make that true in
 * practice:
 *
 *   adoptJobEquipmentIntoLocationInventory  — after equipment is captured on a
 *     job, upsert the unit into the job's location inventory (install_source
 *     'job', source_job_id = the capturing job) and link the snapshot row via
 *     job_equipment.canonical_equipment_id. Snapshot rows are never rewritten.
 *
 *   seedJobEquipmentFromLocationInventory   — for a NEW job at an address with
 *     units on file, copy the active canonical units into the job's own
 *     snapshot tables so nothing has to be recaptured.
 *
 * Identity matching (matchCanonicalUnit) is serial-first: a serial number is
 * the identity of a physical unit. Without a serial, fall back to
 * role+manufacturer+model among ACTIVE units only — never guess against
 * retired history.
 *
 * All writes go through the admin/service-role client, mirroring
 * customer-actions.ts: account/location scoping is the caller's job (server
 * actions run their scope guards first; scripts are operator-run).
 *
 * canonical_equipment_id is added by migration 20260817190000. Every write
 * that touches it probes for the column first so this module keeps working
 * (unlinked, but functional) against a database where the migration has not
 * been applied yet.
 */

import { mapToCanonicalRole, sanitizeEquipmentFields } from "@/lib/utils/equipment-domain";

// ─── types ───────────────────────────────────────────────────────────────────

export type CanonicalUnit = {
  id: string;
  location_id: string;
  system_id: string | null;
  equipment_type: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  notes: string | null;
  tonnage: number | null;
  refrigerant_type: string | null;
  heating_capacity_kbtu: number | null;
  heating_output_btu: number | null;
  heating_efficiency_percent: number | null;
  status: string;
};

export type JobEquipmentSnapshot = {
  id: string;
  job_id: string;
  system_id: string | null;
  system_location: string | null;
  equipment_role: string | null;
  component_type: string | null;
  manufacturer: string | null;
  model: string | null;
  model_number: string | null;
  serial: string | null;
  notes: string | null;
  tonnage: number | null;
  refrigerant_type: string | null;
  heating_capacity_kbtu: number | null;
  heating_output_btu: number | null;
  heating_efficiency_percent: number | null;
  canonical_equipment_id?: string | null;
};

export type AdoptionResult = {
  status: "adopted" | "skipped";
  reason?: "no_location" | "no_equipment" | "job_not_found";
  linked: number;
  createdUnits: number;
  createdSystems: number;
  propagated: number;
};

export type SeedResult = {
  status: "seeded" | "skipped";
  reason?: "no_location" | "job_already_has_equipment" | "nothing_on_file" | "job_not_found";
  seededUnits: number;
  createdSystems: number;
};

// ─── pure identity matching (exported for tests) ─────────────────────────────

export function normalizeIdentityText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function snapshotCanonicalRole(snapshot: Pick<JobEquipmentSnapshot, "equipment_role" | "component_type">): string {
  return mapToCanonicalRole(
    normalizeIdentityText(snapshot.equipment_role) || normalizeIdentityText(snapshot.component_type) || "other",
  );
}

/** Snapshot `model` with legacy `model_number` fallback. */
export function snapshotModel(snapshot: Pick<JobEquipmentSnapshot, "model" | "model_number">): string | null {
  const model = String(snapshot.model ?? "").trim();
  if (model) return model;
  const modelNumber = String(snapshot.model_number ?? "").trim();
  return modelNumber || null;
}

/**
 * Find the canonical unit a job snapshot documents.
 * Precedence: serial match (any status — a retired unit is still that unit),
 * then role+manufacturer+model among ACTIVE units only.
 */
export function matchCanonicalUnit(
  snapshot: JobEquipmentSnapshot,
  canonicalUnits: CanonicalUnit[],
): { unit: CanonicalUnit; matchedBy: "serial" | "specs" } | null {
  const serial = normalizeIdentityText(snapshot.serial);
  if (serial) {
    const bySerial = canonicalUnits.find((unit) => normalizeIdentityText(unit.serial) === serial);
    if (bySerial) return { unit: bySerial, matchedBy: "serial" };
    return null; // has a serial but nothing matches — it's a distinct unit
  }

  const role = snapshotCanonicalRole(snapshot);
  const manufacturer = normalizeIdentityText(snapshot.manufacturer);
  const model = normalizeIdentityText(snapshotModel(snapshot));
  if (!manufacturer && !model) return null; // too anonymous to match safely

  const bySpecs = canonicalUnits.find(
    (unit) =>
      unit.status === "active" &&
      normalizeIdentityText(unit.equipment_type) === role &&
      normalizeIdentityText(unit.manufacturer) === manufacturer &&
      normalizeIdentityText(unit.model) === model,
  );
  return bySpecs ? { unit: bySpecs, matchedBy: "specs" } : null;
}

// ─── column availability probe ───────────────────────────────────────────────

/**
 * True once migration 20260817190000 (job_equipment.canonical_equipment_id)
 * has been applied. Probed per call site so pre-migration databases degrade to
 * "adopt without linking" instead of erroring.
 */
export async function jobEquipmentCanonicalLinkAvailable(admin: any): Promise<boolean> {
  const { error } = await admin.from("job_equipment").select("canonical_equipment_id").limit(1);
  return !error;
}

// ─── shared loads ────────────────────────────────────────────────────────────

const SNAPSHOT_BASE_COLUMNS = [
  "id",
  "job_id",
  "system_id",
  "system_location",
  "equipment_role",
  "component_type",
  "manufacturer",
  "model",
  "model_number",
  "serial",
  "notes",
  "tonnage",
  "refrigerant_type",
  "heating_capacity_kbtu",
  "heating_output_btu",
  "heating_efficiency_percent",
];

const CANONICAL_COLUMNS = [
  "id",
  "location_id",
  "system_id",
  "equipment_type",
  "manufacturer",
  "model",
  "serial",
  "notes",
  "tonnage",
  "refrigerant_type",
  "heating_capacity_kbtu",
  "heating_output_btu",
  "heating_efficiency_percent",
  "status",
];

async function loadJobLocationScope(admin: any, jobId: string) {
  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select("id, location_id, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job?.id) return { job: null, location: null };
  if (!job.location_id) return { job, location: null };

  const { data: location, error: locErr } = await admin
    .from("locations")
    .select("id, customer_id, owner_user_id")
    .eq("id", job.location_id)
    .maybeSingle();
  if (locErr) throw locErr;
  return { job, location: location ?? null };
}

async function findOrCreateLocationSystem(params: {
  admin: any;
  ownerUserId: string;
  customerId: string;
  locationId: string;
  name: string;
  cache: Map<string, string>;
}): Promise<{ systemId: string; created: boolean }> {
  const key = normalizeIdentityText(params.name);
  const cached = params.cache.get(key);
  if (cached) return { systemId: cached, created: false };

  const { data: existing, error: findErr } = await params.admin
    .from("customer_location_systems")
    .select("id, name")
    .eq("location_id", params.locationId)
    .eq("owner_user_id", params.ownerUserId)
    .is("archived_at", null);
  if (findErr) throw findErr;

  const match = ((existing ?? []) as Array<{ id: string; name: string }>).find(
    (row) => normalizeIdentityText(row.name) === key,
  );
  if (match?.id) {
    params.cache.set(key, match.id);
    return { systemId: match.id, created: false };
  }

  const { data: created, error: createErr } = await params.admin
    .from("customer_location_systems")
    .insert({
      owner_user_id: params.ownerUserId,
      customer_id: params.customerId,
      location_id: params.locationId,
      name: params.name,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;

  params.cache.set(key, created.id);
  return { systemId: created.id, created: true };
}

// ─── adopt: job snapshot → canonical location inventory ──────────────────────

export async function adoptJobEquipmentIntoLocationInventory(params: {
  admin: any;
  jobId: string;
  /**
   * Snapshot ids whose spec edits should propagate onto their already-linked
   * canonical unit (used by updateJobEquipmentFromForm so a correction made on
   * the job reaches the address record). Unlinked rows are always adopted;
   * linked rows outside this list are left untouched.
   */
  propagateSnapshotIds?: string[];
}): Promise<AdoptionResult> {
  const { admin, jobId } = params;
  const result: AdoptionResult = { status: "skipped", linked: 0, createdUnits: 0, createdSystems: 0, propagated: 0 };

  const { job, location } = await loadJobLocationScope(admin, jobId);
  if (!job) return { ...result, reason: "job_not_found" };
  if (!location) return { ...result, reason: "no_location" };

  const linkAvailable = await jobEquipmentCanonicalLinkAvailable(admin);
  const snapshotColumns = linkAvailable
    ? [...SNAPSHOT_BASE_COLUMNS, "canonical_equipment_id"]
    : SNAPSHOT_BASE_COLUMNS;

  const { data: snapshotRows, error: snapErr } = await admin
    .from("job_equipment")
    .select(snapshotColumns.join(", "))
    .eq("job_id", jobId);
  if (snapErr) throw snapErr;

  const snapshots = (snapshotRows ?? []) as JobEquipmentSnapshot[];
  if (!snapshots.length) return { ...result, reason: "no_equipment" };

  const { data: canonicalRows, error: canonErr } = await admin
    .from("equipment")
    .select(CANONICAL_COLUMNS.join(", "))
    .eq("location_id", location.id)
    .eq("owner_user_id", location.owner_user_id);
  if (canonErr) throw canonErr;

  const canonicalUnits = (canonicalRows ?? []) as CanonicalUnit[];
  const propagateIds = new Set((params.propagateSnapshotIds ?? []).map(String));
  const systemCache = new Map<string, string>();

  for (const snapshot of snapshots) {
    const role = snapshotCanonicalRole(snapshot);
    const sanitized = sanitizeEquipmentFields({
      canonicalRole: role,
      manufacturer: snapshot.manufacturer,
      model: snapshotModel(snapshot),
      serial: snapshot.serial,
      notes: snapshot.notes,
      tonnage: snapshot.tonnage,
      refrigerantType: snapshot.refrigerant_type,
      heatingCapacityKbtu: snapshot.heating_capacity_kbtu,
      heatingOutputBtu: snapshot.heating_output_btu,
      heatingEfficiencyPercent: snapshot.heating_efficiency_percent,
    });

    const canonicalSpecPayload = {
      equipment_type: sanitized.equipment_role,
      manufacturer: sanitized.manufacturer,
      model: sanitized.model,
      serial: sanitized.serial,
      notes: sanitized.notes,
      tonnage: sanitized.tonnage,
      refrigerant_type: sanitized.refrigerant_type,
      heating_capacity_kbtu: sanitized.heating_capacity_kbtu,
      heating_output_btu: sanitized.heating_output_btu,
      heating_efficiency_percent: sanitized.heating_efficiency_percent,
    };

    const existingLinkId = String(snapshot.canonical_equipment_id ?? "").trim();
    if (existingLinkId) {
      if (propagateIds.has(String(snapshot.id))) {
        const { error: propErr } = await admin
          .from("equipment")
          .update(canonicalSpecPayload)
          .eq("id", existingLinkId)
          .eq("location_id", location.id)
          .eq("owner_user_id", location.owner_user_id);
        if (propErr) throw propErr;
        result.propagated += 1;
      }
      continue;
    }

    const matched = matchCanonicalUnit(snapshot, canonicalUnits);
    let canonicalId: string;

    if (matched) {
      canonicalId = matched.unit.id;
      if (propagateIds.has(String(snapshot.id))) {
        const { error: propErr } = await admin
          .from("equipment")
          .update(canonicalSpecPayload)
          .eq("id", canonicalId)
          .eq("location_id", location.id)
          .eq("owner_user_id", location.owner_user_id);
        if (propErr) throw propErr;
        result.propagated += 1;
      }
    } else {
      const systemName = String(snapshot.system_location ?? "").trim() || "System 1";
      const { systemId, created: systemCreated } = await findOrCreateLocationSystem({
        admin,
        ownerUserId: location.owner_user_id,
        customerId: location.customer_id,
        locationId: location.id,
        name: systemName,
        cache: systemCache,
      });
      if (systemCreated) result.createdSystems += 1;

      const { data: createdUnit, error: createErr } = await admin
        .from("equipment")
        .insert({
          owner_user_id: location.owner_user_id,
          location_id: location.id,
          system_id: systemId,
          ...canonicalSpecPayload,
          status: "active",
          install_source: "job",
          source_job_id: jobId,
        })
        .select("id")
        .single();
      if (createErr) throw createErr;

      canonicalId = createdUnit.id;
      result.createdUnits += 1;
      canonicalUnits.push({
        id: canonicalId,
        location_id: location.id,
        system_id: systemId,
        status: "active",
        ...canonicalSpecPayload,
      });
    }

    if (linkAvailable) {
      const { error: linkErr } = await admin
        .from("job_equipment")
        .update({ canonical_equipment_id: canonicalId })
        .eq("id", snapshot.id)
        .eq("job_id", jobId);
      if (linkErr) throw linkErr;
      result.linked += 1;
    }
  }

  result.status = "adopted";
  return result;
}

// ─── seed: canonical location inventory → new job snapshot ───────────────────

export async function seedJobEquipmentFromLocationInventory(params: {
  admin: any;
  jobId: string;
}): Promise<SeedResult> {
  const { admin, jobId } = params;
  const result: SeedResult = { status: "skipped", seededUnits: 0, createdSystems: 0 };

  const { job, location } = await loadJobLocationScope(admin, jobId);
  if (!job) return { ...result, reason: "job_not_found" };
  if (!location) return { ...result, reason: "no_location" };

  // Guard: seeding is only for jobs that haven't captured anything yet —
  // never merge on top of an existing snapshot.
  const { count: existingCount, error: countErr } = await admin
    .from("job_equipment")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (countErr) throw countErr;
  if ((existingCount ?? 0) > 0) return { ...result, reason: "job_already_has_equipment" };

  const onFile = await loadLocationEquipmentOnFile({ client: admin, locationId: location.id });
  if (!onFile.length) return { ...result, reason: "nothing_on_file" };

  const linkAvailable = await jobEquipmentCanonicalLinkAvailable(admin);

  // Group by system label so the job gets the same system structure the
  // address has. Units without a canonical system land in "System 1".
  const systemIdByName = new Map<string, string>();
  for (const unit of onFile) {
    const systemName = String(unit.system_name ?? "").trim() || "System 1";
    const key = normalizeIdentityText(systemName);

    let jobSystemId = systemIdByName.get(key);
    if (!jobSystemId) {
      const { data: createdSystem, error: sysErr } = await admin
        .from("job_systems")
        .insert({ job_id: jobId, name: systemName })
        .select("id")
        .single();
      if (sysErr) throw sysErr;
      jobSystemId = String(createdSystem.id);
      systemIdByName.set(key, jobSystemId);
      result.createdSystems += 1;
    }

    const { error: insErr } = await admin.from("job_equipment").insert({
      job_id: jobId,
      system_id: jobSystemId,
      system_location: systemName,
      equipment_role: unit.equipment_type ?? "other",
      manufacturer: unit.manufacturer,
      model: unit.model,
      serial: unit.serial,
      notes: unit.notes,
      tonnage: unit.tonnage,
      refrigerant_type: unit.refrigerant_type,
      heating_capacity_kbtu: unit.heating_capacity_kbtu,
      heating_output_btu: unit.heating_output_btu,
      heating_efficiency_percent: unit.heating_efficiency_percent,
      ...(linkAvailable ? { canonical_equipment_id: unit.id } : {}),
    });
    if (insErr) throw insErr;
    result.seededUnits += 1;
  }

  result.status = "seeded";
  return result;
}

// ─── read: what's on file for an address ─────────────────────────────────────

export type LocationUnitOnFile = CanonicalUnit & { system_name: string | null };

/**
 * Active canonical units at a location with their system labels. Works with
 * either the session client (RLS-scoped) or the admin client.
 */
export async function loadLocationEquipmentOnFile(params: {
  client: any;
  locationId: string;
}): Promise<LocationUnitOnFile[]> {
  const { data, error } = await params.client
    .from("equipment")
    .select(`${CANONICAL_COLUMNS.join(", ")}, customer_location_systems:system_id ( name, archived_at )`)
    .eq("location_id", params.locationId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => {
    const system = row.customer_location_systems ?? null;
    const { customer_location_systems: _drop, ...unit } = row;
    return {
      ...(unit as CanonicalUnit),
      system_name: system && !system.archived_at ? String(system.name ?? "").trim() || null : null,
    };
  });
}
