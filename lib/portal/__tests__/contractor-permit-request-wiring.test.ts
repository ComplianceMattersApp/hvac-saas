import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const portalPageSource = readFileSync(resolve(__dirname, "../../../app/portal/page.tsx"), "utf8");
const permitRequestPageSource = readFileSync(resolve(__dirname, "../../../app/portal/permit-request/page.tsx"), "utf8");
const permitRequestFormSource = readFileSync(
  resolve(__dirname, "../../../app/portal/permit-request/ContractorPermitRequestUploadForm.tsx"),
  "utf8",
);
const actionSource = readFileSync(resolve(__dirname, "../../actions/permit-request-actions.ts"), "utf8");

describe("contractor permit request portal wiring", () => {
  it("adds an allowlist-gated Request Permit entry point without changing normal contractor intake", () => {
    expect(portalPageSource).toContain('href="/portal/permit-request"');
    expect(portalPageSource).toContain("Request Permit");
    expect(portalPageSource).toContain("isPermitWorkflowEnabledForAccountOwner");
    expect(portalPageSource).toContain("permitWorkflowEnabled ? (");
    expect(portalPageSource).toContain('href="/jobs/new?context=portal"');
    expect(portalPageSource).toContain("Send Work to Compliance Matters");
  });

  it("renders a minimal upload surface and schema-unavailable message", () => {
    expect(permitRequestPageSource).toContain("getContractorPermitRequestSurfaceAvailability");
    expect(permitRequestPageSource).toContain("ContractorPermitRequestUploadForm");
    expect(permitRequestPageSource).toContain("Permit requests are temporarily unavailable.");
    expect(permitRequestPageSource).toContain("Upload a contract photo, permit packet, or PDF.");
  });

  it("keeps the contractor form lightweight", () => {
    expect(permitRequestFormSource).toContain("Contract, photo, or PDF");
    expect(permitRequestFormSource).toContain("Optional note for Compliance Matters");
    expect(permitRequestFormSource).toContain("Select at least one file to upload.");
    expect(permitRequestFormSource).not.toContain("customer_first_name");
    expect(permitRequestFormSource).not.toContain("jurisdiction");
    expect(permitRequestFormSource).not.toContain("permit_number");
    expect(permitRequestFormSource).not.toContain("scheduled");
  });

  it("does not add job lifecycle, job events, scheduling, or internal permit actions", () => {
    const source = actionSource.toLowerCase();

    expect(source).toContain('status: "permit_request"');
    expect(source).toContain('entity_type: "permit_request"');
    expect(source).toContain('event_type: "permit_request_received"');
    expect(source).not.toContain("job_events");
    expect(source).not.toContain("ops_status");
    expect(source).not.toContain("mark permit created");
    expect(source).not.toContain("ready_for_testing");
    expect(source).not.toContain("pending_install");
  });
});
