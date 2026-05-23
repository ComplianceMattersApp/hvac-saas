import { describe, expect, it } from "vitest";

import {
  getDraftCustomerDeliveryHelperCopy,
  getFinalizeProposalActionCopy,
} from "@/app/estimates/[id]/status-copy";

describe("estimate finalization copy", () => {
  it("uses finalize proposal wording for single-estimate draft", () => {
    const copy = getFinalizeProposalActionCopy({ isMultiOptionProposal: false });

    expect(copy.label).toBe("Finalize Proposal");
    expect(copy.confirmMessage).toContain("This action does not send an email.");
    expect(copy.confirmMessage.toLowerCase()).not.toContain("mark sent manually");
    expect(copy.confirmMessage.toLowerCase()).not.toContain("email was sent");
    expect(copy.confirmMessage.toLowerCase()).not.toContain("customer received");
  });

  it("keeps multi-option safeguard language while avoiding delivery implication", () => {
    const copy = getFinalizeProposalActionCopy({ isMultiOptionProposal: true });

    expect(copy.label).toBe("Finalize Proposal");
    expect(copy.confirmMessage).toContain("No option will be selected or approved.");
    expect(copy.confirmMessage).toContain("This action does not send an email.");
  });

  it("draft helper copy states this does not send email", () => {
    const helper = getDraftCustomerDeliveryHelperCopy();

    expect(helper).toContain("does not send an email");
    expect(helper.toLowerCase()).not.toContain("mark sent manually");
    expect(helper.toLowerCase()).not.toContain("customer received");
  });
});
