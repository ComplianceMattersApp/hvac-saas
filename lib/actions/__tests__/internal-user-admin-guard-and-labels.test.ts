import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

function roleUpdateForms(source: string) {
  return source.match(/<form action={updateInternalUserRoleFromForm}[\s\S]*?<\/form>/g) ?? [];
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
      expect(form).toContain('type="submit"');
    }
  });
});
