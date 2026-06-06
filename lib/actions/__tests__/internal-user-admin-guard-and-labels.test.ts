import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

function roleUpdateForms(source: string) {
  return source.match(/<form action={updateInternalUserRoleFromForm}[\s\S]*?<\/form>/g) ?? [];
}

function fieldBillingAccessForms(source: string) {
  return source.match(/<form[\s\S]*?action={updateInternalUserFieldBillingCapabilitiesFromForm}[\s\S]*?<\/form>/g) ?? [];
}

describe("internal user admin guard and role labels", () => {
  it("keeps admin-only guard on admin center internal user pages", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const internalUserDetailPage = readWorkspaceFile("app/ops/admin/internal-users/[userId]/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    expect(internalUsersListPage).toContain('requireInternalRole("admin"');
    expect(internalUserDetailPage).toContain('requireInternalRole("admin"');
    expect(peopleAccessPage).toContain('requireInternalRole("admin"');
  });

  it("shows Billing / AR label and billing role options on internal user surfaces", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const internalUserDetailPage = readWorkspaceFile("app/ops/admin/internal-users/[userId]/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    expect(internalUsersListPage).toContain('Billing / AR');
    expect(internalUsersListPage).toContain('<option value="billing">Billing / AR</option>');

    expect(internalUserDetailPage).toContain('Billing / AR');

    expect(peopleAccessPage).toContain('Billing / AR');
    expect(peopleAccessPage).toContain('<option value="billing">Billing / AR</option>');
  });

  it("keeps Manage Team Access out of role update submit forms", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    const forms = [
      ...roleUpdateForms(internalUsersListPage),
      ...roleUpdateForms(peopleAccessPage),
    ];

    expect(forms.length).toBeGreaterThanOrEqual(2);
    for (const form of forms) {
      expect(form).toContain("Update Role");
      expect(form).not.toContain("Manage Team Access");
      expect(form).not.toContain("Manage Permissions");
      expect(form).not.toContain("Field Billing Access");
      expect(form).not.toContain("Save Field Billing Access");
      expect(form).toContain('type="submit"');
    }
  });

  it("shows separate Field Billing Access controls for Owner/Admin team management", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    for (const source of [internalUsersListPage, peopleAccessPage]) {
      expect(source).toContain("updateInternalUserFieldBillingCapabilitiesFromForm");
      expect(source).toContain("Manage Permissions");
      expect(source).toContain("<details");
      expect(source).toContain("<summary");
      expect(source).toContain("Field Billing Access");
      expect(source).toContain("These permissions do not change the user's role.");
      expect(source).toContain("Save Field Billing Access");
      expect(source).toContain("Includes billing status, card collection, and cash/check/other collection.");
      expect(source).toContain("Cash/check/other collected by field users requires Confirm Payment before it counts as paid.");
      expect(source).toContain("value=\"field_billing_enabled\"");
      expect(source).toContain("Office confirmation");
      expect(source).toContain("Confirm field-reported payments");
      expect(source).toContain("Grant only to office or trusted financial reviewers.");
      expect(source).toContain("Billing access included with role.");
      expect(source).toContain("Field-only permission toggles are hidden for Admin/Billing users");
      expect(source).toContain("hasRoleIncludedBillingAccess");
      expect(source).not.toContain("View billing summary");
      expect(source).not.toContain("Field payment collection");
      expect(source).not.toContain("Collect card payments");
      expect(source).not.toContain("Accept cash/check/other payments");
    }
  });

  it("shows only the simplified field billing and confirmation controls for non-financial users", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    for (const source of [internalUsersListPage, peopleAccessPage]) {
      const controlStart = source.indexOf("function FieldBillingAccessControls");
      const controlEnd = source.indexOf("const NOTICE_TEXT", controlStart) > 0
        ? source.indexOf("const NOTICE_TEXT", controlStart)
        : source.indexOf("async function requireAdminOrRedirect", controlStart);
      const controlSource = source.slice(controlStart, controlEnd);
      const masterIndex = controlSource.indexOf("Enable field billing access");
      const officeIndex = controlSource.indexOf("Office confirmation");
      const verifyIndex = controlSource.indexOf("Confirm field-reported payments");

      expect(controlStart).toBeGreaterThanOrEqual(0);
      expect(masterIndex).toBeGreaterThanOrEqual(0);
      expect(officeIndex).toBeGreaterThan(masterIndex);
      expect(verifyIndex).toBeGreaterThan(officeIndex);
      expect(controlSource).toContain('value="field_billing_enabled"');
      expect(controlSource).toContain('value="can_verify_non_card_collection"');
      expect(controlSource).not.toContain("FIELD_BILLING_CHILD_ACCESS_TOGGLES");
    }
  });

  it("keeps old granular field payment labels out of the admin UI", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    for (const source of [internalUsersListPage, peopleAccessPage]) {
      expect(source).toContain('value="field_billing_enabled"');
      expect(source).toContain('value="can_verify_non_card_collection"');
      expect(source).toContain("Confirm field-reported payments");
      expect(source).not.toContain("Report cash/check/other payment");
      expect(source).not.toContain("Accept cash/check/other payments");
      expect(source).not.toContain("Collect card payments");
      expect(source).not.toContain("Field payment collection");
      expect(source).not.toContain("View billing summary");
    }
  });

  it("keeps capability controls out of the role update form submit path", () => {
    const internalUsersListPage = readWorkspaceFile("app/ops/admin/internal-users/page.tsx");
    const peopleAccessPage = readWorkspaceFile("app/ops/admin/users/page.tsx");

    const capabilityForms = [
      ...fieldBillingAccessForms(internalUsersListPage),
      ...fieldBillingAccessForms(peopleAccessPage),
    ];

    expect(capabilityForms.length).toBeGreaterThanOrEqual(2);
    for (const form of capabilityForms) {
      expect(form).toContain("capability_key");
      expect(form).toContain("Save Field Billing Access");
      expect(form).not.toContain("Update Role");
      expect(form).not.toContain('name="role"');
    }
  });
});
