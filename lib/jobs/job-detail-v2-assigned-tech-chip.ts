import type { ActiveJobAssignmentDisplay } from "@/lib/staffing/human-layer";
import { formatPersonNamePart } from "@/lib/utils/identity-display";

function cleanText(value?: string | null) {
  const text = formatPersonNamePart(value);
  if (!text || text === "—" || text === "â€”" || text === "Ã¢â‚¬â€") return "";
  return text;
}

export function buildV2PulseAssignedTechChip(assignedTeam?: ActiveJobAssignmentDisplay[]) {
  const names = (Array.isArray(assignedTeam) ? assignedTeam : [])
    .map((assignee) => cleanText(assignee.display_name))
    .filter(Boolean);
  const firstName = names[0] ?? "";
  const extraCount = Math.max(0, names.length - 1);

  return {
    label: "Assigned Techs",
    value: firstName || "Awaiting assignment",
    extraCount: extraCount || undefined,
    tooltip: names.length > 1 ? names.join(", ") : undefined,
  };
}
