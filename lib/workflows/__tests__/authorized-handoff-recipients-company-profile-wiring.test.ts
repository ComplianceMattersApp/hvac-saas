import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("authorized ECC raters company profile wiring", () => {
  it("keeps admin-only access guard on company profile", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");
    expect(pageSource).toContain('requireInternalRole("admin"');
  });

  it("renders connected ECC raters setup section with empty and preview states", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Connected ECC Raters");
    expect(pageSource).toContain("For Compliance Matters testing, paste the Rater Link ID provided by Compliance Matters.");
    expect(pageSource).toContain("Other connected rating companies can provide their own Link ID when available.");
    expect(pageSource).toContain("No connected ECC raters are set up yet.");
    expect(pageSource).toContain("Add Compliance Matters or another authorized rater account to enable ECC handoffs.");
    expect(pageSource).toContain("Workflow handoff will show setup required.");
    expect(pageSource).toContain("Workflow handoff will default to this rater.");
    expect(pageSource).toContain("Workflow handoff will ask the user to choose a rater.");
  });

  it("wires active recipients list, default badge, and archive/default actions", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("authorizedEccRecipients.map((recipient)");
    expect(pageSource).toContain("Default");
    expect(pageSource).toContain("action={setAuthorizedEccRaterDefaultFromForm}");
    expect(pageSource).toContain("Set as default");
    expect(pageSource).toContain("action={archiveAuthorizedEccRaterFromForm}");
    expect(pageSource).toContain("Archive");
  });

  it("wires manual tracking form with required and optional fields", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Track manual/external rater");
    expect(pageSource).toContain("Manual/external rater records are tracking only.");
    expect(pageSource).toContain("action={createAuthorizedEccRaterFromForm}");
    expect(pageSource).toContain('name="display_name"');
    expect(pageSource).toContain("required");
    expect(pageSource).toContain('name="external_company_name"');
    expect(pageSource).toContain('name="external_contact_name"');
    expect(pageSource).toContain('name="external_email"');
    expect(pageSource).toContain('name="external_phone"');
    expect(pageSource).toContain('name="notes"');
    expect(pageSource).toContain('name="is_default"');
    expect(pageSource).toContain('name="handoff_kind" value="ecc"');
    expect(pageSource).toContain('name="recipient_type" value="external_manual"');
    expect(pageSource).toContain("Compliance Matters ECC");
    expect(pageSource).toContain("Compliance Matters");
    expect(pageSource).toContain("Rater contact");
    expect(pageSource).not.toContain("Central Valley HERS Rater");
    expect(pageSource).not.toContain("External Rating Co");
    expect(pageSource).not.toContain("Jane Rater");
  });

  it("shows connected account rater option wired to active connections", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Add connected ECC rater");
    expect(pageSource).toContain("listActiveRecipientConnectionsForAccount");
    expect(pageSource).toContain("createConnectedAccountAuthorizedEccRaterFromForm");
    expect(pageSource).toContain("For Compliance Matters, use the Rater Link ID provided by Compliance Matters.");
    expect(pageSource).toContain("No active connected rater accounts yet.");
    expect(pageSource).toContain("Connect ECC rater");
    expect(pageSource).toContain("#account-handoff-connections");
  });

  it("labels the connection request field as rater link id while preserving current backend field", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Rater Link ID");
    expect(pageSource).toContain('name="recipient_account_owner_user_id"');
    expect(pageSource).toContain("current connected account owner lookup until dedicated Rater Link ID validation is available");
  });

  it("labels connected recipient rows clearly", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");
    expect(pageSource).toContain("Connected account");
  });
});
