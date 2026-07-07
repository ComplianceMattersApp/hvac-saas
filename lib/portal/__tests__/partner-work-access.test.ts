import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  buildPartnerWorkSourceLabelMap,
} from "../partner-work-read-model";
import { shouldShowPartnerWorkMenuItem, shouldShowPortalMenuItem } from "../partner-work-access";

describe("partner work access", () => {
  it("shows the portal menu only for active app users with portal access", () => {
    expect(
      shouldShowPortalMenuItem({
        hasActiveAppAccess: true,
        hasExistingPortalAccess: true,
      }),
    ).toBe(true);
    expect(
      shouldShowPortalMenuItem({
        hasActiveAppAccess: false,
        hasExistingPortalAccess: true,
      }),
    ).toBe(false);
    expect(
      shouldShowPortalMenuItem({
        hasActiveAppAccess: true,
        hasExistingPortalAccess: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPartnerWorkMenuItem({ isInternalUser: true, hasPartnerWorkAccess: true }),
    ).toBe(true);
    expect(
      shouldShowPartnerWorkMenuItem({ isInternalUser: true, hasPartnerWorkAccess: false }),
    ).toBe(false);
    expect(
      shouldShowPartnerWorkMenuItem({ isInternalUser: false, hasPartnerWorkAccess: true }),
    ).toBe(false);
  });

  it("labels attached work as created by rater and prefers sent to rater when formal handoff exists", () => {
    const labels = buildPartnerWorkSourceLabelMap({
      jobIds: ["job-created", "job-duplicate", "job-formal"],
      requestRows: [
        {
          source_job_id: "job-duplicate",
          handoff_status: "sent",
          sent_at: "2026-06-01T18:00:00.000Z",
          created_at: "2026-06-01T18:00:00.000Z",
          updated_at: "2026-06-01T18:05:00.000Z",
        },
        {
          source_job_id: "job-formal",
          handoff_status: "completed",
          sent_at: "2026-06-01T18:00:00.000Z",
          created_at: "2026-06-01T18:00:00.000Z",
          updated_at: "2026-06-01T18:05:00.000Z",
        },
        {
          source_job_id: "job-created",
          handoff_status: "cancelled",
          sent_at: "2026-06-01T18:00:00.000Z",
          created_at: "2026-06-01T18:00:00.000Z",
          updated_at: "2026-06-01T18:05:00.000Z",
        },
      ],
    });

    expect(labels.get("job-created")).toBe("Created by Rater");
    expect(labels.get("job-duplicate")).toBe("Sent to Rater");
    expect(labels.get("job-formal")).toBe("Sent to Rater");
    expect(labels.has("job-unattached")).toBe(false);
  });

  it("keeps the shell and portal pages wired without exposing private billing data in the partner work surface", () => {
    const layoutSource = readFileSync(resolve(__dirname, "../../../app/layout.tsx"), "utf-8");
    const mobileShellSource = readFileSync(resolve(__dirname, "../../../components/layout/MobileShellMenu.tsx"), "utf-8");
    const portalSource = readFileSync(resolve(__dirname, "../../../app/portal/page.tsx"), "utf-8");
    const portalJobsSource = readFileSync(resolve(__dirname, "../../../app/portal/jobs/page.tsx"), "utf-8");

    expect(layoutSource).toContain("shouldShowPortalMenuItem");
    expect(layoutSource).toContain("const hasExistingPortalAccess = access.hasExistingPortalAccess");
    expect(layoutSource).toContain("hasActiveAppAccess: access.hasActiveAppAccess");
    expect(layoutSource).toContain("Compliance Matters Portal");
    expect(layoutSource).toContain("hasPortalAccess={showPortalMenuItem}");
    expect(mobileShellSource).toContain("hasPortalAccess: boolean;");
    expect(mobileShellSource).toContain("{hasPortalAccess ? (");
    expect(mobileShellSource).toContain('<Link href="/portal"');
    expect(mobileShellSource).toContain("Compliance Matters Portal");
    expect(portalSource).toContain("sourceLabel={partnerWorkSourceLabelByJobId.get(String(j.id)) ?? \"Created by Rater\"}");
    expect(portalJobsSource).toContain("sourceLabel={partnerWorkSourceLabelByJobId.get(String(j.id)) ?? \"Created by Rater\"}");
    expect(portalSource).not.toContain("invoice_number");
    expect(portalSource).not.toContain("payment_intent");
    // "stripe" may appear in a benign module import path (billing availability
    // gating), but no Stripe billing data fields may be read or rendered here.
    const portalSourceStripeReferences = portalSource
      .split("\n")
      .filter((line) => line.toLowerCase().includes("stripe"))
      .filter((line) => !line.includes('from "@/lib/business/platform-billing-stripe"'));
    expect(portalSourceStripeReferences).toEqual([]);
    expect(portalJobsSource).not.toContain("invoice_number");
    expect(portalJobsSource).not.toContain("payment_intent");
    expect(portalJobsSource).not.toContain("stripe");
  });
});
