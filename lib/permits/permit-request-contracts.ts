export const PERMIT_REQUEST_STATUSES = [
  "permit_request",
  "accepted_in_process",
  "on_hold_additional_info_needed",
  "permit_created",
  "not_needed",
] as const;

export type PermitRequestStatus = (typeof PERMIT_REQUEST_STATUSES)[number];

export const ACTIVE_PERMIT_REQUEST_STATUSES = [
  "permit_request",
  "accepted_in_process",
  "on_hold_additional_info_needed",
] as const satisfies readonly PermitRequestStatus[];

export type ActivePermitRequestStatus = (typeof ACTIVE_PERMIT_REQUEST_STATUSES)[number];

export const TERMINAL_PERMIT_REQUEST_STATUSES = [
  "permit_created",
  "not_needed",
] as const satisfies readonly PermitRequestStatus[];

export const PERMIT_REQUEST_HOLD_REASONS = [
  "additional_information_needed",
] as const;

export type PermitRequestHoldReason = (typeof PERMIT_REQUEST_HOLD_REASONS)[number];

export const PERMIT_POST_PERMIT_ROUTES = [
  "ready_for_testing",
  "pending_install",
] as const;

export type PermitPostPermitRoute = (typeof PERMIT_POST_PERMIT_ROUTES)[number];

export const PERMIT_REQUEST_EVENT_TYPES = [
  "permit_request_received",
  "permit_request_accepted",
  "permit_request_on_hold",
  "permit_request_intake_updated",
  "permit_created",
  "permit_ready_for_testing",
  "permit_pending_install",
  "permit_request_not_needed",
] as const;

export type PermitRequestEventType = (typeof PERMIT_REQUEST_EVENT_TYPES)[number];

export const PERMIT_REQUEST_INTERNAL_STATUS_LABELS: Record<PermitRequestStatus, string> = {
  permit_request: "Permit Request",
  accepted_in_process: "Accepted / In Process",
  on_hold_additional_info_needed: "On Hold — Additional Information Needed",
  permit_created: "Permit Created",
  not_needed: "Not Needed",
};

export const PERMIT_REQUEST_CONTRACTOR_STATUS_LABELS: Record<PermitRequestStatus, string> = {
  permit_request: "Submitted",
  accepted_in_process: "In Progress",
  on_hold_additional_info_needed: "Additional Information Needed",
  permit_created: "Permit Created",
  not_needed: "Not Needed",
};

const PERMIT_REQUEST_STATUS_SET = new Set<string>(PERMIT_REQUEST_STATUSES);
const ACTIVE_PERMIT_REQUEST_STATUS_SET = new Set<string>(ACTIVE_PERMIT_REQUEST_STATUSES);
const PERMIT_REQUEST_HOLD_REASON_SET = new Set<string>(PERMIT_REQUEST_HOLD_REASONS);
const PERMIT_POST_PERMIT_ROUTE_SET = new Set<string>(PERMIT_POST_PERMIT_ROUTES);
const PERMIT_REQUEST_EVENT_TYPE_SET = new Set<string>(PERMIT_REQUEST_EVENT_TYPES);

export function isPermitRequestStatus(value: unknown): value is PermitRequestStatus {
  return typeof value === "string" && PERMIT_REQUEST_STATUS_SET.has(value);
}

export function isActivePermitRequestStatus(value: unknown): value is ActivePermitRequestStatus {
  return typeof value === "string" && ACTIVE_PERMIT_REQUEST_STATUS_SET.has(value);
}

export function isPermitRequestHoldReason(value: unknown): value is PermitRequestHoldReason {
  return typeof value === "string" && PERMIT_REQUEST_HOLD_REASON_SET.has(value);
}

export function isPermitPostPermitRoute(value: unknown): value is PermitPostPermitRoute {
  return typeof value === "string" && PERMIT_POST_PERMIT_ROUTE_SET.has(value);
}

export function isPermitRequestEventType(value: unknown): value is PermitRequestEventType {
  return typeof value === "string" && PERMIT_REQUEST_EVENT_TYPE_SET.has(value);
}

export function getPermitRequestInternalStatusLabel(status: PermitRequestStatus): string {
  return PERMIT_REQUEST_INTERNAL_STATUS_LABELS[status];
}

export function getPermitRequestContractorStatusLabel(input: {
  status: PermitRequestStatus;
  postPermitRoute?: PermitPostPermitRoute | null;
}): string {
  if (input.status === "permit_created") {
    if (input.postPermitRoute === "pending_install") {
      return "Waiting on Install";
    }

    if (input.postPermitRoute === "ready_for_testing") {
      return "Ready for Testing";
    }
  }

  return PERMIT_REQUEST_CONTRACTOR_STATUS_LABELS[input.status];
}
