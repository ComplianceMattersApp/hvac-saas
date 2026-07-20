import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  resolve(process.cwd(), "app/estimates/[id]/FinalizeAndSendProposalForm.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  resolve(process.cwd(), "app/estimates/[id]/page.tsx"),
  "utf8",
);

describe("estimate finalize and send UI", () => {
  it("uses one explicit mobile-sized action with confirmation", () => {
    expect(formSource).toContain("Finalize & Send Proposal");
    expect(formSource).toContain("min-h-12");
    expect(formSource).toContain("window.confirm");
    expect(formSource).toContain("Editing will be locked");
  });

  it("preserves truthful sent and partial-failure outcomes after refresh", () => {
    expect(formSource).toContain("proposal_finalized_email_sent");
    expect(formSource).toContain("proposal_finalized_email_retry_needed");
    expect(pageSource).toContain("Proposal finalized and emailed successfully");
    expect(pageSource).toContain("Proposal finalized, but the email was not sent");
    expect(pageSource).toContain("<FinalizeAndSendProposalForm");
  });
});
