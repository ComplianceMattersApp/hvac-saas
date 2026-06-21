import { describe, expect, it } from "vitest";

import { buildInternalProposalAlertEmailHtml } from "@/lib/email/operational-proposal-alert-email";

describe("buildInternalProposalAlertEmailHtml", () => {
  it("renders polished review email with required action language and CTA", () => {
    const html = buildInternalProposalAlertEmailHtml({
      contractorName: "Test Contractor",
      customerName: "Pat Lee",
      proposedAddress: "123 Main St, Pleasanton, CA 94566",
      serviceType: "Ecc / Alteration",
      submittedAtText: "May 20, 2026, 8:21 AM PDT",
      proposalUrl: "https://app.example.test/ops/admin/contractor-intake-submissions/sub-1",
      proposalTitle: "Living room system replacement",
      proposalNotes: "Customer asked for morning window.",
      companyDisplayName: "Acme HVAC",
      companyLogoUrl: "https://cdn.example.test/acme-logo.png",
      supportPhone: "555-1111",
      supportEmail: "ops@acme.test",
    });

    expect(html).toContain("New job proposal submitted");
    expect(html).toContain("A new job proposal was submitted through the portal and is ready for internal review.");
    expect(html).toContain("Review Proposal in EveryStep FieldWorks");
    expect(html).toContain("This proposal is pending internal review and has not been approved, scheduled, or finalized.");
    expect(html).toContain("Submitted Notes");
    expect(html).toContain("Customer asked for morning window.");
    expect(html).toContain("Living room system replacement");
  });

  it("omits optional notes section when notes are absent", () => {
    const html = buildInternalProposalAlertEmailHtml({
      contractorName: "Test Contractor",
      customerName: "Pat Lee",
      proposedAddress: "123 Main St, Pleasanton, CA 94566",
      serviceType: "Ecc / Alteration",
      submittedAtText: "May 20, 2026, 8:21 AM PDT",
      proposalUrl: null,
      proposalTitle: null,
      proposalNotes: null,
      companyDisplayName: "Acme HVAC",
      companyLogoUrl: null,
      supportPhone: null,
      supportEmail: null,
    });

    expect(html).not.toContain("Submitted Notes");
    expect(html).not.toContain("Review Proposal in EveryStep FieldWorks");
  });
});
