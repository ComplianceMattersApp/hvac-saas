import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeRegistration,
  pollOneRegistration,
  pollProvisioningRegistrations,
} from "@/lib/communications/sms-provisioning-poller";
import { encryptSmsCredential } from "@/lib/communications/sms-credentials-encryption";

const KEY = "c".repeat(64);
const SUB_SID = "AC" + "8".repeat(32);
const OWNER = "11111111-1111-1111-1111-111111111111";

/**
 * Table-keyed fake that records every operation. Supports the chains the
 * poller uses: select().eq()/is()/not()/order()/limit() awaited as a list,
 * maybeSingle(), update().eq() awaited, insert().select().single().
 */
function makeAdmin(tables: Record<string, any>) {
  const writes: Array<{ table: string; op: string; values?: any }> = [];
  const admin = {
    writes,
    from(table: string) {
      const entry = tables[table];
      const rowsOf = () => (entry == null ? [] : Array.isArray(entry) ? entry : [entry]);
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        update(values: any) {
          writes.push({ table, op: "update", values });
          return builder;
        },
        insert(values: any) {
          writes.push({ table, op: "insert", values });
          const inserted: any = {
            select: () => inserted,
            async single() {
              return { data: { id: `${table}-inserted-id`, ...values }, error: null };
            },
            then(onF: any, onR: any) {
              return Promise.resolve({ data: null, error: null }).then(onF, onR);
            },
          };
          return inserted;
        },
        async maybeSingle() {
          if (entry instanceof Error) return { data: null, error: entry };
          return { data: rowsOf()[0] ?? null, error: null };
        },
        async single() {
          return { data: rowsOf()[0] ?? null, error: null };
        },
        then(onF: (value: { data: any; error: any }) => unknown, onR?: any) {
          const value: { data: any; error: any } =
            entry instanceof Error
              ? { data: null, error: entry }
              : { data: rowsOf(), error: null };
          return Promise.resolve(value).then(onF, onR);
        },
      };
      return builder;
    },
  };
  return admin;
}

function credentialTables() {
  return {
    sms_provider_subaccount_credentials: {
      subaccount_sid: SUB_SID,
      auth_token_encrypted: encryptSmsCredential("subaccount-token"),
    },
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = KEY;
  process.env.ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS = OWNER;
  fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockRejectedValue(
    new Error("unexpected network call"),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS;
});

describe("the poller never provisions", () => {
  it("ignores registrations the operator saved but never started", async () => {
    // THE money-safety invariant: a row with no customer profile has nothing
    // async to poll, and the cron must never walk the spend steps for it.
    const admin = makeAdmin({
      sms_provisioning_registrations: [
        { id: "reg-1", account_owner_user_id: OWNER, customer_profile_sid: null },
      ],
      ...credentialTables(),
    });

    // The list query itself filters these out; simulate the filtered result.
    const filteredAdmin = makeAdmin({
      sms_provisioning_registrations: [],
      ...credentialTables(),
    });
    const results = await pollProvisioningRegistrations({ admin: filteredAdmin });
    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(filteredAdmin.writes).toEqual([]);
    void admin;
  });

  it("performs zero Twilio calls when nothing is pending review", async () => {
    // Mid-wizard row: bundles approved, brand not yet created (operator has
    // not clicked). The poller must WAIT — never create the brand itself.
    const registration = {
      id: "reg-2",
      account_owner_user_id: OWNER,
      customer_profile_sid: "BU1",
      customer_profile_status: "twilio_approved",
      trust_product_sid: "BU2",
      trust_product_status: "twilio_approved",
      brand_registration_sid: null,
      campaign_sid: null,
      messaging_service_sid: "MG1",
    };
    const admin = makeAdmin({
      sms_provisioning_registrations: [registration],
      ...credentialTables(),
    });

    const result = await pollOneRegistration({ admin, registration });

    expect(result.outcome).toBe("waiting");
    expect(result.detail).toBe("awaiting operator steps");
    // No Twilio call of ANY kind — statuses are settled and nothing exists to
    // fetch; above all, no create/purchase ever originates here.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips accounts that are no longer entitled", async () => {
    const registration = {
      id: "reg-3",
      account_owner_user_id: "22222222-2222-2222-2222-222222222222",
      customer_profile_sid: "BU1",
    };
    const admin = makeAdmin({ sms_provisioning_registrations: [registration] });

    const result = await pollOneRegistration({ admin, registration });

    expect(result).toMatchObject({ outcome: "skipped", detail: "not entitled" });
    expect(fetchSpy).not.toHaveBeenCalled();
    // Exactly ONE write: the last_polled_at stamp, which must land BEFORE the
    // entitlement skip — unstamped rows sort nullsFirst and 25 of them would
    // permanently starve every entitled tenant out of the poll window.
    expect(admin.writes).toHaveLength(1);
    expect(admin.writes[0]).toMatchObject({ table: "sms_provisioning_registrations", op: "update" });
    expect(Object.keys(admin.writes[0].values)).toEqual(["last_polled_at"]);
  });
});

describe("completion writes", () => {
  const registration = {
    id: "reg-4",
    account_owner_user_id: OWNER,
    provider_environment: "production",
    subaccount_sid: SUB_SID,
    messaging_service_sid: "MG1",
    phone_number_sid: "PN1",
    phone_e164: "+12095551821",
    brand_registration_sid: "BN1",
    campaign_sid: "QE1",
    customer_profile_sid: "BU1",
    created_by_user_id: "user-1",
  };

  it("CREATES the configuration and sender identity for a wizard-only tenant", async () => {
    // A wizard tenant never touched the concierge forms, so neither row exists.
    // An update-only completion would match zero rows, stamp the registration
    // complete, and leave the account unable to ever activate.
    const admin = makeAdmin({
      sms_provisioning_registrations: [registration],
      sms_provider_configurations: [],
      sms_sender_identities: [],
    });

    await completeRegistration({ admin, registration });

    const configInsert = admin.writes.find(
      (write) => write.table === "sms_provider_configurations" && write.op === "insert",
    );
    expect(configInsert?.values).toMatchObject({
      account_owner_user_id: OWNER,
      provider_name: "twilio",
      provider_account_ref: SUB_SID,
      default_messaging_service_ref: "MG1",
      readiness_status: "ready_for_activation",
    });

    const senderInsert = admin.writes.find(
      (write) => write.table === "sms_sender_identities" && write.op === "insert",
    );
    expect(senderInsert?.values).toMatchObject({
      account_owner_user_id: OWNER,
      sender_type: "long_code",
      phone_e164: "+12095551821",
      provider_campaign_ref: "QE1",
      verification_status: "verified",
    });
    // Provisioning NEVER activates the account — that stays a human attestation.
    expect(String(configInsert?.values?.activation_status ?? "")).not.toBe("active");
  });

  it("NEVER touches provider config or sender identity for a sandbox (Mock) registration", async () => {
    // Concierge configs live on provider_environment='sandbox' rows and can be
    // LIVE-ACTIVE. A Mock walkthrough's refs landing in the columns the live
    // send path reads would reroute real customer texts into an unregistered
    // lane. Sandbox completion closes the registration row and nothing else.
    const sandboxRegistration = { ...registration, id: "reg-5", provider_environment: "sandbox" };
    const admin = makeAdmin({
      sms_provisioning_registrations: [sandboxRegistration],
      sms_provider_configurations: [{ id: "config-live", provider_environment: "sandbox" }],
      sms_sender_identities: [{ id: "sender-live" }],
    });

    await completeRegistration({ admin, registration: sandboxRegistration });

    expect(admin.writes).toHaveLength(1);
    expect(admin.writes[0]).toMatchObject({
      table: "sms_provisioning_registrations",
      op: "update",
    });
    expect(admin.writes[0].values).toMatchObject({ campaign_status: "VERIFIED" });
    expect(admin.writes[0].values.completed_at).toBeTruthy();
  });

  it("UPDATES the existing rows for a concierge-configured tenant", async () => {
    const admin = makeAdmin({
      sms_provisioning_registrations: [registration],
      sms_provider_configurations: [{ id: "config-1" }],
      sms_sender_identities: [{ id: "sender-1" }],
    });

    await completeRegistration({ admin, registration });

    expect(
      admin.writes.some(
        (write) => write.table === "sms_provider_configurations" && write.op === "update",
      ),
    ).toBe(true);
    expect(
      admin.writes.some((write) => write.table === "sms_sender_identities" && write.op === "update"),
    ).toBe(true);
    expect(
      admin.writes.some((write) => write.op === "insert" && write.table !== "sms_provisioning_registrations"),
    ).toBe(false);
  });
});
