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

  it("renders authorized ECC raters setup section with empty and preview states", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Authorized ECC Raters");
    expect(pageSource).toContain("Set up who can receive ECC handoffs from workflow guidance.");
    expect(pageSource).toContain("No authorized ECC raters are set up yet.");
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

  it("wires create form with required and optional fields", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

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
  });

  it("shows connected account rater option wired to active connections", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Connected account raters");
    expect(pageSource).toContain("listActiveRecipientConnectionsForAccount");
    expect(pageSource).toContain("createConnectedAccountAuthorizedEccRaterFromForm");
    expect(pageSource).toContain("Active connected accounts can be added as authorized ECC rater routing options.");
    expect(pageSource).toContain("No active connected handoff accounts yet.");
    expect(pageSource).toContain("#account-handoff-connections");
  });

  it("labels connected recipient rows clearly", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");
    expect(pageSource).toContain("Connected account");
  });
});
