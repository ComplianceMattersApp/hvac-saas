import { equipmentRoleLabel } from "@/lib/utils/equipment-display";

function present(value: unknown) {
  return String(value ?? "").trim();
}

function numericWithSeparators(value: unknown) {
  const raw = present(value);
  if (!raw) return "";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw;
  return parsed.toLocaleString();
}

export function buildEquipmentSummaryLine(eq: any) {
  const rawType = present(eq?.equipment_role || eq?.component_type);
  const equipmentType = rawType ? equipmentRoleLabel(rawType) : "-";

  const details: string[] = [
    `Manufacturer: ${present(eq?.manufacturer) || "-"}`,
    `Model: ${present(eq?.model) || "-"}`,
    `Serial: ${present(eq?.serial) || "-"}`,
  ];

  const tonnage = present(eq?.tonnage);
  if (tonnage) details.push(`Tonnage: ${tonnage}`);

  const heatingCapacityKbtu = present(eq?.heating_capacity_kbtu);
  if (heatingCapacityKbtu) details.push(`Heating Input: ${heatingCapacityKbtu} KBTU/h`);

  const heatingOutputBtu = present(eq?.heating_output_btu);
  if (heatingOutputBtu) details.push(`Heating Output: ${numericWithSeparators(heatingOutputBtu)} BTU/h`);

  const heatingEfficiencyPercent = present(eq?.heating_efficiency_percent);
  if (heatingEfficiencyPercent) details.push(`Efficiency / AFUE: ${heatingEfficiencyPercent}%`);

  const refrigerantType = present(eq?.refrigerant_type);
  if (refrigerantType) details.push(`Refrigerant: ${refrigerantType}`);

  return `${equipmentType} | ${details.join(" | ")}`;
}
