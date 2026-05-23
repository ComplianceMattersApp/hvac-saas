import { describe, expect, it } from "vitest";

import {
  getDraftCustomerDeliveryHelperCopy,
  getFinalizeProposalActionCopy,
} from "@/app/estimates/[id]/status-copy";

describe("estimate finalization copy", () => {
  it("uses finalize proposal wording for single-estimate draft", () => {
    const copy = getFinalizeProposalActionCopy({ isMultiOptionProposal: false });

    expect(copy.label).toBe("Finalize Proposal");
    expect(copy).not.toHaveProperty("confirmMessage");
  });

  it("keeps finalize label unchanged for multi-option mode", () => {
    const copy = getFinalizeProposalActionCopy({ isMultiOptionProposal: true });

    expect(copy.label).toBe("Finalize Proposal");
    expect(copy).not.toHaveProperty("confirmMessage");
  });

  it("draft helper copy states this does not send email and avoids confirmation phrasing", () => {
    const helper = getDraftCustomerDeliveryHelperCopy();

    expect(helper).toContain("does not send an email");
    expect(helper.toLowerCase()).not.toContain("finalize this proposal?");
    expect(helper.toLowerCase()).not.toContain("are you sure");
    expect(helper.toLowerCase()).not.toContain("mark sent manually");
    expect(helper.toLowerCase()).not.toContain("customer received");
  });
});
