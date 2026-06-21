import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf-8");
}

describe("app access CTA wiring", () => {
  it("renders the app access CTA read model on the portal dashboard", () => {
    const portalPage = readRepoFile("app/portal/page.tsx");
    const helper = readRepoFile("lib/business/app-access-cta.ts");

    expect(portalPage).toContain("resolveDualContextAccess");
    expect(portalPage).toContain("loadAppAccessCtaEntitlementSnapshot");
    expect(portalPage).toContain("resolveAppAccessCta");
    expect(portalPage).toContain("getPlatformBillingAvailability");
    expect(portalPage).toContain("<AppAccessCtaCard cta={appAccessCta} />");

    expect(helper).toContain("Want to run your own jobs in EveryStep FieldWorks?");
    expect(helper).toContain("Start 30-day trial");
    expect(helper).toContain("Resume app access");
    expect(helper).toContain("Reactivate app access");
    expect(helper).toContain("Open app");
  });

  it("keeps portal access visible while rendering inactive app access affordances", () => {
    const portalPage = readRepoFile("app/portal/page.tsx");

    expect(portalPage).toContain("<AppAccessCtaCard cta={appAccessCta} />");
    expect(portalPage).toContain("Send Work to Compliance Matters");
    expect(portalPage).toContain("Priority Queue");
  });

  it("renders the same app access CTA model on access-inactive", () => {
    const inactivePage = readRepoFile("app/access-inactive/page.tsx");

    expect(inactivePage).toContain("refreshPlatformSubscriptionStatusFromForm");
    expect(inactivePage).toContain("loadAppAccessCtaEntitlementSnapshot");
    expect(inactivePage).toContain("resolveAppAccessCta");
    expect(inactivePage).toContain("getPlatformBillingAvailability");
    expect(inactivePage).toContain("<AppAccessCtaCard cta={appAccessCta} />");
    expect(inactivePage).toContain('if (access.hasPortalAccess) redirect("/portal")');
    expect(inactivePage).toContain("Billing status may still be syncing");
    expect(inactivePage).toContain("Refresh subscription status");
    expect(inactivePage).toContain("billingCustomerLinked");
    expect(inactivePage).toContain("!canRefreshPlatformSubscription ? <AppAccessCtaCard cta={appAccessCta} /> : null");
  });

  it("routes portal-only trial start to signup and inactive app resume to checkout", () => {
    const helper = readRepoFile("lib/business/app-access-cta.ts");

    expect(helper).toContain('kind: "start_trial"');
    expect(helper).toContain('href: "/signup/service"');
    expect(helper).toContain('kind: "resume_app_access"');
    expect(helper).toContain('kind: "reactivate_app_access"');
    expect(helper).toContain('action: "/api/stripe/checkout"');
    expect(helper).not.toContain("provisionFirstOwnerAccount");
    expect(helper).not.toContain("submitSelfServeOnboardingForm");
  });
});
