import { describe, expect, it } from "vitest";
import {
  isPlatformOwnerActor,
  resolvePlatformOwnerConfig,
  resolvePlatformOwnerSignupNotificationRecipient,
} from "@/lib/business/platform-owner-access";

function env(overrides: Record<string, string>) {
  return {
    NODE_ENV: "test",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

describe("platform owner access", () => {
  it("allows exact allowlisted email", () => {
    expect(
      isPlatformOwnerActor({
        email: "eddie@compliancemattersca.com",
        env: env({
          PLATFORM_OWNER_EMAILS: "eddie@compliancemattersca.com",
        }),
      }),
    ).toBe(true);
  });

  it("allows exact allowlisted user id", () => {
    expect(
      isPlatformOwnerActor({
        userId: "owner-user-id",
        env: env({
          PLATFORM_OWNER_USER_IDS: "owner-user-id",
        }),
      }),
    ).toBe(true);
  });

  it("denies normal tenant admin when not allowlisted", () => {
    expect(
      isPlatformOwnerActor({
        userId: "tenant-admin-id",
        email: "admin@tenant.test",
        env: env({
          PLATFORM_OWNER_EMAILS: "owner@example.com",
          PLATFORM_OWNER_USER_IDS: "owner-user-id",
        }),
      }),
    ).toBe(false);
  });

  it("denies hybrid-mode tenant identity when not allowlisted", () => {
    expect(
      isPlatformOwnerActor({
        userId: "hybrid-user-id",
        email: "hybrid@tenant.test",
        env: env({
          PLATFORM_OWNER_EMAILS: "owner@example.com",
        }),
      }),
    ).toBe(false);
  });

  it("fails closed when allowlist env is missing", () => {
    expect(
      isPlatformOwnerActor({
        userId: "owner-user-id",
        email: "owner@example.com",
        env: env({}),
      }),
    ).toBe(false);
  });

  it("handles comma-separated values and email casing", () => {
    const config = resolvePlatformOwnerConfig(env({
      PLATFORM_OWNER_EMAILS: "  First@Example.com, second@example.com  ",
      PLATFORM_OWNER_USER_IDS: " user-1, user-2 ",
    }));

    expect(config.emailAllowlist.has("first@example.com")).toBe(true);
    expect(config.emailAllowlist.has("second@example.com")).toBe(true);
    expect(config.userIdAllowlist.has("user-1")).toBe(true);
    expect(config.userIdAllowlist.has("user-2")).toBe(true);

    expect(
      isPlatformOwnerActor({
        email: "FIRST@EXAMPLE.COM",
        env: env({
          PLATFORM_OWNER_EMAILS: "first@example.com, second@example.com",
        }),
      }),
    ).toBe(true);
  });

  it("resolves signup notify recipient from explicit env", () => {
    const recipient = resolvePlatformOwnerSignupNotificationRecipient(env({
      PLATFORM_OWNER_SIGNUP_NOTIFY_EMAIL: "notify@example.com",
      PLATFORM_OWNER_EMAILS: "fallback@example.com",
    }));

    expect(recipient).toBe("notify@example.com");
  });

  it("falls back to first allowlisted email for notify recipient", () => {
    const recipient = resolvePlatformOwnerSignupNotificationRecipient(env({
      PLATFORM_OWNER_EMAILS: "first@example.com, second@example.com",
    }));

    expect(recipient).toBe("first@example.com");
  });
});
