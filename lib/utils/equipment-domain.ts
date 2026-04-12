/**
 * Equipment domain helper — canonical role vocabulary + persistence contract
 *
 * SINGLE SOURCE OF TRUTH for:
 *   1. Mapping raw intake ComponentType values → canonical equipment_role stored values
 *   2. Role-based field filtering/nulling before any DB write
 *
 * Used by every write path (intake create, post-create add, post-create edit).
 * Do NOT duplicate this logic elsewhere.
 *
 * Canonical stored vocabulary:
 *   outdoor_unit | indoor_unit | furnace | air_handler | heat_pump |
 *   package_unit | mini_split_outdoor | mini_split_head | other
 *
 * Furnace roles  → valid: heating_capacity_kbtu, heating_efficiency_percent, heating_output_btu
 *                  nulled: tonnage, refrigerant_type
 * Cooling roles  → valid: tonnage, refrigerant_type
 *                  nulled: heating_capacity_kbtu, heating_efficiency_percent, heating_output_btu
 * Other          → all fields permitted; no role-based filtering
 */

/** Raw component types as submitted by the /jobs/new intake form. */
type IntakeComponentType =
  | "condenser_ac"
  | "heat_pump_outdoor"
  | "furnace_gas"
  | "air_handler_electric"
  | "coil"
  | "package_gas_electric"
  | "package_heat_pump"
  | "mini_split_outdoor"
  | "mini_split_head"
  | "other"
  | string; // allow passthrough for any value already canonical

/**
 * Map a raw intake ComponentType (or any already-canonical value) to the
 * single canonical equipment_role stored in the DB.
 */
export function mapToCanonicalRole(raw: IntakeComponentType): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "condenser_ac") return "outdoor_unit";
  if (v === "coil") return "indoor_unit";
  if (v === "furnace_gas") return "furnace";
  if (v === "air_handler_electric") return "air_handler";
  if (v === "heat_pump_outdoor") return "heat_pump";
  if (v === "package_gas_electric" || v === "package_heat_pump") return "package_unit";
  // Already canonical or unknown — return as-is
  return v;
}

/** Furnace (heating-only) canonical roles. */
const FURNACE_ROLES = new Set(["furnace"]);

/** Cooling/refrigerant canonical roles (includes mini-split, treated as cooling). */
const COOLING_ROLES = new Set([
  "outdoor_unit",
  "indoor_unit",
  "heat_pump",
  "package_unit",
  "air_handler",
  "mini_split_outdoor",
  "mini_split_head",
]);

export type EquipmentPersistenceInput = {
  canonicalRole: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  notes: string | null;
  // raw incoming numeric values — will be filtered by role:
  tonnage: number | null;
  refrigerantType: string | null;
  heatingCapacityKbtu: number | null;
  heatingOutputBtu: number | null;
  heatingEfficiencyPercent: number | null;
};

/**
 * Apply role-based field filtering and return a sanitized persistence payload.
 * This is the ONLY place the furnace/cooling field boundary is enforced.
 */
export function sanitizeEquipmentFields(input: EquipmentPersistenceInput): {
  equipment_role: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  notes: string | null;
  tonnage: number | null;
  refrigerant_type: string | null;
  heating_capacity_kbtu: number | null;
  heating_output_btu: number | null;
  heating_efficiency_percent: number | null;
} {
  const role = String(input.canonicalRole ?? "").trim().toLowerCase();

  const base = {
    equipment_role: role,
    manufacturer: input.manufacturer,
    model: input.model,
    serial: input.serial,
    notes: input.notes,
  };

  if (FURNACE_ROLES.has(role)) {
    return {
      ...base,
      // Furnace fields valid
      heating_capacity_kbtu: input.heatingCapacityKbtu,
      heating_output_btu: input.heatingOutputBtu,
      heating_efficiency_percent: input.heatingEfficiencyPercent,
      // Cooling fields nulled
      tonnage: null,
      refrigerant_type: null,
    };
  }

  if (COOLING_ROLES.has(role)) {
    return {
      ...base,
      // Cooling fields valid
      tonnage: input.tonnage,
      refrigerant_type: input.refrigerantType,
      // Furnace fields nulled
      heating_capacity_kbtu: null,
      heating_output_btu: null,
      heating_efficiency_percent: null,
    };
  }

  // "other" or unknown — permit all fields without filtering
  return {
    ...base,
    tonnage: input.tonnage,
    refrigerant_type: input.refrigerantType,
    heating_capacity_kbtu: input.heatingCapacityKbtu,
    heating_output_btu: input.heatingOutputBtu,
    heating_efficiency_percent: input.heatingEfficiencyPercent,
  };
}
