import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const directorySource = readFileSync(
  resolve(__dirname, "../../../app/ops/admin/contractors/page.tsx"),
  "utf8",
);
const profileSource = readFileSync(
  resolve(__dirname, "../../../app/contractors/[id]/edit/page.tsx"),
  "utf8",
);

describe("contractor experience milestone 2", () => {
  it("keeps the directory searchable and compact by default", () => {
    expect(directorySource).toContain('name="q"');
    expect(directorySource).toContain('name="lifecycle"');
    expect(directorySource).toContain("Find a contractor");
    expect(directorySource).toContain('<details className="hidden">');
    expect(directorySource).not.toContain('open={!isArchived}');
    expect(directorySource).toContain("Open Contractor Profile");
  });

  it("centers contractor access administration on the profile", () => {
    expect(profileSource).toContain("Manage Contractor Access");
    expect(profileSource).toContain("inviteContractorUserFromForm");
    expect(profileSource).toContain("resendContractorInviteFromForm");
    expect(profileSource).toContain("sendPasswordResetFromForm");
    expect(profileSource).toContain("Linked members");
    expect(profileSource).toContain("Open invitations");
    expect(profileSource).toContain("isAdmin ?");
  });

  it("preserves billing, invoice, and lifecycle context on the profile", () => {
    expect(profileSource).toContain("qbo_customer_name");
    expect(profileSource).toContain("View billed invoices");
    expect(profileSource).toContain("archiveContractorFromForm");
    expect(profileSource).toContain("unarchiveContractorFromForm");
  });
});
