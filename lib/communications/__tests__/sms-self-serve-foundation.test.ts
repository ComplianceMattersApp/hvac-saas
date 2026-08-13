import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  SMS_SELF_SERVE_ALLOWLIST_ENV,
  assertSmsSelfServeEnabledForAccountOwner,
  isSmsSelfServeEnabledForAccountOwner,
  parseSmsSelfServeEnabledAccountOwnerIds,
} from "@/lib/communications/sms-self-serve-gate";
import {
  decryptSmsCredential,
  encryptSmsCredential,
  hasSmsCredentialsEncryptionKey,
} from "@/lib/communications/sms-credentials-encryption";

const KEY = "a".repeat(64);
const original = process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = original;
});

describe("self-serve entitlement gate", () => {
  it("allows only listed account owners", () => {
    expect(isSmsSelfServeEnabledForAccountOwner("owner-1", "owner-1,owner-2")).toBe(true);
    expect(isSmsSelfServeEnabledForAccountOwner("owner-3", "owner-1,owner-2")).toBe(false);
  });

  it("denies when the allowlist is empty or unset", () => {
    // Every wizard step costs real money the moment it runs — a number is
    // ~$1.15/mo on purchase and a brand fee is non-refundable — so the default
    // has to be closed.
    expect(isSmsSelfServeEnabledForAccountOwner("owner-1", "")).toBe(false);
    expect(isSmsSelfServeEnabledForAccountOwner("owner-1", null)).toBe(false);
  });

  it("denies a blank or missing account id", () => {
    expect(isSmsSelfServeEnabledForAccountOwner("", "owner-1")).toBe(false);
    expect(isSmsSelfServeEnabledForAccountOwner(null, "owner-1")).toBe(false);
    expect(isSmsSelfServeEnabledForAccountOwner(undefined, "owner-1")).toBe(false);
  });

  it("tolerates whitespace and empty entries in the env value", () => {
    expect([...parseSmsSelfServeEnabledAccountOwnerIds(" owner-1 , ,owner-2 ")]).toEqual([
      "owner-1",
      "owner-2",
    ]);
  });

  it("throws for a non-entitled account", () => {
    expect(() => assertSmsSelfServeEnabledForAccountOwner("owner-3", undefined, "owner-1")).toThrow(
      /not enabled/i,
    );
    expect(() =>
      assertSmsSelfServeEnabledForAccountOwner("owner-1", undefined, "owner-1"),
    ).not.toThrow();
  });

  it("names the env var it reads, matching the permit-workflow gate", () => {
    expect(SMS_SELF_SERVE_ALLOWLIST_ENV).toBe("ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS");
  });
});

describe("subaccount credential encryption", () => {
  it("round-trips a token", () => {
    process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
    const encrypted = encryptSmsCredential("sub-auth-token");
    expect(encrypted).not.toContain("sub-auth-token");
    expect(decryptSmsCredential(encrypted)).toBe("sub-auth-token");
  });

  it("produces a different ciphertext each time", () => {
    process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
    expect(encryptSmsCredential("same")).not.toBe(encryptSmsCredential("same"));
  });

  it("fails on tampering rather than returning garbage", () => {
    process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
    const [iv, tag, ciphertext] = encryptSmsCredential("token").split(":");
    const tampered = `${iv}:${tag}:${ciphertext.replace(/.$/, (c) => (c === "0" ? "1" : "0"))}`;
    expect(() => decryptSmsCredential(tampered)).toThrow();
  });

  it("rejects a malformed stored value", () => {
    process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
    expect(() => decryptSmsCredential("not-a-credential")).toThrow(/Invalid encrypted credential/);
  });

  it("requires a 32-byte key", () => {
    process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = "abcd";
    expect(() => encryptSmsCredential("token")).toThrow(/32 bytes/);
    delete process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptSmsCredential("token")).toThrow(/is not set/);
  });

  it("reports key availability without throwing", () => {
    process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
    expect(hasSmsCredentialsEncryptionKey()).toBe(true);
    delete process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;
    expect(hasSmsCredentialsEncryptionKey()).toBe(false);
  });

  it("uses its own key, separate from the QBO one", () => {
    // A key rotation on one lane must never invalidate the other's ciphertext.
    const source = readFileSync(
      resolve(process.cwd(), "lib/communications/sms-credentials-encryption.ts"),
      "utf8",
    );
    expect(source).toContain("SMS_CREDENTIALS_ENCRYPTION_KEY");
    expect(source).not.toContain("QBO_ENCRYPTION_KEY");
  });
});

describe("provisioning migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260813120000_sms_self_serve_provisioning_foundation.sql"),
    "utf8",
  );

  it("enables RLS on both sensitive tables with no policies at all", () => {
    // EIN and an encrypted auth token live here. RLS on with zero policies
    // denies every authenticated read; service-role is the only way in.
    for (const table of ["sms_provisioning_registrations", "sms_provider_subaccount_credentials"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).not.toContain(`CREATE POLICY ${table}_select`);
    }
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*sms_provisioning_registrations/);
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*sms_provider_subaccount_credentials/);
  });

  it("is additive — no destructive statements", () => {
    expect(migration).not.toMatch(/\bDROP TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP COLUMN\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
  });

  it("forbids an EIN on the sole-proprietor path", () => {
    expect(migration).toContain("sms_provisioning_registrations_sole_prop_has_no_ein_chk");
  });

  it("allows only one in-flight registration per account", () => {
    expect(migration).toContain("sms_provisioning_registrations_active_account_uidx");
    expect(migration).toContain("WHERE completed_at IS NULL");
  });

  it("persists the three activation attestations", () => {
    for (const column of [
      "activation_attested_campaign_approved_at",
      "activation_attested_wording_reviewed_at",
      "activation_attested_stop_tested_at",
      "activation_attested_by_user_id",
    ]) {
      expect(migration).toContain(column);
    }
  });
});
