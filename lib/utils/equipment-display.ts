export const EQUIPMENT_ROLE_LABELS: Record<string, string> = {
  outdoor_unit: "Condenser",
  condenser: "Condenser",
  indoor_unit: "Coil",
  coil: "Coil",
  air_handler: "Air Handler",
  furnace: "Furnace",
  heat_pump: "Heat Pump",
  package_unit: "Pack Unit",
  gas_pack_unit: "Gas Pack Unit",
  heat_pump_pack_unit: "Heat Pump Pack Unit",
  mini_split_outdoor: "Mini-Split Outdoor",
  mini_split_head: "Mini-Split Indoor Head",
  other: "Other",
};

export const EQUIPMENT_ROLE_OPTIONS = [
  { value: "outdoor_unit", label: "Condenser" },
  { value: "indoor_unit", label: "Coil" },
  { value: "air_handler", label: "Air Handler" },
  { value: "furnace", label: "Furnace" },
  { value: "heat_pump", label: "Heat Pump" },
  { value: "gas_pack_unit", label: "Gas Pack Unit" },
  { value: "heat_pump_pack_unit", label: "Heat Pump Pack Unit" },
  { value: "mini_split_outdoor", label: "Mini-Split Outdoor" },
  { value: "mini_split_head", label: "Mini-Split Indoor Head" },
  { value: "other", label: "Other" },
] as const;

export function equipmentRoleOptionsForValue(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (!normalized || EQUIPMENT_ROLE_OPTIONS.some((option) => option.value === normalized)) {
    return EQUIPMENT_ROLE_OPTIONS;
  }

  return [
    ...EQUIPMENT_ROLE_OPTIONS,
    { value: normalized, label: equipmentRoleLabel(normalized) },
  ] as const;
}

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

export function formatEquipmentNumber(value?: string | number | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw;
  return Number.isInteger(parsed) ? String(parsed) : String(parsed).replace(/\.?0+$/, "");
}

export type EquipmentSpecGridField = { label: string; value: string };

/**
 * Spec-grid fields for a component — VISUAL-ALIGNMENT-SPEC.md §8a wants a
 * label/value grid, not the chip list used on the Overview glance card
 * (equipmentDetailChips in app/customers/[id]/page.tsx, left as-is there).
 */
export function equipmentSpecGridFields(eq: {
  equipmentRole?: string | null;
  componentType?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  tonnage?: string | number | null;
  refrigerantType?: string | null;
  heatingCapacityKbtu?: string | number | null;
  heatingOutputBtu?: string | number | null;
  heatingEfficiencyPercent?: string | number | null;
}): EquipmentSpecGridField[] {
  const rawRole = eq.equipmentRole || eq.componentType;
  const fields: EquipmentSpecGridField[] = [];

  if (eq.manufacturer) fields.push({ label: "Manufacturer", value: eq.manufacturer });
  if (eq.model) fields.push({ label: "Model", value: eq.model });
  if (eq.serial) fields.push({ label: "Serial", value: eq.serial });

  if (rawRole && equipmentUsesRefrigerant(rawRole)) {
    const tonnage = formatEquipmentNumber(eq.tonnage);
    if (tonnage) fields.push({ label: "Tonnage", value: tonnage });
    if (eq.refrigerantType) fields.push({ label: "Refrigerant", value: eq.refrigerantType });
  }

  if (rawRole && isHeatingOnlyEquipment(rawRole)) {
    const heatingCapacity = formatEquipmentNumber(eq.heatingCapacityKbtu);
    const heatingOutput = formatEquipmentNumber(eq.heatingOutputBtu);
    const heatingEfficiency = formatEquipmentNumber(eq.heatingEfficiencyPercent);
    if (heatingCapacity) fields.push({ label: "Heating Input", value: `${heatingCapacity} KBTU/h` });
    if (heatingOutput) fields.push({ label: "Heating Output", value: `${heatingOutput} BTU/h` });
    if (heatingEfficiency) fields.push({ label: "Efficiency / AFUE", value: `${heatingEfficiency}%` });
  }

  return fields;
}
