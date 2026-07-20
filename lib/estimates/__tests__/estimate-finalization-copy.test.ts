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

  it("draft helper copy explains the combined lock, link, and email action", () => {
    const helper = getDraftCustomerDeliveryHelperCopy();

    expect(helper).toContain("Finalize & Send");
    expect(helper).toContain("secure proposal link");
    expect(helper).toContain("emails it to the customer");
    expect(helper.toLowerCase()).not.toContain("customer received");
  });
});
