import { describe, expect, it } from "vitest";

import { buildCustomerScheduledEmailHtml } from "@/lib/email/operational-scheduled-email";

describe("buildCustomerScheduledEmailHtml", () => {
  it("renders tenant logo + tenant display name branding, not hardcoded platform logo", () => {
    const html = buildCustomerScheduledEmailHtml({
      customerName: "Pat Lee",
      customerPhone: "555-2222",
      customerEmail: "eddie@compliancemattersca.com",
      serviceAddress: "123 Main St, Town, CA 90001",
      scheduledDate: "May 13, 2026",
      scheduledWindow: "8:00 AM-10:00 AM",
      serviceType: "Maintenance",
      companyName: "Acme HVAC",
      supportDisplayName: "Acme HVAC",
      companyLogoUrl: "https://cdn.example.test/acme-logo.png",
      supportPhone: "555-1111",
      supportEmail: "support@acme.test",
    });

    expect(html).toContain('src="https://cdn.example.test/acme-logo.png"');
    expect(html).toContain("Appointment Scheduled");
    expect(html).toContain("Your appointment is scheduled");
    expect(html).toContain("05-13-2026");
    expect(html).toContain("automated message from Acme HVAC");
    expect(html).not.toContain("Compliance Matters logo");
  });

  it("falls back to tenant company name text when logo is missing", () => {
    const html = buildCustomerScheduledEmailHtml({
      customerName: "Pat Lee",
      customerPhone: null,
      customerEmail: "pat@example.com",
      serviceAddress: "123 Main St, Town, CA 90001",
      scheduledDate: "May 13, 2026",
      scheduledWindow: "8:00 AM-10:00 AM",
      serviceType: null,
      companyName: "Northside Mechanical",
      supportDisplayName: "Northside Mechanical",
      companyLogoUrl: null,
      supportPhone: null,
      supportEmail: null,
    });

    expect(html).toContain("Northside Mechanical");
    expect(html).toContain("Need to make changes? Contact Northside Mechanical.");
    expect(html).not.toContain("Compliance Matters logo");
  });
});
