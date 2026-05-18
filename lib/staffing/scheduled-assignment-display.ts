import { formatPersonNamePart } from "@/lib/utils/identity-display";

export type ScheduledAssignmentDisplayInput = {
  display_name: string;
  is_primary?: boolean;
};

export type ScheduledAssignmentDisplaySummary = {
  text: string;
  isUnassigned: boolean;
};

export function summarizeScheduledAssignmentDisplay(
  assignments: ScheduledAssignmentDisplayInput[],
): ScheduledAssignmentDisplaySummary {
  const normalized = Array.isArray(assignments)
    ? assignments.filter((row) => String(row?.display_name ?? "").trim().length > 0)
    : [];

  if (!normalized.length) {
    return { text: "No tech assigned", isUnassigned: true };
  }

  const primary =
    normalized.find((row) => row?.is_primary === true) ??
    normalized[0];
  const primaryName = formatPersonNamePart(primary.display_name) || "Assigned tech";
  const overflowCount = Math.max(0, normalized.length - 1);

  if (overflowCount > 0) {
    return { text: `Assigned: ${primaryName} + ${overflowCount}`, isUnassigned: false };
  }

  return { text: `Assigned: ${primaryName}`, isUnassigned: false };
}
