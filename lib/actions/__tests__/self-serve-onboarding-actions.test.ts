import { describe, expect, it, vi } from "vitest";
import { submitSelfServeOnboardingForm } from "@/lib/actions/self-serve-onboarding-actions";
import {
  INITIAL_SELF_SERVE_ONBOARDING_STATE,
  type SelfServeOnboardingDeps,
} from "@/lib/actions/self-serve-onboarding-state";
import type { FirstOwnerProvisioningResult } from "@/lib/business/first-owner-provisioning";

function makeProvisioningResult(
  overrides?: Partial<FirstOwnerProvisioningResult>,
): FirstOwnerProvisioningResult {
  return {
    status: "provisioned",
    accountOwnerUserId: "owner-1",
    authUserId: "owner-1",
    recordsCreated: ["auth_user"],
    recordsConfirmed: [],
    recordsPatched: [],
    inviteIntent: {
      shouldSendInvite: true,
      email: "owner@example.com",
      authUserId: "owner-1",
      reason: "ready_for_invite",
    },
    pricebookSeeding: null,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<SelfServeOnboardingDeps>): SelfServeOnboardingDeps {
  return {
    provision: vi.fn(async () => makeProvisioningResult()),
    invite: vi.fn(async () => ({
      inviteSent: true,
      warnings: [],
      errors: [],
    })),
    log: vi.fn(),
    ...overrides,
  };
}

function makeValidFormData() {
  const formData = new FormData();
  formData.set("email", "Owner@Example.com");
  formData.set("owner_display_name", "Owner User");
  formData.set("business_display_name", "Owner Business");
  return formData;
}

describe("submitSelfServeOnboardingForm", () => {
  it("validates required fields", async () => {
    const deps = makeDeps();
    const formData = new FormData();
    formData.set("email", "not-an-email");

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      formData,
      deps,
    );

    expect(result.status).toBe("invalid");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(result.fieldErrors?.ownerDisplayName).toBeTruthy();
    expect(result.fieldErrors?.businessDisplayName).toBeTruthy();
    expect(deps.provision).not.toHaveBeenCalled();
    expect(deps.invite).not.toHaveBeenCalled();
  });

  it("calls provisioning with public-safe standard preset and v3 starter settings", async () => {
    const deps = makeDeps();

    await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeValidFormData(),
      deps,
    );

    expect(deps.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEmail: "owner@example.com",
        ownerDisplayName: "Owner User",
        businessDisplayName: "Owner Business",
        entitlementPreset: "standard",
        starterKitVersion: "v3",
        dryRun: false,
      }),
    );
  });

  it("uses shared invite orchestration after successful provisioning", async () => {
    const deps = makeDeps();

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeValidFormData(),
      deps,
    );

    expect(result.status).toBe("submitted");
    expect(deps.invite).toHaveBeenCalledWith(
      expect.objectContaining({
        apply: true,
        email: "owner@example.com",
        resendInvite: false,
        authUserId: "owner-1",
        accountOwnerUserId: "owner-1",
      }),
    );
  });

  it("returns neutral submitted response for existing/duplicate email paths", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          status: "confirmed",
          recordsCreated: [],
          recordsConfirmed: ["auth_user", "profiles"],
        }),
      ),
    });

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeValidFormData(),
      deps,
    );

    expect(result.status).toBe("submitted");
    expect(result.message).toContain("If eligible");
  });

  it("fails safely on owner-anchor mismatch without invite/cross-tenant reassignment", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          status: "failed",
          errors: [
            {
              code: "INTERNAL_OWNER_MISMATCH",
              stage: "internal_users",
              message: "Existing internal user is anchored to a different account owner.",
            },
          ],
        }),
      ),
    });

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeValidFormData(),
      deps,
    );

    expect(result.status).toBe("submitted");
    expect(result.message).toContain("If eligible");
    expect(deps.invite).not.toHaveBeenCalled();
  });
});
