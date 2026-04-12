export const EQUIPMENT_ROLE_LABELS: Record<string, string> = {
  outdoor_unit: "Condenser",
  condenser: "Condenser",
  indoor_unit: "Coil",
  coil: "Coil",
  air_handler: "Air Handler",
  furnace: "Furnace",
  heat_pump: "Heat Pump",
  package_unit: "Pack Unit",
  other: "Other",
};

export const EQUIPMENT_ROLE_OPTIONS = [
  { value: "outdoor_unit", label: "Condenser" },
  { value: "indoor_unit", label: "Coil" },
  { value: "air_handler", label: "Air Handler" },
  { value: "furnace", label: "Furnace" },
  { value: "heat_pump", label: "Heat Pump" },
  { value: "package_unit", label: "Pack Unit" },
  { value: "mini_split_outdoor", label: "Mini-Split Outdoor" },
  { value: "mini_split_head", label: "Mini-Split Indoor Head" },
  { value: "other", label: "Other" },
] as const;

const NO_REFRIGERANT_ROLES = new Set([
  "furnace",
  "furnace_gas",
  "air_handler",
  "air_handler_electric",
]);
const HEATING_ONLY_ROLES = new Set(["furnace", "furnace_gas"]);

export function equipmentUsesRefrigerant(role: string | null | undefined) {
  return !NO_REFRIGERANT_ROLES.has(String(role ?? "").trim().toLowerCase());
}

export function isHeatingOnlyEquipment(role: string | null | undefined) {
  return HEATING_ONLY_ROLES.has(String(role ?? "").trim().toLowerCase());
}

export function equipmentRoleLabel(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (!normalized) return "Equipment";
  return (
    EQUIPMENT_ROLE_LABELS[normalized] ??
    normalized
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
