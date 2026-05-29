import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobTestsPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const jobLocationPreviewSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/JobLocationPreview.tsx"),
  "utf8",
);

describe("job tests page wiring", () => {
  it("exposes Asbestos as a manual override option and keeps override reason free-form", () => {
    expect(jobTestsPageSource).toContain('<option value="pass">Smoke Test</option>');
    expect(jobTestsPageSource).toContain('<option value="fail">Asbestos</option>');
    expect(jobTestsPageSource).toContain('autoComplete="off"');
    expect(jobTestsPageSource).not.toContain('<datalist id={`ovr-reason-list-${runDL.id}`}>');
  });
});

describe("job detail field operations board layout", () => {
  it("keeps the service location chip over the image area", () => {
    expect(jobPageSource).toContain('className="bg-slate-100 p-3"');
    expect(jobPageSource).toContain('Service Location');
    expect(jobPageSource).not.toContain('bg-slate-100 p-3 pt-10');
  });

  it("labels account, access, and billing context clearly", () => {
    expect(jobPageSource).toContain("Responsible Account");
    expect(jobPageSource).toContain("Site / Access Contact");
    expect(jobPageSource).toContain("Billing");
    expect(jobPageSource).toContain("Phone:");
    expect(jobPageSource).toContain("Email:");
    expect(jobPageSource).toContain("Access phone");
    expect(jobPageSource).toContain("billingRecipientEmail");
  });

  it("suppresses duplicate default cards and keeps billing-context hint copy", () => {
    expect(jobPageSource).toContain("const showSiteAccessCard = hasSeparateSiteAccessContact && !siteAccessMatchesAccount;");
    expect(jobPageSource).not.toContain("Same as responsible account");
    expect(jobPageSource).not.toContain("No separate site/access contact saved");
    expect(jobPageSource).not.toContain("Defaults to responsible account");
    expect(jobPageSource).toContain("Billing contact on account");
    expect(jobPageSource).toContain("Invoice routing still follows the job/invoice billing recipient fields.");
  });

  it("keeps custom and contractor billing recipient display branches", () => {
    expect(jobPageSource).toContain("const hasBillingSnapshotFields = Boolean(");
    expect(jobPageSource).toContain("const isContractorBillingRecipient = billingRecipientType === \"contractor\";");
    expect(jobPageSource).toContain("Contractor / Billing");
    expect(jobPageSource).toContain("billingRecipientAddressParts");
  });

  it("keeps account and distinct access action buttons available", () => {
    expect(jobPageSource).toContain("Call account phone");
    expect(jobPageSource).toContain("Text account phone");
    expect(jobPageSource).toContain("Call access phone");
    expect(jobPageSource).toContain("Text access phone");
  });

  it("uses a field-first job command header instead of the job title as the main heading", () => {
    expect(jobPageSource).toContain("const fieldHeaderTitle =");
    expect(jobPageSource).toContain("{fieldHeaderTitle}");
    expect(jobPageSource).toContain("primarySiteAccessName");
    expect(jobPageSource).toContain("?? \"Job Detail\"");
    expect(jobPageSource).not.toContain('{normalizeRetestLinkedJobTitle(job.title) || "Operational job workspace"}');
  });

  it("keeps visit reason and intake notes below the location preview", () => {
    expect(jobPageSource).toContain("Visit Reason");
    expect(jobPageSource).toContain("const visitReasonText =");
    expect(jobPageSource).toContain("{visitReasonText}");
    expect(jobPageSource).toContain("Customer Concern");
    expect(jobPageSource).toContain("Intake Notes");
    expect(jobPageSource).toContain("whitespace-pre-wrap break-words");
  });

  it("keeps work needed after visit reason on mobile while spanning the desktop grid", () => {
    const visitReasonIndex = jobPageSource.indexOf("Visit Reason");
    const visitScopeIndex = jobPageSource.indexOf('id="visit-scope-section"');
    const rightRailIndex = jobPageSource.indexOf("Right: permit and equipment reference rail");
    const assignedTeamIndex = jobPageSource.indexOf('id="assigned-team"');

    expect(visitReasonIndex).toBeGreaterThan(-1);
    expect(visitScopeIndex).toBeGreaterThan(visitReasonIndex);
    expect(rightRailIndex).toBeGreaterThan(visitScopeIndex);
    expect(assignedTeamIndex).toBeGreaterThan(rightRailIndex);
    expect(jobPageSource).toContain("xl:order-4 xl:col-span-3");
    expect(jobPageSource).toContain("space-y-3 xl:order-3");
  });

  it("keeps the location preview compact on mobile and hides lower map actions there", () => {
    expect(jobLocationPreviewSource).toContain("h-40 w-full object-cover");
    expect(jobLocationPreviewSource).toContain("sm:h-52 lg:h-56 xl:h-60");
    expect(jobLocationPreviewSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobPageSource).toContain("h-40 w-full animate-pulse");
    expect(jobPageSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
  });

  it("includes location-linked contacts in site/access resolution priority", () => {
    expect(jobPageSource).toContain('linkedEntityType: "location"');
    expect(jobPageSource).toContain('["job", 0]');
    expect(jobPageSource).toContain('["location", 1]');
    expect(jobPageSource).toContain('["customer", 2]');
    expect(jobPageSource).not.toContain('["billing_contact", 5]');
  });
});
