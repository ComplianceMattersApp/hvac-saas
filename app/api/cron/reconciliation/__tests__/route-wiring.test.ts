import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(__dirname, "../route.ts"), "utf8");

describe("nightly reconciliation account coverage", () => {
  it("enumerates both QuickBooks-connected and Stripe-connected accounts", () => {
    expect(route).toContain('from("qbo_connections")');
    expect(route).toContain('from("internal_business_profiles")');
    expect(route).toContain('not("stripe_connected_account_id", "is", null)');
    expect(route).toContain("...(stripeProfiles ?? [])");
  });

  it("fails visibly when account discovery cannot run", () => {
    expect(route).toContain("connectionError");
    expect(route).toContain("stripeProfileError");
    expect(route).toContain("{ status: 500 }");
  });
});
