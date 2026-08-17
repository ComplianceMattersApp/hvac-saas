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
