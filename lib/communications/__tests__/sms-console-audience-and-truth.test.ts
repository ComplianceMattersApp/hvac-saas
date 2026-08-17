import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  SMS_ADVANCED_CONSOLE_ALLOWLIST_ENV,
  isSmsAdvancedConsoleEnabledForAccountOwner,
} from "@/lib/communications/sms-self-serve-gate";

const page = readFileSync(resolve(process.cwd(), "app/ops/admin/communications/page.tsx"), "utf8");
const readiness = readFileSync(
  resolve(process.cwd(), "lib/communications/sms-provider-readiness-read.ts"),
  "utf8",
);

describe("advanced console gate", () => {
  it("is closed by default, for everyone", () => {
    // The console asks for Messaging Service SIDs and exposes review
    // machinery — a tenant admin seeing it learns nothing and can break things.
    expect(isSmsAdvancedConsoleEnabledForAccountOwner("owner-1", "")).toBe(false);
    expect(isSmsAdvancedConsoleEnabledForAccountOwner("owner-1", null)).toBe(false);
  });

  it("opens only for a listed account", () => {
    expect(isSmsAdvancedConsoleEnabledForAccountOwner("owner-1", "owner-1,owner-2")).toBe(true);
    expect(isSmsAdvancedConsoleEnabledForAccountOwner("owner-3", "owner-1,owner-2")).toBe(false);
  });

  it("denies a blank account id", () => {
    expect(isSmsAdvancedConsoleEnabledForAccountOwner("", "owner-1")).toBe(false);
    expect(isSmsAdvancedConsoleEnabledForAccountOwner(null, "owner-1")).toBe(false);
  });

  it("reads its own env var, separate from the self-serve gate", () => {
    expect(SMS_ADVANCED_CONSOLE_ALLOWLIST_ENV).toBe("ENABLE_SMS_ADVANCED_CONSOLE_ACCOUNT_OWNER_IDS");
  });
});

describe("communications page audience split", () => {
  it("gates every engineering section", () => {
    // Seven sections, each wrapped — SID fields, governance machinery, the
    // sandbox queue, and the compliance checklist.
    expect(page.split("{advancedConsole ? (").length - 1).toBe(7);
    expect(page).toContain("const advancedConsole = isSmsAdvancedConsoleEnabledForAccountOwner(");
  });

  it("leaves the tenant-facing sections ungated", () => {
    // Status, on-the-way template text, live activation, and suppressions must
    // render for every tenant admin.
    for (const marker of [
      "{/* Communications Status Section */}",
      "{/* On-The-Way Notification Section */}",
      "{/* Live Activation Section */}",
      "{/* Suppressions Section */}",
      "{/* Activation Status Section */}",
    ]) {
      const index = page.indexOf(marker);
      expect(index, `${marker} missing`).toBeGreaterThan(-1);
      const following = page.slice(index, index + 200);
      expect(following, `${marker} should not be gated`).not.toContain("advancedConsole ? (");
    }
  });

  it("reads activation truth from the shared helper", () => {
    // Same read as the live-send gate, so the page cannot claim something the
    // send path contradicts.
    expect(page).toContain("readSmsActivationState");
  });
});

describe("readiness truth derivation", () => {
  it("no longer types the activation summary as a literal", () => {
    // It was `status: "disabled"` — a literal type that could never report
    // anything else, which is why a live account's page said SMS was off.
    expect(readiness).not.toContain('status: "disabled";');
    expect(readiness).toContain("const liveSendsEnabled = Boolean(liveConfiguration);");
  });

  it("derives both summaries from the configuration rows", () => {
    expect(readiness).toContain("result.communicationsStatus = {");
    expect(readiness).toContain("result.activationSummary = {");
    expect(readiness).toContain('"Live SMS is enabled"');
  });

  it("stops claiming shipped controls are deferred", () => {
    // Webhook signature validation, sandbox validation, quiet hours and
    // explicit activation were all marked Deferred/Disabled while running.
    const checklistTail = readiness.slice(readiness.indexOf("result.complianceChecklist = ["));
    expect(checklistTail).toContain('key: "provider_webhook_signature_validation"');
    expect(checklistTail).toMatch(/provider_webhook_signature_validation[\s\S]{0,120}"complete"/);
    // Rows that cannot be derived are deleted rather than asserted.
    expect(checklistTail).not.toContain('key: "quiet_hours_send_gate"');
    expect(checklistTail).not.toContain('key: "template_governance"');
    expect(checklistTail).not.toContain('key: "legal_provider_review"');
  });

  it("ties explicit activation to real state", () => {
    expect(readiness).toContain('status: liveSendsEnabled ? "complete" : "disabled"');
  });
});

describe("WU3 wizard surface", () => {
  const wizard = readFileSync(
    resolve(process.cwd(), "app/ops/admin/communications/provisioning/page.tsx"),
    "utf8",
  );
  const actions = readFileSync(resolve(process.cwd(), "lib/actions/sms-provisioning-actions.ts"), "utf8");

  it("is unreachable for a non-entitled account", () => {
    // Every step spends money, so the surface itself must not exist without
    // entitlement — not merely the buttons.
    expect(wizard).toContain("if (!isSmsSelfServeEnabledForAccountOwner(accountOwnerUserId))");
    expect(wizard).toContain('redirect("/ops/admin/communications")');
    // And the assert sits in the shared action context, not per call site.
    expect(actions).toContain("assertSmsSelfServeEnabledForAccountOwner(accountOwnerUserId)");
  });

  it("branches on EIN and warns registered businesses off the sole-prop path", () => {
    expect(wizard).toContain('name="has_ein"');
    expect(wizard).toMatch(/registered LLC or corporation, you must choose Yes/i);
  });

  it("labels the legal name against the IRS letter", () => {
    // The single most common brand rejection.
    expect(wizard).toMatch(/CP&nbsp;575 or 147c/);
  });

  it("renders failures as first-class states with Retry and Edit", () => {
    expect(wizard).toContain("retrySmsProvisioningStepFromForm");
    expect(wizard).toContain("Retry this step");
    expect(wizard).toContain("Edit details");
    expect(wizard).toContain("lastError.fieldFailures");
  });

  it("carries the newly-issued-EIN explanation", () => {
    expect(wizard).toMatch(/30 to 90 days/);
  });

  it("offers the sole-proprietor OTP resend", () => {
    expect(wizard).toContain("resendSmsProvisioningOtpFromForm");
    expect(wizard).toContain("Resend verification code");
  });

  it("sets plain-language expectations on carrier review", () => {
    expect(wizard).toMatch(/up to about two weeks/i);
  });

  it("never clears a Twilio reference on retry", () => {
    // Clearing a ref would re-run a step whose money is already spent.
    const retryBody = actions.slice(actions.indexOf("export async function retrySmsProvisioningStepFromForm"));
    expect(retryBody).toContain("last_error: null");
    for (const ref of ["subaccount_sid", "phone_number_sid", "brand_registration_sid", "campaign_sid"]) {
      expect(retryBody.slice(0, retryBody.indexOf("redirect("))).not.toContain(ref);
    }
  });
});

describe("tenant-facing test recipients", () => {
  it("renders outside the gated console", () => {
    // A tenant cannot honestly sign the activation attestations without having
    // texted themselves first, so this must not require the advanced console.
    const index = page.indexOf("{/* Test Recipients Section (tenant-facing) */}");
    expect(index).toBeGreaterThan(-1);
    expect(page.slice(index, index + 300)).not.toContain("advancedConsole ? (");
    expect(page).toContain("addSmsSandboxTestRecipientFromForm");
    expect(page).toContain("deactivateSmsSandboxTestRecipientFromForm");
  });

  it("shows no SIDs in the tenant-facing section", () => {
    const start = page.indexOf("{/* Test Recipients Section (tenant-facing) */}");
    const section = page.slice(start, page.indexOf("{/* Live Activation Section */}"));
    // Simple view only: nothing that asks for or displays a provider reference.
    for (const forbidden of [
      "Messaging Service SID",
      "provider_account_ref",
      "messaging_service_ref",
      "default_messaging_service_ref",
    ]) {
      expect(section, `tenant section must not expose ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("offers the wizard entry only to entitled accounts", () => {
    expect(page).toContain("{selfServeEnabled ? (");
    expect(page).toContain("/ops/admin/communications/provisioning");
  });
});

describe("activation attestations persist", () => {
  it("writes all three attestation timestamps and the attesting user", () => {
    const setup = readFileSync(resolve(process.cwd(), "lib/actions/sms-provider-setup-actions.ts"), "utf8");
    for (const column of [
      "activation_attested_campaign_approved_at",
      "activation_attested_wording_reviewed_at",
      "activation_attested_stop_tested_at",
      "activation_attested_by_user_id",
    ]) {
      expect(setup).toContain(column);
    }
  });
});
