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
    expect(pageSource).toContain("Choose who receives ECC/HERS handoffs when jobs need rater review");
    expect(pageSource).toContain("No ECC/HERS rater selected yet");
    expect(pageSource).toContain("Advanced ECC/HERS rater details");
    expect(pageSource).toContain("No connected ECC raters are set up yet.");
    expect(pageSource).toContain("Add Compliance Matters or another authorized rater account to enable ECC handoffs.");
    expect(pageSource).toContain("Workflow handoff will show setup required.");
    expect(pageSource).toContain("Workflow handoff will default to this rater.");
    expect(pageSource).toContain("Workflow handoff will ask the user to choose a rater.");
  });

  it("shows the current account rater link id as a read-only shareable field", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("const raterLinkId = internalUser.account_owner_user_id;");
    expect(pageSource).toContain("My ECC/HERS handoff ID");
    expect(pageSource).toContain("Share this ID with contractors who use Compliance Matters");
    expect(pageSource).toContain("connect to your rater account for ECC/HERS testing, corrections, retests, and cert closeout");
    expect(pageSource).toContain('id="my-rater-link-id"');
    expect(pageSource).toContain("readOnly");
    expect(pageSource).toContain("value={raterLinkId}");
    expect(pageSource).toContain('aria-label="Copy ECC/HERS handoff ID"');
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
    expect(pageSource).toContain("For Compliance Matters, use the ECC/HERS handoff ID provided by Compliance Matters.");
    expect(pageSource).toContain("No active connected rater accounts yet.");
    expect(pageSource).toContain("Connect ECC rater");
    expect(pageSource).toContain("#account-handoff-connections");
  });

  it("labels the connection request field as rater link id while preserving current backend field", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("ECC/HERS handoff ID");
    expect(pageSource).toContain('name="recipient_account_owner_user_id"');
    expect(pageSource).toContain("match this to a connected account behind the scenes until dedicated handoff ID validation is available");
  });

  it("labels connected recipient rows clearly", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");
    expect(pageSource).toContain("Connected handoff account");
  });
});
