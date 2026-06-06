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
      expect(source).toContain("Field Billing Access");
      expect(source).toContain("These permissions do not change the user's role.");
      expect(source).toContain(
        "Reporting cash/check/other creates a Confirm Payment item unless the user has verification/final payment authority.",
      );
      expect(source).toContain("Save Field Billing Access");
      expect(source).toContain("View billing summary");
      expect(source).toContain("Field payment collection");
      expect(source).toContain("Report cash/check/other payment");
      expect(source).toContain("Collect card payment");
      expect(source).toContain("Verify reported non-card payments");
      expect(source).toContain("Grant only to office or trusted financial reviewers.");
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
