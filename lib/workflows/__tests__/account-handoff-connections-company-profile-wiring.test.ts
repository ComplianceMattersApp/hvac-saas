import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("account handoff connections company profile wiring", () => {
  it("renders connected handoff accounts setup section and safety copy", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Connected Handoff Accounts");
    expect(pageSource).toContain("Set up trusted company-to-company handoff connections.");
    expect(pageSource).toContain("It does not share jobs, customers, service cases, or payment data.");
    expect(pageSource).toContain("Pending outgoing");
    expect(pageSource).toContain("Pending incoming");
    expect(pageSource).toContain("Declined / Revoked");
    expect(pageSource).toContain('id="account-handoff-connections"');
  });

  it("wires read model and setup form actions without queue language", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("listAccountHandoffConnectionsForAccount");
    expect(pageSource).toContain("action={requestAccountHandoffConnectionFromForm}");
    expect(pageSource).toContain('name="recipient_account_owner_user_id"');
    expect(pageSource).toContain('name="connection_note"');
    expect(pageSource).toContain("Enter the account owner user id for the company you want to connect with.");
    expect(pageSource).toContain("Company lookup/search can come later.");
    expect(pageSource).not.toContain("handoff request queue");
  });

  it("wires incoming approve decline and active revoke controls", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("action={approveAccountHandoffConnectionFromForm}");
    expect(pageSource).toContain("action={declineAccountHandoffConnectionFromForm}");
    expect(pageSource).toContain("action={revokeAccountHandoffConnectionFromForm}");
    expect(pageSource).toContain("Approve");
    expect(pageSource).toContain("Decline");
    expect(pageSource).toContain("Revoke");
  });

  it("keeps setup surface scoped away from operational table access language", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).not.toContain('.from("jobs")');
    expect(pageSource).not.toContain('.from("service_cases")');
    expect(pageSource).not.toContain('.from("job_events")');
    expect(pageSource).not.toContain('.from("workflow_handoff_requests")');
  });
});
