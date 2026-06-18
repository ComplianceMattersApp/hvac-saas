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
    productModeCapture: {
      selectedProductMode: null,
      applyReady: false,
      action: "missing",
      issues: [],
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
    loadOwnerSnapshot: vi.fn(async () => ({
      companyName: "Owner Business",
      ownerDisplayName: "Owner User",
      billingMode: "self_serve",
      planKey: "starter",
      entitlementStatus: "trial",
    })),
    notifyPlatformOwnerSignup: vi.fn(async () => ({
      sent: true,
      recipient: "owner@example.com",
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

function makeProductFormData(intent: string) {
  const formData = makeValidFormData();
  formData.set("product_signup_intent", intent);
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

  it("calls provisioning with public-safe standard preset and product-aware starter defaulting", async () => {
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
        dryRun: false,
      }),
    );
    expect(deps.provision).toHaveBeenCalledWith(
      expect.not.objectContaining({
        starterKitVersion: expect.anything(),
      }),
    );
  });

  it("passes HVAC Service signup intent into provisioning as hvac_service", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          productModeCapture: {
            selectedProductMode: "hvac_service",
            applyReady: true,
            action: "created",
            issues: [],
          },
        }),
      ),
    });

    await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("service"),
      deps,
    );

    expect(deps.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        productMode: "hvac_service",
      }),
    );
    expect(deps.invite).toHaveBeenCalled();
    expect(deps.notifyPlatformOwnerSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPath: "service",
        productMode: "hvac_service",
      }),
    );
  });

  it("passes ECC signup intent into provisioning as ecc_hers", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          productModeCapture: {
            selectedProductMode: "ecc_hers",
            applyReady: true,
            action: "created",
            issues: [],
          },
        }),
      ),
    });

    await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("ecc"),
      deps,
    );

    expect(deps.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        productMode: "ecc_hers",
      }),
    );
    expect(deps.invite).toHaveBeenCalled();
    expect(deps.notifyPlatformOwnerSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPath: "ecc",
        productMode: "ecc_hers",
      }),
    );
  });

  it("passes Cleaning signup intent into provisioning as cleaning_services", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          productModeCapture: {
            selectedProductMode: "cleaning_services",
            applyReady: true,
            action: "created",
            issues: [],
          },
        }),
      ),
    });

    await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("cleaning"),
      deps,
    );

    expect(deps.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        productMode: "cleaning_services",
      }),
    );
    expect(deps.provision).toHaveBeenCalledWith(
      expect.not.objectContaining({
        starterKitVersion: expect.anything(),
      }),
    );
    expect(deps.invite).toHaveBeenCalled();
    expect(deps.notifyPlatformOwnerSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPath: "cleaning",
        productMode: "cleaning_services",
      }),
    );
  });

  it("does not pass product mode for generic signup", async () => {
    const deps = makeDeps();

    await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeValidFormData(),
      deps,
    );

    expect(deps.provision).toHaveBeenCalledWith(
      expect.not.objectContaining({
        productMode: expect.anything(),
      }),
    );
    expect(deps.notifyPlatformOwnerSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPath: "generic",
      }),
    );
  });

  it("rejects invalid signup product intents before provisioning", async () => {
    const deps = makeDeps();

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("hybrid"),
      deps,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("selected signup path");
    expect(deps.provision).not.toHaveBeenCalled();
    expect(deps.invite).not.toHaveBeenCalled();
  });

  it("blocks product-specific success when product mode capture fails", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          status: "failed",
          errors: [
            {
              code: "ACCOUNT_SETTINGS_WRITE_FAILED",
              stage: "account_settings",
              message: "Failed to write account_settings product mode.",
            },
          ],
        }),
      ),
    });

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("service"),
      deps,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("product setup");
    expect(deps.log).toHaveBeenCalledWith(
      "self-serve onboarding provisioning failed",
      expect.objectContaining({
        errorCodes: ["ACCOUNT_SETTINGS_WRITE_FAILED"],
        errors: [
          {
            code: "ACCOUNT_SETTINGS_WRITE_FAILED",
            stage: "account_settings",
            message: "Failed to write account_settings product mode.",
          },
        ],
      }),
    );
    expect(deps.invite).not.toHaveBeenCalled();
    expect(deps.notifyPlatformOwnerSignup).not.toHaveBeenCalled();
  });

  it("blocks product-specific success when provisioning captures a different mode", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          productModeCapture: {
            selectedProductMode: "ecc_hers",
            applyReady: true,
            action: "created",
            issues: [],
          },
        }),
      ),
    });

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("service"),
      deps,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("product setup");
    expect(deps.invite).not.toHaveBeenCalled();
    expect(deps.notifyPlatformOwnerSignup).not.toHaveBeenCalled();
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
    expect(deps.notifyPlatformOwnerSignup).toHaveBeenCalled();
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
    expect(deps.notifyPlatformOwnerSignup).not.toHaveBeenCalled();
  });

  it("logs notification failures but still returns submitted state", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          productModeCapture: {
            selectedProductMode: "hvac_service",
            applyReady: true,
            action: "created",
            issues: [],
          },
        }),
      ),
      notifyPlatformOwnerSignup: vi.fn(async () => {
        throw new Error("notification transport failure");
      }),
    });

    const result = await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("service"),
      deps,
    );

    expect(result.status).toBe("submitted");
    expect(deps.notifyPlatformOwnerSignup).toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      "self-serve onboarding platform owner notification failed",
      expect.objectContaining({
        email: "owner@example.com",
      }),
    );
  });

  it("does not send platform owner notification when provisioning fails", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningResult({
          status: "failed",
          errors: [
            {
              code: "AUTH_CREATE_FAILED",
              stage: "auth",
              message: "create user failed",
            },
          ],
        }),
      ),
    });

    await submitSelfServeOnboardingForm(
      INITIAL_SELF_SERVE_ONBOARDING_STATE,
      makeProductFormData("service"),
      deps,
    );

    expect(deps.notifyPlatformOwnerSignup).not.toHaveBeenCalled();
  });
});
