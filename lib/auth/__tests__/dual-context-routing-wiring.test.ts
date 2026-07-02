import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf-8");
}

describe("dual-context routing wiring", () => {
  it("uses the shared resolver for root and auth callback landing", () => {
    const rootPage = readRepoFile("app/page.tsx");
    const authCallback = readRepoFile("app/auth/callback/page.tsx");
    const loginPage = readRepoFile("app/login/page.tsx");

    expect(rootPage).toContain("resolveDualContextAccess");
    expect(rootPage).toContain("landingPathForDualContextAccess");
    expect(rootPage).not.toContain(".from(\"contractor_users\")");

    expect(authCallback).toContain("resolveDualContextAccess");
    expect(authCallback).toContain("resolvePostLoginDestination");

    expect(loginPage).toContain("resolveDualContextAccess");
    expect(loginPage).toContain("resolvePostLoginDestination");
  });

  it("gates normal shell create and nav by active internal app context", () => {
    const layout = readRepoFile("app/layout.tsx");
    const mobileMenu = readRepoFile("components/layout/MobileShellMenu.tsx");

    expect(layout).toContain("access.hasActiveAppAccess");
    expect(layout).toContain("{isInternalUser ? <ShellCreateMenu items={createMenuItems} /> : null}");
    expect(layout).toContain("const hasExistingPortalAccess = access.hasExistingPortalAccess");
    expect(layout).toContain("Compliance Matters Portal");
    expect(layout).toContain("hasPortalAccess={hasPortalAccess}");

    expect(mobileMenu).toContain("{isInternalUser ? (");
    expect(mobileMenu).toContain('href="/jobs/new"');
    expect(mobileMenu).toContain('href="/customers/new"');
    expect(mobileMenu).toContain("hasPortalAccess: boolean;");
    expect(mobileMenu).toContain("Compliance Matters Portal");
  });

  it("keeps portal request entry explicit and prevents membership-only job context switching", () => {
    const portalPage = readRepoFile("app/portal/page.tsx");
    const newJobPage = readRepoFile("app/jobs/new/page.tsx");
    const newJobForm = readRepoFile("app/jobs/new/NewJobForm.tsx");
    const jobActions = readRepoFile("lib/actions/job-actions.ts");

    expect(portalPage).toContain('href="/jobs/new?context=portal"');
    expect(portalPage).toContain("Send Work to Compliance Matters");

    expect(newJobPage).toContain("explicitPortalContext");
    expect(newJobPage).toContain("access.hasActiveAppAccess");
    expect(newJobPage).toContain("access.portal?.contractorId");

    expect(newJobForm).toContain('name="intake_context"');
    expect(newJobForm).toContain("Portal Work Request");

    expect(jobActions).toContain("isExplicitPortalIntake");
    expect(jobActions).toContain("Same-email contractor membership alone");
    expect(jobActions).toContain("if (userId && isExplicitPortalIntake)");
  });
});
