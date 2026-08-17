import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveSubaccountCredential,
  resolveTwilioAccountForInboundNumber,
  resolveTwilioAccountForMessageSid,
  resolveTwilioAccountForOwner,
} from "@/lib/communications/sms-account-resolution";
import { encryptSmsCredential } from "@/lib/communications/sms-credentials-encryption";

const KEY = "b".repeat(64);
const PLATFORM_SID = "AC" + "0".repeat(32);
const SUB_SID = "AC" + "9".repeat(32);

/**
 * Table-keyed fake. An array entry answers list queries (awaiting the builder),
 * an object answers maybeSingle, an Error answers both as a query error.
 */
function makeAdmin(tables: Record<string, any>) {
  return {
    from(table: string) {
      const entry = tables[table];
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        async maybeSingle() {
          if (entry === undefined || entry === null) return { data: null, error: null };
          if (entry instanceof Error) return { data: null, error: entry };
          return { data: Array.isArray(entry) ? entry[0] ?? null : entry, error: null };
        },
        then(onFulfilled: (value: { data: any; error: any }) => unknown, onRejected?: any) {
          const value: { data: any; error: any } =
            entry instanceof Error
              ? { data: null, error: entry }
              : { data: entry == null ? [] : Array.isArray(entry) ? entry : [entry], error: null };
          return Promise.resolve(value).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
  process.env.TWILIO_ACCOUNT_SID = PLATFORM_SID;
  process.env.TWILIO_AUTH_TOKEN = "platform-token";
});

afterEach(() => {
  vi.restoreAllMocks();
});

function credentialRow() {
  return {
    subaccount_sid: SUB_SID,
    auth_token_encrypted: encryptSmsCredential("subaccount-token"),
  };
}

/** A provider configuration whose traffic runs under the tenant's subaccount. */
function subaccountConfigRow() {
  return { provider_environment: "production", provider_account_ref: SUB_SID };
}

describe("resolveSubaccountCredential", () => {
  it("decrypts a stored subaccount token", async () => {
    const admin = makeAdmin({ sms_provider_subaccount_credentials: credentialRow() });
    await expect(
      resolveSubaccountCredential({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toEqual({ accountSid: SUB_SID, authToken: "subaccount-token", isSubaccount: true });
  });

  it("returns null when the account has no subaccount", async () => {
    const admin = makeAdmin({ sms_provider_subaccount_credentials: null });
    await expect(
      resolveSubaccountCredential({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toBeNull();
  });

  it("returns null rather than throwing when the key is missing", async () => {
    // A webhook that 500s makes Twilio retry forever against a route that can
    // never succeed, so every failure here degrades instead of throwing.
    const row = credentialRow(); // encrypt while the key still exists
    delete process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;
    const admin = makeAdmin({ sms_provider_subaccount_credentials: row });
    await expect(
      resolveSubaccountCredential({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toBeNull();
  });

  it("returns null on a corrupt stored credential", async () => {
    const admin = makeAdmin({
      sms_provider_subaccount_credentials: { subaccount_sid: SUB_SID, auth_token_encrypted: "garbage" },
    });
    await expect(
      resolveSubaccountCredential({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toBeNull();
  });

  it("returns null on a database error", async () => {
    const admin = makeAdmin({ sms_provider_subaccount_credentials: new Error("boom") });
    await expect(
      resolveSubaccountCredential({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toBeNull();
  });
});

describe("resolveTwilioAccountForOwner (config-keyed)", () => {
  it("uses the subaccount ONLY when the provider configuration names it", async () => {
    const admin = makeAdmin({
      sms_provider_configurations: [subaccountConfigRow()],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    const account = await resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" });
    expect(account).toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
  });

  it("stays on the platform account while a credential exists but the config does not point at it", async () => {
    // The mid-provisioning window: subaccount created (credential stored) but
    // completion has not written provider_account_ref. Sends still go out via
    // the platform account, so callbacks are signed with the PLATFORM token —
    // resolving the subaccount here would 403 every one of them.
    const admin = makeAdmin({
      sms_provider_configurations: [{ provider_environment: "production", provider_account_ref: null }],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toMatchObject({ accountSid: PLATFORM_SID, isSubaccount: false });
  });

  it("falls back to the platform when the config names an account we hold no key for", async () => {
    // Fail closed via the signature check: a key we do not hold cannot verify.
    const admin = makeAdmin({
      sms_provider_configurations: [
        { provider_environment: "production", provider_account_ref: "AC" + "7".repeat(32) },
      ],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toMatchObject({ accountSid: PLATFORM_SID, isSubaccount: false });
  });

  it("prefers the production configuration row when several exist", async () => {
    const admin = makeAdmin({
      sms_provider_configurations: [
        { provider_environment: "sandbox", provider_account_ref: null },
        subaccountConfigRow(),
      ],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
  });

  it("falls back to the platform account when there is no configuration at all", async () => {
    // Every tenant provisioned before this lane — behavior unchanged.
    const admin = makeAdmin({ sms_provider_configurations: [] });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toEqual({ accountSid: PLATFORM_SID, authToken: "platform-token", isSubaccount: false });
  });

  it("returns null when Twilio is not configured at all", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    const admin = makeAdmin({ sms_provider_configurations: [] });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toBeNull();
  });
});

describe("inbound webhook key selection", () => {
  it("selects the subaccount that owns the receiving number", async () => {
    const admin = makeAdmin({
      sms_sender_identities: [{ account_owner_user_id: "owner-1" }],
      sms_provider_configurations: [subaccountConfigRow()],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    const account = await resolveTwilioAccountForInboundNumber({ admin, toPhoneE164: "+12095550100" });
    expect(account).toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
  });

  it("falls back to the platform key when several tenants claim one number", async () => {
    // The model says a number is never shared. If the data disagrees, no tenant
    // is guessed: the platform key is used, so a subaccount-signed request
    // fails the signature check (fail closed) instead of being processed under
    // an arbitrary tenant.
    const admin = makeAdmin({
      sms_sender_identities: [
        { account_owner_user_id: "owner-1" },
        { account_owner_user_id: "owner-2" },
      ],
      sms_provider_configurations: [subaccountConfigRow()],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    await expect(
      resolveTwilioAccountForInboundNumber({ admin, toPhoneE164: "+12095550100" }),
    ).resolves.toMatchObject({ accountSid: PLATFORM_SID, isSubaccount: false });
  });

  it("uses the platform token for an unknown number", async () => {
    // An unrecognized To cannot pick a tenant key; the platform token is the
    // only candidate, and a forged request still fails the signature check.
    const admin = makeAdmin({ sms_sender_identities: [] });
    const account = await resolveTwilioAccountForInboundNumber({ admin, toPhoneE164: "+15550000000" });
    expect(account).toMatchObject({ accountSid: PLATFORM_SID, isSubaccount: false });
  });

  it("uses the platform token when To is absent", async () => {
    const admin = makeAdmin({});
    await expect(
      resolveTwilioAccountForInboundNumber({ admin, toPhoneE164: "" }),
    ).resolves.toMatchObject({ isSubaccount: false });
  });
});

describe("status callback key selection", () => {
  it("selects the subaccount when the sender's configuration runs under it", async () => {
    const admin = makeAdmin({
      sms_provider_deliveries: { account_owner_user_id: "owner-1" },
      sms_provider_configurations: [subaccountConfigRow()],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    const account = await resolveTwilioAccountForMessageSid({ admin, messageSid: "SM123" });
    expect(account).toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
  });

  it("uses the platform token for a tenant still sending via the platform", async () => {
    // Credential stored mid-provisioning, but the config does not name the
    // subaccount yet — their messages were sent (and signed) by the platform.
    const admin = makeAdmin({
      sms_provider_deliveries: { account_owner_user_id: "owner-1" },
      sms_provider_configurations: [
        { provider_environment: "production", provider_account_ref: null },
      ],
      sms_provider_subaccount_credentials: credentialRow(),
    });
    await expect(
      resolveTwilioAccountForMessageSid({ admin, messageSid: "SM123" }),
    ).resolves.toMatchObject({ accountSid: PLATFORM_SID, isSubaccount: false });
  });

  it("uses the platform token for an unknown MessageSid", async () => {
    const admin = makeAdmin({ sms_provider_deliveries: null });
    await expect(
      resolveTwilioAccountForMessageSid({ admin, messageSid: "SM-unknown" }),
    ).resolves.toMatchObject({ accountSid: PLATFORM_SID, isSubaccount: false });
  });

  it("degrades to the platform token on a database error", async () => {
    const admin = makeAdmin({ sms_provider_deliveries: new Error("boom") });
    await expect(
      resolveTwilioAccountForMessageSid({ admin, messageSid: "SM123" }),
    ).resolves.toMatchObject({ isSubaccount: false });
  });
});
