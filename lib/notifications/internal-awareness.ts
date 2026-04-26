export const CONTRACTOR_UPDATE_NOTIFICATION_TYPES = [
  "contractor_note",
  "contractor_correction_submission",
  "contractor_schedule_updated",
] as const;

export const NEW_JOB_NOTIFICATION_TYPES = [
  "contractor_job_created",
  "contractor_intake_proposal_submitted",
  "internal_contractor_job_intake_email",
  "internal_contractor_intake_proposal_email",
] as const;

export type InternalNotificationFilterKey = "contractor_updates" | "new_job_notifications";

export function normalizeNotificationType(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isContractorUpdateNotificationType(value: unknown) {
  return CONTRACTOR_UPDATE_NOTIFICATION_TYPES.includes(
    normalizeNotificationType(value) as (typeof CONTRACTOR_UPDATE_NOTIFICATION_TYPES)[number],
  );
}

export function isNewJobNotificationType(value: unknown) {
  return NEW_JOB_NOTIFICATION_TYPES.includes(
    normalizeNotificationType(value) as (typeof NEW_JOB_NOTIFICATION_TYPES)[number],
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

  if (filterKey === "new_job_notifications") {
    return isNewJobNotificationType(value);
  }

  return true;
}