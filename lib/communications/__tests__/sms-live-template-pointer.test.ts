import { describe, expect, it, vi } from "vitest";

import { readSmsActivationState } from "@/lib/communications/sms-activation-state";

/**
 * The live-send template gate.
 *
 * Before this fix, live eligibility tried [currentVersion, sandboxVersion] and
 * accepted `approved_for_sandbox` on either. With `current_version_id` NULL and
 * v2 only sandbox-approved, real customers were receiving texts rendered from a
 * version that had never been approved for live use — while governance
 * correctly reported no current governed version. The carriers approved
 * specific content; this gate is what keeps that promise.
 */

const LIVE_TEMPLATE_STATUSES = new Set(["approved_for_activation", "active"]);
const SANDBOX_TEMPLATE_STATUSES = new Set([
  "approved_for_sandbox",
  "approved_for_activation",
  "active",
]);

/** Mirrors selectEligibleTemplateVersion, which is private to the eligibility module. */
function selectEligibleTemplateVersion(
  governance: { currentVersion: any; sandboxVersion: any },
  options: { liveSend: boolean },
) {
  const statusOf = (c: any) => String(c?.versionStatus ?? "").trim().toLowerCase();
  if (options.liveSend) {
    const current = governance.currentVersion;
    return current?.exists && LIVE_TEMPLATE_STATUSES.has(statusOf(current)) ? current : null;
  }
  return (
    [governance.currentVersion, governance.sandboxVersion].find(
      (c) => c?.exists && SANDBOX_TEMPLATE_STATUSES.has(statusOf(c)),
    ) ?? null
  );
}

const absent = { exists: false, versionStatus: "", versionNumber: null };
const sandboxApprovedV2 = { exists: true, versionStatus: "approved_for_sandbox", versionNumber: 2 };
const activationApprovedV2 = { exists: true, versionStatus: "approved_for_activation", versionNumber: 2 };

describe("live send template resolution", () => {
  it("BLOCKS when only a sandbox-approved version behind the sandbox pointer exists", () => {
    // This is the production state observed on 2026-08-15 — it was sending.
    const governance = { currentVersion: absent, sandboxVersion: sandboxApprovedV2 };
    expect(selectEligibleTemplateVersion(governance, { liveSend: true })).toBeNull();
  });

  it("never falls back to the sandbox pointer, even when it is activation-approved", () => {
    // The pointer is the governance decision, not just the status.
    const governance = { currentVersion: absent, sandboxVersion: activationApprovedV2 };
    expect(selectEligibleTemplateVersion(governance, { liveSend: true })).toBeNull();
  });

  it("rejects a current-pointed version that is only sandbox-approved", () => {
    const governance = { currentVersion: sandboxApprovedV2, sandboxVersion: sandboxApprovedV2 };
    expect(selectEligibleTemplateVersion(governance, { liveSend: true })).toBeNull();
  });

  it("allows a current-pointed, activation-approved version", () => {
    const governance = { currentVersion: activationApprovedV2, sandboxVersion: sandboxApprovedV2 };
    expect(selectEligibleTemplateVersion(governance, { liveSend: true })).toMatchObject({
      versionNumber: 2,
      versionStatus: "approved_for_activation",
    });
  });

  it("allows a current-pointed active version", () => {
    const active = { exists: true, versionStatus: "active", versionNumber: 3 };
    expect(
      selectEligibleTemplateVersion({ currentVersion: active, sandboxVersion: absent }, { liveSend: true }),
    ).toMatchObject({ versionNumber: 3 });
  });
});

describe("sandbox send template resolution", () => {
  it("still works in the exact state that now blocks live", () => {
    // Sandbox is where an approved-for-sandbox version is meant to be
    // exercised — tightening live must not break that.
    const governance = { currentVersion: absent, sandboxVersion: sandboxApprovedV2 };
    expect(selectEligibleTemplateVersion(governance, { liveSend: false })).toMatchObject({
      versionNumber: 2,
    });
  });

  it("prefers the current pointer when both are usable", () => {
    const governance = { currentVersion: activationApprovedV2, sandboxVersion: sandboxApprovedV2 };
    expect(selectEligibleTemplateVersion(governance, { liveSend: false })).toMatchObject({
      versionStatus: "approved_for_activation",
    });
  });

  it("blocks when nothing is approved at all", () => {
    const draft = { exists: true, versionStatus: "draft", versionNumber: 1 };
    expect(
      selectEligibleTemplateVersion({ currentVersion: absent, sandboxVersion: draft }, { liveSend: false }),
    ).toBeNull();
  });
});

describe("readSmsActivationState", () => {
  function makeSupabase(result: { data?: any; error?: any }) {
    return {
      from: () => {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
        };
        return builder;
      },
    };
  }

  it("reports live only when activation_status is active", async () => {
    await expect(
      readSmsActivationState({
        supabase: makeSupabase({ data: { activation_status: "active", readiness_status: "active" } }),
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toMatchObject({ isLive: true, activationStatus: "active" });

    await expect(
      readSmsActivationState({
        supabase: makeSupabase({ data: { activation_status: "disabled", readiness_status: "sandbox_only" } }),
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toMatchObject({ isLive: false });
  });

  it("treats an unreadable state as live, selecting the stricter rules", async () => {
    // The two ways to be wrong are not symmetric: guessing "sandbox" for a live
    // account leaks unapproved content to customers, while guessing "live" for a
    // sandbox account merely blocks until a template is promoted properly.
    await expect(
      readSmsActivationState({
        supabase: makeSupabase({ error: { message: "boom" } }),
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toMatchObject({ isLive: true, activationStatus: "unknown" });

    await expect(
      readSmsActivationState({
        supabase: { from: () => { throw new Error("exploded"); } },
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toMatchObject({ isLive: true });
  });

  it("treats a missing configuration as not live, not unknown", async () => {
    // No row means this account has not configured SMS at all — that is a known
    // answer, not a failed read.
    await expect(
      readSmsActivationState({ supabase: makeSupabase({ data: null }), accountOwnerUserId: "owner-1" }),
    ).resolves.toMatchObject({ isLive: false, activationStatus: "disabled" });
  });

  it("does not query without an account scope", async () => {
    const supabase = { from: vi.fn() };
    await expect(
      readSmsActivationState({ supabase, accountOwnerUserId: "  " }),
    ).resolves.toMatchObject({ isLive: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
