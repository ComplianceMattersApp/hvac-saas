import { afterEach, describe, expect, it } from "vitest";
import { resolveInviteRedirectTo } from "@/lib/utils/resolve-invite-redirect-to";

const ORIGINAL_ENV = { ...process.env };

describe("resolveInviteRedirectTo", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses APP_URL auth callback when configured", () => {
    process.env.APP_URL = "https://app.example.com";
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.SITE_URL = "";
    process.env.VERCEL_URL = "";

    expect(resolveInviteRedirectTo()).toBe("https://app.example.com/auth/callback");
  });

  it("falls back to the production Compliance Matters auth callback", () => {
    process.env.APP_URL = "";
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.SITE_URL = "";
    process.env.VERCEL_URL = "";
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    expect(resolveInviteRedirectTo()).toBe("https://app.compliancemattersca.com/auth/callback");
  });
});
