import { describe, expect, it } from "vitest";

import {
  formatWaitingStateReason,
  getActiveWaitingState,
  getInterruptClearActionLabel,
  parseWaitingStateReason,
} from "@/lib/utils/ops-status";

describe("ops waiting-state helpers", () => {
  it("formats waiting-on-part reason with readable prefix", () => {
    expect(formatWaitingStateReason("waiting_on_part", "condenser fan motor")).toBe(
      "Waiting on part: condenser fan motor",
    );
  });

  it("formats waiting-on-approval reason with readable prefix", () => {
    expect(formatWaitingStateReason("waiting_on_customer_approval", "customer reviewing repair")).toBe(
      "Waiting on customer approval: customer reviewing repair",
    );
  });

  it("formats estimate-needed reason with readable prefix", () => {
    expect(formatWaitingStateReason("estimate_needed", "awaiting replacement quote")).toBe(
      "Estimate needed: awaiting replacement quote",
    );
  });

  it("parses active waiting state for pending info", () => {
    expect(
      getActiveWaitingState({
        ops_status: "pending_info",
        pending_info_reason: "Waiting on part: condenser fan motor",
        on_hold_reason: null,
      }),
    ).toMatchObject({
      status: "pending_info",
      blockerType: "waiting_on_part",
      blockerLabel: "Waiting on part",
      blockerReason: "condenser fan motor",
      parsed: true,
    });
  });

  it("does not return waiting state when status is not pending_info/on_hold", () => {
    expect(
      getActiveWaitingState({
        ops_status: "scheduled",
        pending_info_reason: "Waiting on information: access code missing",
        on_hold_reason: null,
      }),
    ).toBeNull();
  });

  it("returns null for unparseable waiting-state reason text", () => {
    expect(parseWaitingStateReason("need callback from customer")).toBeNull();
  });

  it("does not classify plain pending-info custom reasons as waiting", () => {
    expect(
      getActiveWaitingState({
        ops_status: "pending_info",
        pending_info_reason: "Missing permit number",
        on_hold_reason: null,
      }),
    ).toBeNull();
  });

  it("parses legacy unprefixed waiting labels safely", () => {
    expect(parseWaitingStateReason("Waiting on part")).toMatchObject({
      blockerType: "waiting_on_part",
      blockerReason: "Waiting on part",
    });
  });

  it("parses legacy waiting-on-approval prefix safely", () => {
    expect(parseWaitingStateReason("Waiting on approval: customer reviewing repair")).toMatchObject({
      blockerType: "waiting_on_customer_approval",
      blockerReason: "customer reviewing repair",
    });
  });

  it("maps clear-action labels for all interrupt states", () => {
    expect(getInterruptClearActionLabel("pending_info")).toBe("Mark Info Received");
    expect(getInterruptClearActionLabel("on_hold")).toBe("Resume Job");
    expect(getInterruptClearActionLabel("waiting")).toBe("Mark Ready to Continue");
  });
});
