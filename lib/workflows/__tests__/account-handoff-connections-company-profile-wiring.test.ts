import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("account handoff connections company profile wiring", () => {
  it("renders connected handoff accounts setup section and safety copy", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Connected Handoff Accounts");
    expect(pageSource).toContain("Manage trusted company-to-company connections for future ECC/HERS handoffs.");
    expect(pageSource).toContain("No handoff accounts connected yet");
    expect(pageSource).toContain("Advanced ECC/HERS handoff details");
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
    expect(pageSource).toContain("Enter the ECC/HERS handoff ID provided by the connected rating company.");
    expect(pageSource).toContain("match this to a connected account behind the scenes until dedicated handoff ID validation is available");
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
