import type { SupabaseClient } from "@supabase/supabase-js";

// ECC-testable equipment lives in job_systems (named groupings) + job_equipment
// (the units the ECC engine reads). These tables carry NO owner/customer/location
// FKs — account scope is derived from job_id — so they copy cleanly across
// accounts. This module snapshots a source job's systems+equipment at send time
// and rebuilds them on the rater's new job at accept time.

export type WorkshareEquipmentSnapshotItem = {
  equipment_role: string;
  system_location: string | null;
  component_type: string | null;
  manufacturer: string | null;
  model: string | null;
  model_number: string | null;
  serial: string | null;
  tonnage: number | null;
  refrigerant_type: string | null;
  notes: string | null;
  heating_capacity_kbtu: number | null;
  heating_output_btu: number | null;
  heating_efficiency_percent: number | null;
};

export type WorkshareEquipmentSnapshotSystem = {
  name: string;
  equipment: WorkshareEquipmentSnapshotItem[];
};

const EQUIPMENT_SELECT =
  "system_id, equipment_role, system_location, component_type, manufacturer, model, model_number, serial, tonnage, refrigerant_type, notes, heating_capacity_kbtu, heating_output_btu, heating_efficiency_percent";

function str(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toItem(row: Record<string, unknown>): WorkshareEquipmentSnapshotItem {
  return {
    equipment_role: String(row.equipment_role ?? "").trim() || "primary_system",
    system_location: str(row.system_location),
    component_type: str(row.component_type),
    manufacturer: str(row.manufacturer),
    model: str(row.model),
    model_number: str(row.model_number),
    serial: str(row.serial),
    tonnage: num(row.tonnage),
    refrigerant_type: str(row.refrigerant_type),
    notes: str(row.notes),
    heating_capacity_kbtu: num(row.heating_capacity_kbtu),
    heating_output_btu: num(row.heating_output_btu),
    heating_efficiency_percent: num(row.heating_efficiency_percent),
  };
}

// Read a source job's ECC systems + equipment and group them for the snapshot.
// Best-effort: returns [] on any error so the send flow is never blocked.
export async function buildWorkshareEquipmentSnapshot(
  admin: SupabaseClient,
  sourceJobId: string,
): Promise<WorkshareEquipmentSnapshotSystem[]> {
  try {
    const jobId = String(sourceJobId ?? "").trim();
    if (!jobId) return [];

    const [{ data: systems }, { data: equipment }] = await Promise.all([
      admin.from("job_systems").select("id, name").eq("job_id", jobId),
      admin.from("job_equipment").select(EQUIPMENT_SELECT).eq("job_id", jobId),
    ]);

    const bySystem = new Map<string, WorkshareEquipmentSnapshotItem[]>();
    for (const row of (equipment ?? []) as Array<Record<string, unknown>>) {
      const systemId = String(row.system_id ?? "").trim();
      if (!systemId) continue;
      if (!bySystem.has(systemId)) bySystem.set(systemId, []);
      bySystem.get(systemId)!.push(toItem(row));
    }

    const result: WorkshareEquipmentSnapshotSystem[] = [];
    for (const system of (systems ?? []) as Array<Record<string, unknown>>) {
      const name = String(system.name ?? "").trim();
      if (!name) continue;
      result.push({ name, equipment: bySystem.get(String(system.id ?? "").trim()) ?? [] });
    }
    return result;
  } catch {
    return [];
  }
}

// Normalize a stored snapshot value (jsonb) back into typed systems.
export function normalizeWorkshareEquipmentSnapshot(value: unknown): WorkshareEquipmentSnapshotSystem[] {
  if (!Array.isArray(value)) return [];
  const systems: WorkshareEquipmentSnapshotSystem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) continue;
    const equipment = Array.isArray(record.equipment)
      ? (record.equipment as Array<Record<string, unknown>>).map(toItem)
      : [];
    systems.push({ name, equipment });
  }
  return systems;
}

export function countWorkshareEquipmentItems(snapshot: WorkshareEquipmentSnapshotSystem[]): number {
  return snapshot.reduce((sum, system) => sum + system.equipment.length, 0);
}

// Rebuild job_systems + job_equipment on the rater's new job from the snapshot.
// Best-effort per system: a bad system is skipped, not fatal to the accept.
export async function recreateJobEquipmentFromSnapshot(
  admin: SupabaseClient,
  newJobId: string,
  snapshot: WorkshareEquipmentSnapshotSystem[],
): Promise<void> {
  const jobId = String(newJobId ?? "").trim();
  if (!jobId || !Array.isArray(snapshot) || snapshot.length === 0) return;

  for (const system of snapshot) {
    try {
      const name = String(system?.name ?? "").trim();
      if (!name) continue;

      const { data: created, error: systemError } = await admin
        .from("job_systems")
        .insert({ job_id: jobId, name })
        .select("id")
        .single();
      if (systemError || !created) continue;

      const newSystemId = String((created as { id: string }).id);
      const rows = (system.equipment ?? []).map((item) => ({
        job_id: jobId,
        system_id: newSystemId,
        equipment_role: String(item.equipment_role ?? "").trim() || "primary_system",
        system_location: item.system_location,
        component_type: item.component_type,
        manufacturer: item.manufacturer,
        model: item.model,
        model_number: item.model_number,
        serial: item.serial,
        tonnage: item.tonnage,
        refrigerant_type: item.refrigerant_type,
        notes: item.notes,
        heating_capacity_kbtu: item.heating_capacity_kbtu,
        heating_output_btu: item.heating_output_btu,
        heating_efficiency_percent: item.heating_efficiency_percent,
      }));

      if (rows.length > 0) {
        await admin.from("job_equipment").insert(rows);
      }
    } catch {
      // skip this system; keep going.
    }
  }
}
