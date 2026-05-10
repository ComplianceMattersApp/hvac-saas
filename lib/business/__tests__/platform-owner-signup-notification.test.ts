import { describe, expect, it, vi, beforeEach } from "vitest";
import { sendPlatformOwnerSignupNotification } from "@/lib/business/platform-owner-signup-notification";

const sendEmailMock = vi.fn(async (_args: any) => ({ data: { id: "msg_123" }, error: null }));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (args: any) => sendEmailMock(args),
}));

function env(overrides: Record<string, string>) {
  return {
    NODE_ENV: "test",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

describe("platform owner signup notification", () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
  });

  it("sends email when recipient env is configured", async () => {
    const result = await sendPlatformOwnerSignupNotification({
      companyName: "Acme Service",
      ownerEmail: "owner@example.com",
      ownerDisplayName: "Owner User",
      signupPath: "service",
      productMode: "hvac_service",
      billingMode: "self_serve",
      entitlementStatus: "trial",
      planKey: "starter",
      accountOwnerUserId: "owner-1",
      inviteStatus: "invite_sent",
      timestampIso: "2026-05-10T00:00:00.000Z",
      env: env({
        PLATFORM_OWNER_SIGNUP_NOTIFY_EMAIL: "notify@example.com",
      }),
    });

    expect(result).toEqual({ sent: true, recipient: "notify@example.com" });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "notify@example.com",
        subject: expect.stringContaining("Acme Service"),
      }),
    );
  });

  it("returns not sent when no valid recipient is available", async () => {
    const result = await sendPlatformOwnerSignupNotification({
      companyName: "Acme Service",
      ownerEmail: "owner@example.com",
      ownerDisplayName: "Owner User",
      signupPath: "generic",
      productMode: null,
      billingMode: null,
      entitlementStatus: null,
      planKey: null,
      accountOwnerUserId: "owner-1",
      inviteStatus: "invite_sent",
      timestampIso: "2026-05-10T00:00:00.000Z",
      env: env({}),
    });

    expect(result).toEqual({ sent: false, recipient: null });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
