import { describe, expect, it, vi } from "vitest";
import {
  parseProvisionFirstOwnerArgs,
  runProvisionFirstOwnerScript,
} from "../../scripts/provision-first-owner";
import type { FirstOwnerProvisioningResult } from "../../lib/business/first-owner-provisioning";
import { STARTER_KIT_V1_SEEDS } from "../../lib/business/pricebook-seeding";

function makeProvisioningSuccess(overrides?: Partial<FirstOwnerProvisioningResult>): FirstOwnerProvisioningResult {
  return {
    status: "provisioned",
    accountOwnerUserId: "owner-1",
    authUserId: "owner-1",
    recordsCreated: ["auth_user", "profiles"],
    recordsConfirmed: ["internal_users"],
    recordsPatched: ["platform_account_entitlements"],
    inviteIntent: {
      shouldSendInvite: true,
      email: "owner@example.com",
      authUserId: "owner-1",
      reason: "ready_for_invite",
    },
    pricebookSeeding: {
      inserted_count: STARTER_KIT_V1_SEEDS.length,
      skipped_count: 0,
      inserted_rows: STARTER_KIT_V1_SEEDS.map((seed) => ({
        seed_key: seed.seed_key,
        item_name: seed.item_name,
      })),
      skipped_rows: [],
    },
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<Parameters<typeof runProvisionFirstOwnerScript>[1]>) {
  return {
    env: {
      NODE_ENV: "test",
      ALLOW_FIRST_OWNER_PROVISIONING: "true",
      ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://sandbox.example.test",
      USERNAME: "operator",
      ...(overrides?.env ?? {}),
    } as NodeJS.ProcessEnv,
    provision: vi.fn(async () => makeProvisioningSuccess()),
    getAuthUserById: vi.fn(async () => ({
      id: "owner-1",
      email: "owner@example.com",
      invitedAt: null,
      emailConfirmedAt: null,
    })),
    setUserMetadata: vi.fn(async () => undefined),
    sendInvite: vi.fn(async () => undefined),
    resolveInviteRedirectTo: vi.fn(() => "https://example.test/auth/callback"),
    nowIso: vi.fn(() => "2026-04-25T00:00:00.000Z"),
    ...overrides,
  };
}

describe("parseProvisionFirstOwnerArgs", () => {
  it("parses required and optional args", () => {
    const parsed = parseProvisionFirstOwnerArgs([
      "--email",
      "owner@example.com",
      "--business-display-name",
      "My Company",
      "--owner-display-name",
      "Owner Name",
      "--entitlement-preset",
      "internal_comped",
      "--resend-invite",
      "--apply",
    ]);

    expect(parsed.email).toBe("owner@example.com");
    expect(parsed.businessDisplayName).toBe("My Company");
    expect(parsed.ownerDisplayName).toBe("Owner Name");
    expect(parsed.entitlementPreset).toBe("internal_comped");
    expect(parsed.resendInvite).toBe(true);
    expect(parsed.apply).toBe(true);
  });

  it("defaults entitlement preset to standard", () => {
    const parsed = parseProvisionFirstOwnerArgs([
      "--email",
      "owner@example.com",
      "--business-display-name",
      "My Company",
    ]);

    expect(parsed.entitlementPreset).toBe("standard");
  });

  it("throws on invalid entitlement preset", () => {
    expect(() =>
      parseProvisionFirstOwnerArgs([
        "--email",
        "owner@example.com",
        "--business-display-name",
        "My Company",
        "--entitlement-preset",
        "invalid",
      ]),
    ).toThrow("Invalid --entitlement-preset (expected: standard|internal_comped)");
  });

  it("throws if required args are missing", () => {
    expect(() =>
      parseProvisionFirstOwnerArgs(["--email", "owner@example.com"]),
    ).toThrow("Missing required --business-display-name");
  });
});

describe("runProvisionFirstOwnerScript", () => {
  const baseArgs = {
    email: "owner@example.com",
    businessDisplayName: "My Company",
    entitlementPreset: "standard" as const,
    resendInvite: false,
    apply: false,
  };

  it("dry-run calls helper but does not send invite", async () => {
    const deps = makeDeps();

    const result = await runProvisionFirstOwnerScript(baseArgs, deps);

    expect(result.mode).toBe("dry_run");
    expect(deps.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEmail: "owner@example.com",
        businessDisplayName: "My Company",
        entitlementPreset: "standard",
        dryRun: true,
      }),
    );
    expect(deps.sendInvite).not.toHaveBeenCalled();
    expect(result.inviteSent).toBe(false);
    expect(result.inviteSkippedReason).toBe("dry_run");
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({ inserted_count: STARTER_KIT_V1_SEEDS.length }),
    );
  });

  it("apply mode sends invite after helper success", async () => {
    const deps = makeDeps();
    const args = { ...baseArgs, apply: true };

    const result = await runProvisionFirstOwnerScript(args, deps);

    expect(result.mode).toBe("apply");
    expect(deps.setUserMetadata).toHaveBeenCalledTimes(1);
    expect(deps.setUserMetadata).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        first_owner_provisioning_v1: expect.objectContaining({
          is_first_owner: true,
          account_owner_user_id: "owner-1",
        }),
      }),
    );
    expect(deps.sendInvite).toHaveBeenCalledTimes(1);
    expect(deps.sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        metadata: expect.objectContaining({
          first_owner_provisioning_v1: expect.objectContaining({
            is_first_owner: true,
            account_owner_user_id: "owner-1",
          }),
        }),
      }),
    );
    expect(result.inviteSent).toBe(true);
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({ inserted_count: STARTER_KIT_V1_SEEDS.length }),
    );
  });

  it("apply mode does not send invite if helper fails", async () => {
    const deps = makeDeps({
      provision: vi.fn(async () =>
        makeProvisioningSuccess({
          status: "failed",
          errors: [
            {
              code: "INTERNAL_OWNER_MISMATCH",
              stage: "internal_users",
              message: "mismatch",
            },
          ],
        }),
      ),
    });

    const result = await runProvisionFirstOwnerScript({ ...baseArgs, apply: true }, deps);

    expect(deps.sendInvite).not.toHaveBeenCalled();
    expect(result.inviteSent).toBe(false);
    expect(result.errors[0]?.code).toBe("INTERNAL_OWNER_MISMATCH");
  });

  it("missing allow flag blocks execution", async () => {
    const deps = makeDeps({
      env: {
        NODE_ENV: "test",
        ALLOW_FIRST_OWNER_PROVISIONING: "false",
        ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING: "true",
        NEXT_PUBLIC_SUPABASE_URL: "https://sandbox.example.test",
      } as NodeJS.ProcessEnv,
    });

    const result = await runProvisionFirstOwnerScript({ ...baseArgs, apply: true }, deps);

    expect(result.errors[0]?.code).toBe("ALLOW_FLAG_REQUIRED");
    expect(deps.provision).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("production-like target requires explicit production allow flag", async () => {
    const deps = makeDeps({
      env: {
        NODE_ENV: "test",
        ALLOW_FIRST_OWNER_PROVISIONING: "true",
        ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      } as NodeJS.ProcessEnv,
    });

    const result = await runProvisionFirstOwnerScript({ ...baseArgs, apply: true }, deps);

    expect(result.errors.some((e) => e.code === "PRODUCTION_ALLOW_FLAG_REQUIRED")).toBe(true);
    expect(deps.provision).not.toHaveBeenCalled();
  });

  it("existing invite does not resend unless resend flag is passed", async () => {
    const deps = makeDeps({
      getAuthUserById: vi.fn(async () => ({
        id: "owner-1",
        email: "owner@example.com",
        invitedAt: "2026-04-24T01:00:00.000Z",
        emailConfirmedAt: null,
      })),
    });

    const withoutResend = await runProvisionFirstOwnerScript(
      { ...baseArgs, apply: true, resendInvite: false },
      deps,
    );

    expect(withoutResend.inviteSent).toBe(false);
    expect(withoutResend.inviteSkippedReason).toBe("invite_already_pending");
    expect(deps.sendInvite).not.toHaveBeenCalled();

    const withResend = await runProvisionFirstOwnerScript(
      { ...baseArgs, apply: true, resendInvite: true },
      deps,
    );

    expect(withResend.inviteSent).toBe(true);
    expect(deps.setUserMetadata).toHaveBeenCalledTimes(1);
    expect(deps.sendInvite).toHaveBeenCalledTimes(1);
  });

  it("metadata write failure returns METADATA_WRITE_FAILED and does not send invite", async () => {
    const deps = makeDeps({
      setUserMetadata: vi.fn(async () => { throw new Error("metadata write blocked"); }),
    });

    const result = await runProvisionFirstOwnerScript({ ...baseArgs, apply: true }, deps);

    expect(result.inviteSent).toBe(false);
    expect(result.errors[0]?.code).toBe("METADATA_WRITE_FAILED");
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("invite send failure returns INVITE_SEND_FAILED after metadata is written", async () => {
    const deps = makeDeps({
      sendInvite: vi.fn(async () => { throw new Error("supabase invite rejected"); }),
    });

    const result = await runProvisionFirstOwnerScript({ ...baseArgs, apply: true }, deps);

    expect(result.inviteSent).toBe(false);
    expect(result.errors[0]?.code).toBe("INVITE_SEND_FAILED");
    expect(deps.setUserMetadata).toHaveBeenCalledTimes(1);
  });

  it("structured result includes expected ids and outcome", async () => {
    const deps = makeDeps();

    const result = await runProvisionFirstOwnerScript({ ...baseArgs, apply: true }, deps);

    expect(result).toEqual(
      expect.objectContaining({
        mode: "apply",
        accountOwnerUserId: "owner-1",
        authUserId: "owner-1",
        recordsCreated: expect.any(Array),
        recordsConfirmed: expect.any(Array),
        recordsPatched: expect.any(Array),
        inviteSent: true,
      }),
    );
  });
});
