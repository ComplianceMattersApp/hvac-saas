import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobActionsSource = readFileSync(
  resolve(__dirname, "../job-actions.ts"),
  "utf-8",
);

const eccDataEntryBranchStart = jobActionsSource.indexOf("// ECC: data entry completion should NOT close the job");
const eccDataEntryBranchEnd = jobActionsSource.indexOf("redirect(`/jobs/${id}`);", eccDataEntryBranchStart);
const eccDataEntryBranchSource =
  eccDataEntryBranchStart > -1 && eccDataEntryBranchEnd > eccDataEntryBranchStart
    ? jobActionsSource.slice(eccDataEntryBranchStart, eccDataEntryBranchEnd)
    : "";

describe("completeDataEntryFromForm ECC invoice completion wiring", () => {
  it("marks the invoice projection complete when ECC data entry records an invoice", () => {
    expect(eccDataEntryBranchSource).toContain("invoice_complete: true");
    expect(eccDataEntryBranchSource).toContain('{ field: "invoice_complete", from: !!job?.invoice_complete, to: true }');
  });
});
