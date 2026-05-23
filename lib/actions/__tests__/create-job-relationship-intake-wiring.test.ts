import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const jobActionsSource = readFileSync(
  path.join(process.cwd(), "lib", "actions", "job-actions.ts"),
  "utf8",
);

describe("createJobFromForm relationship-intake wiring", () => {
  it("reads optional site/access contact fields from intake payload", () => {
    expect(jobActionsSource).toContain('site_access_contact_different');
    expect(jobActionsSource).toContain('site_access_contact_name');
    expect(jobActionsSource).toContain('site_access_contact_phone');
    expect(jobActionsSource).toContain('site_access_contact_email');
    expect(jobActionsSource).toContain('site_access_contact_notes');
  });

  it("keeps billing snapshot fields sourced from existing billing form keys", () => {
    expect(jobActionsSource).toContain('const billing_recipient = String(formData.get("billing_recipient") || "").trim()');
    expect(jobActionsSource).toContain('const billing_name = String(formData.get("billing_name") || "").trim() || null;');
    expect(jobActionsSource).toContain('const billing_email = String(formData.get("billing_email") || "").trim() || null;');
    expect(jobActionsSource).toContain('const billing_phone = String(formData.get("billing_phone") || "").trim() || null;');
    expect(jobActionsSource).toContain('String(formData.get("billing_address_line1") || "").trim() || null;');
  });

  it("creates location-linked site_access_contact as best effort after canonical location resolution", () => {
    expect(jobActionsSource).toContain('async function maybeCreateLocationSiteAccessContact(locationId: string)');
    expect(jobActionsSource).toContain('linked_entity_type: "location"');
    expect(jobActionsSource).toContain('recipient_role: "site_access_contact"');
    expect(jobActionsSource).toContain('source_type: "manual"');
    expect(jobActionsSource).toContain('site_access_contact_create_failed');
  });

  it("does not change internal invoice or closeout paths from create intake wiring", () => {
    expect(jobActionsSource).not.toContain('createInternalInvoiceDraftFromForm(');
    expect(jobActionsSource).not.toContain('sendInternalInvoiceEmailFromForm(');
    expect(jobActionsSource).not.toContain('markInvoiceCompleteFromForm(');
  });
});
