import { describe, expect, it } from "vitest";

import {
  ACTIVE_PERMIT_REQUEST_STATUSES,
  PERMIT_POST_PERMIT_ROUTES,
  PERMIT_REQUEST_EVENT_TYPES,
  PERMIT_REQUEST_HOLD_REASONS,
  PERMIT_REQUEST_STATUSES,
  getPermitRequestContractorStatusLabel,
  getPermitRequestInternalStatusLabel,
  isActivePermitRequestStatus,
  isPermitPostPermitRoute,
  isPermitRequestEventType,
  isPermitRequestHoldReason,
  isPermitRequestStatus,
} from "../permit-request-contracts";

describe("permit request domain contract", () => {
  it("defines the canonical permit request lifecycle", () => {
    expect(PERMIT_REQUEST_STATUSES).toEqual([
      "permit_request",
      "accepted_in_process",
      "on_hold_additional_info_needed",
      "permit_created",
    ]);
    expect(ACTIVE_PERMIT_REQUEST_STATUSES).toEqual([
      "permit_request",
      "accepted_in_process",
      "on_hold_additional_info_needed",
    ]);
    expect(PERMIT_REQUEST_HOLD_REASONS).toEqual(["additional_information_needed"]);
    expect(PERMIT_POST_PERMIT_ROUTES).toEqual(["ready_for_testing", "pending_install"]);
    expect(PERMIT_REQUEST_EVENT_TYPES).toEqual([
      "permit_request_received",
      "permit_request_accepted",
      "permit_request_on_hold",
      "permit_request_intake_updated",
      "permit_created",
      "permit_ready_for_testing",
      "permit_pending_install",
    ]);
  });

  it("keeps permit_created out of the active permit queue", () => {
    expect(isPermitRequestStatus("permit_created")).toBe(true);
    expect(isActivePermitRequestStatus("permit_created")).toBe(false);
  });

  it("labels internal and contractor states without service-style waiting reasons", () => {
    expect(getPermitRequestInternalStatusLabel("permit_request")).toBe("Permit Request");
    expect(getPermitRequestInternalStatusLabel("accepted_in_process")).toBe("Accepted / In Process");
    expect(getPermitRequestInternalStatusLabel("on_hold_additional_info_needed")).toBe(
      "On Hold — Additional Information Needed",
    );
    expect(getPermitRequestInternalStatusLabel("permit_created")).toBe("Permit Created");

    expect(getPermitRequestContractorStatusLabel({ status: "permit_request" })).toBe("Submitted");
    expect(getPermitRequestContractorStatusLabel({ status: "accepted_in_process" })).toBe(
      "In Progress",
    );
    expect(getPermitRequestContractorStatusLabel({ status: "on_hold_additional_info_needed" })).toBe(
      "Additional Information Needed",
    );
    expect(
      getPermitRequestContractorStatusLabel({
        status: "permit_created",
        postPermitRoute: "pending_install",
      }),
    ).toBe("Waiting on Install");
    expect(
      getPermitRequestContractorStatusLabel({
        status: "permit_created",
        postPermitRoute: "ready_for_testing",
      }),
    ).toBe("Ready for Testing");
  });

  it("validates only permit-specific statuses, routes, reasons, and event types", () => {
    expect(isPermitRequestStatus("waiting_on_parts")).toBe(false);
    expect(isPermitRequestHoldReason("waiting_on_customer_approval")).toBe(false);
    expect(isPermitPostPermitRoute("ready_for_testing")).toBe(true);
    expect(isPermitRequestEventType("permit_pending_install")).toBe(true);
    expect(isPermitRequestEventType("job_scheduled")).toBe(false);
  });
});
