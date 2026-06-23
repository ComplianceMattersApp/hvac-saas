import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { canViewFinancialRegister } from "@/lib/auth/financial-access";

const invoiceReportPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/invoices/page.tsx"),
  "utf-8",
);

describe("invoice report page financial access", () => {
  it("uses the financial register gate for the invoice report page", () => {
    expect(invoiceReportPageSource).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(invoiceReportPageSource).toContain('redirectTo: "/reports/dashboard?banner=not_authorized"');
  });

  it("keeps dispatcher and technician roles out of financial report visibility", () => {
    const baseUser = {
      user_id: "staff-1",
      is_active: true,
      account_owner_user_id: "owner-1",
    };

    expect(canViewFinancialRegister({
      actorUserId: "owner-1",
      internalUser: { ...baseUser, user_id: "owner-1", role: "owner" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(true);
    expect(canViewFinancialRegister({
      actorUserId: "admin-1",
      internalUser: { ...baseUser, user_id: "admin-1", role: "admin" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(true);
    expect(canViewFinancialRegister({
      actorUserId: "billing-1",
      internalUser: { ...baseUser, user_id: "billing-1", role: "billing" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(true);
    expect(canViewFinancialRegister({
      actorUserId: "dispatcher-1",
      internalUser: { ...baseUser, user_id: "dispatcher-1", role: "dispatcher" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(false);
    expect(canViewFinancialRegister({
      actorUserId: "tech-1",
      internalUser: { ...baseUser, user_id: "tech-1", role: "technician" },
      resourceAccountOwnerUserId: "owner-1",
    })).toBe(false);
  });
});
