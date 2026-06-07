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

  it("keeps account and access action buttons available with compact labels", () => {
    expect(jobPageSource).toContain("Account Contact");
    expect(jobPageSource).toContain("const accountEmailLink =");
    expect(jobPageSource).toContain("mailto:");
    expect(jobPageSource).toContain("Call");
    expect(jobPageSource).toContain("Text");
    expect(jobPageSource).toContain("Email");
    expect(jobPageSource).toContain("Access Call");
    expect(jobPageSource).toContain("Access Text");
    expect(jobPageSource).not.toContain("Call account phone");
    expect(jobPageSource).not.toContain("Text account phone");
    expect(jobPageSource).not.toContain("Open Map");
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
    expect(jobPageSource).toContain('id="visit-reason-card"');
    expect(jobPageSource).toContain('id="mobile-visit-reason-card"');
    expect(jobPageSource).toContain("updateJobVisitScopeFromForm");
    expect(jobPageSource).toContain('name="visit_scope_summary"');
    expect(jobPageSource).toContain('name="visit_scope_items_json" value={visitScopeItemsJsonForInlineEdit}');
    expect(jobPageSource).toContain("Customer Concern");
    expect(jobPageSource).toContain("Intake Notes");
    expect(jobPageSource).toContain("whitespace-pre-wrap break-words");
  });

  it("does not duplicate intake note in right notes card and keeps honest empty-state copy", () => {
    const jobNotesCardStart = jobPageSource.indexOf("<ChatIcon className=\"h-3.5 w-3.5\" />{rightRailNotesTitle}</div>");
    const jobNotesCardEnd = jobPageSource.indexOf('href="#internal-notes"', jobNotesCardStart);
    const jobNotesCardSlice =
      jobNotesCardStart > -1 && jobNotesCardEnd > jobNotesCardStart
        ? jobPageSource.slice(jobNotesCardStart, jobNotesCardEnd)
        : "";

    expect(jobPageSource).toContain("Intake Notes");
    expect(jobNotesCardSlice).not.toContain("Intake note");
    expect(jobPageSource).toContain("const rightRailNotesEmptyText = isEccJobType ? \"No shared or internal notes yet.\" : \"No notes yet.\";");
    expect(jobPageSource).toContain("<ChatIcon className=\"h-3.5 w-3.5\" />{rightRailNotesTitle}</div>");
    expect(jobPageSource).not.toContain("Notes & Comments");
    expect(jobNotesCardSlice).not.toContain("Follow-up note");
    expect(jobPageSource).toContain("View / Add Notes");
  });

  it("uses service-safe wording in top notes card and keeps shared wording ECC-only", () => {
    expect(jobPageSource).toContain("const isEccJobType = job.job_type === \"ecc\";");
    expect(jobPageSource).toContain("const rightRailNotesTitle = isEccJobType ? \"Shared Notes\" : \"Job Notes\";");
    expect(jobPageSource).toContain("const rightRailNotesSubtitle = isEccJobType");
    expect(jobPageSource).toContain("? \"Latest shared/internal note activity.\"");
    expect(jobPageSource).toContain(": \"Latest job note activity.\";");
    expect(jobPageSource).toContain("const rightRailNotesEmptyText = isEccJobType ? \"No shared or internal notes yet.\" : \"No notes yet.\";");
  });

  it("keeps work needed after visit reason on mobile while spanning the desktop grid", () => {
    const visitReasonIndex = jobPageSource.indexOf("Visit Reason");
    const visitScopeIndex = jobPageSource.indexOf('id="visit-scope-section"');
    const rightRailIndex = jobPageSource.indexOf("Right: quick reference rail");
    const assignedTeamIndex = jobPageSource.indexOf('id="assigned-team"');

    expect(visitReasonIndex).toBeGreaterThan(-1);
    expect(visitScopeIndex).toBeGreaterThan(visitReasonIndex);
    expect(assignedTeamIndex).toBeGreaterThan(-1);
    expect(assignedTeamIndex).toBeLessThan(visitScopeIndex);
    expect(rightRailIndex).toBeGreaterThan(visitScopeIndex);
    expect(jobPageSource).toContain("xl:order-4 xl:col-span-3");
    expect(jobPageSource).toContain("space-y-3 xl:order-3");
  });

  it("keeps the location preview compact on mobile and hides lower map actions there", () => {
    expect(jobLocationPreviewSource).toContain("h-40 w-full object-cover");
    expect(jobLocationPreviewSource).toContain("sm:h-52 lg:h-56 xl:h-60");
    expect(jobLocationPreviewSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobLocationPreviewSource).toContain("border border-gray-300 bg-white");
    expect(jobPageSource).toContain("h-40 w-full animate-pulse");
    expect(jobPageSource).toContain("mt-3 hidden flex-col gap-2 sm:flex");
    expect(jobPageSource).toContain("Navigate");
    expect(jobPageSource).toContain("Open in Maps");
  });

  it("keeps permit quick reference in the top rail", () => {
    const permitQuickRefIndex = jobPageSource.indexOf("><ClipboardIcon className=\"h-3.5 w-3.5\" />Permit Quick Ref</div>");

    expect(jobPageSource).toContain("Permit Quick Ref");
    expect(jobPageSource).toContain("Permit number");
    expect(permitQuickRefIndex).toBeGreaterThan(-1);
  });

  it("restores ECC summary, permit details, and equipment inside lower job records section", () => {
    const recordsSectionIndex = jobPageSource.indexOf("Activity, Evidence, and History");
    const recordsGridIndex = jobPageSource.indexOf('grid grid-cols-1 items-start gap-2 sm:gap-3 xl:grid-cols-2 2xl:grid-cols-3', recordsSectionIndex);
    const lowerEccSummaryIndex = jobPageSource.indexOf('title="ECC Summary"', recordsGridIndex);
    const lowerPermitIndex = jobPageSource.indexOf('title="Permit Details"', recordsGridIndex);
    const lowerEquipmentIndex = jobPageSource.indexOf('title="Equipment"', recordsGridIndex);
    const internalNotesIndex = jobPageSource.indexOf('details id="internal-notes"', recordsGridIndex);

    expect(recordsSectionIndex).toBeGreaterThan(-1);
    expect(recordsGridIndex).toBeGreaterThan(recordsSectionIndex);
    expect(lowerEccSummaryIndex).toBeGreaterThan(recordsGridIndex);
    expect(lowerPermitIndex).toBeGreaterThan(lowerEccSummaryIndex);
    expect(lowerEquipmentIndex).toBeGreaterThan(lowerPermitIndex);
    expect(internalNotesIndex).toBeGreaterThan(lowerEquipmentIndex);
    expect(jobPageSource).toContain("showEccSummaryCard = job.job_type === \"ecc\"");
    expect(jobPageSource).toContain("showJobRecordsPermitCard = showEccSummaryCard || hasPermitDetails");
    expect(jobPageSource).toContain("Manage Equipment");
  });

  it("keeps ECC summary gated to ECC jobs while preserving permit and equipment cards", () => {
    expect(jobPageSource).toContain('{showEccSummaryCard ? (');
    expect(jobPageSource).toContain('title="ECC Summary"');
    expect(jobPageSource).toContain('{showJobRecordsPermitCard ? (');
    expect(jobPageSource).toContain('title="Permit Details"');
    expect(jobPageSource).toContain('title="Equipment"');
  });

  it("keeps notes rail action near top with no follow-up shortcut", () => {
    expect(jobPageSource).toContain("rightRailNotesTitle");
    expect(jobPageSource).toContain('href="#internal-notes"');
    expect(jobPageSource).not.toContain('href="#follow-up"');
    expect(jobPageSource).toContain("View / Add Notes");
  });

  it("keeps destination notes section expanded by default", () => {
    expect(jobPageSource).toContain('details id="internal-notes" className={jobRecordsDetailsClass} open');
  });

  it("includes location-linked contacts in site/access resolution priority", () => {
    expect(jobPageSource).toContain('linkedEntityType: "location"');
    expect(jobPageSource).toContain('["job", 0]');
    expect(jobPageSource).toContain('["location", 1]');
    expect(jobPageSource).toContain('["customer", 2]');
    expect(jobPageSource).not.toContain('["billing_contact", 5]');
  });
});
