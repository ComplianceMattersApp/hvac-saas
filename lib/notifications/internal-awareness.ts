export const CONTRACTOR_UPDATE_NOTIFICATION_TYPES = [
  "contractor_note",
  "contractor_correction_submission",
  "contractor_schedule_updated",
] as const;

export type InternalNotificationFilterKey = "contractor_updates";

export function normalizeNotificationType(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isContractorUpdateNotificationType(value: unknown) {
  return CONTRACTOR_UPDATE_NOTIFICATION_TYPES.includes(
    normalizeNotificationType(value) as (typeof CONTRACTOR_UPDATE_NOTIFICATION_TYPES)[number],
  );
}

export function matchesInternalNotificationFilter(
  value: unknown,
  filterKey?: InternalNotificationFilterKey | null,
) {
  if (!filterKey) return true;

  if (filterKey === "contractor_updates") {
    return isContractorUpdateNotificationType(value);
  }

  return true;
}