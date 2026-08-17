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

/** Table-keyed fake with the chain shape these resolvers use. */
function makeAdmin(tables: Record<string, any>) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        async maybeSingle() {
          const entry = tables[table];
          if (entry === undefined) return { data: null, error: null };
          if (entry instanceof Error) return { data: null, error: entry };
          return { data: entry, error: null };
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

describe("resolveTwilioAccountForOwner", () => {
  it("prefers the tenant's subaccount", async () => {
    const admin = makeAdmin({ sms_provider_subaccount_credentials: credentialRow() });
    const account = await resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" });
    expect(account).toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
  });

  it("falls back to the platform account when there is no subaccount", async () => {
    // This is every tenant provisioned before this lane, plus the platform's
    // own concierge setup — their behavior must be unchanged.
    const admin = makeAdmin({ sms_provider_subaccount_credentials: null });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toEqual({ accountSid: PLATFORM_SID, authToken: "platform-token", isSubaccount: false });
  });

  it("returns null when Twilio is not configured at all", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    const admin = makeAdmin({ sms_provider_subaccount_credentials: null });
    await expect(
      resolveTwilioAccountForOwner({ admin, accountOwnerUserId: "owner-1" }),
    ).resolves.toBeNull();
  });
});

describe("inbound webhook key selection", () => {
  it("selects the subaccount that owns the receiving number", async () => {
    const admin = makeAdmin({
      sms_sender_identities: { account_owner_user_id: "owner-1" },
      sms_provider_subaccount_credentials: credentialRow(),
    });
    const account = await resolveTwilioAccountForInboundNumber({ admin, toPhoneE164: "+12095550100" });
    expect(account).toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
  });

  it("uses the platform token for an unknown number", async () => {
    // An unrecognized To cannot pick a tenant key; the platform token is the
    // only candidate, and a forged request still fails the signature check.
    const admin = makeAdmin({ sms_sender_identities: null });
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
  it("selects the account that sent the message", async () => {
    const admin = makeAdmin({
      sms_provider_deliveries: { account_owner_user_id: "owner-1" },
      sms_provider_subaccount_credentials: credentialRow(),
    });
    const account = await resolveTwilioAccountForMessageSid({ admin, messageSid: "SM123" });
    expect(account).toMatchObject({ accountSid: SUB_SID, isSubaccount: true });
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
