import { describe, expect, it, vi } from "vitest";

import { getSmsEligibilityInputsForRecipient } from "@/lib/communications/sms-eligibility-inputs-read";

type RecipientFixture = {
  id: string;
  account_owner_user_id: string;
  status: string;
  recipient_role: string | null;
  phone_e164: string | null;
};

type ConsentFixture = {
  account_owner_user_id: string;
  contact_recipient_id: string;
  message_class: string;
  consent_status: string;
};

type SuppressionFixture = {
  account_owner_user_id: string;
  contact_recipient_id: string | null;
  phone_e164: string | null;
  suppression_type: string;
  is_active: boolean;
};

function makeRecipient(input: Partial<RecipientFixture> & { id: string }): RecipientFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    status: "active",
    recipient_role: "customer_primary",
    phone_e164: "+15551234567",
    ...rest,
  };
}

function makeConsent(input: Partial<ConsentFixture> & { contact_recipient_id: string }): ConsentFixture {
  const { contact_recipient_id, ...rest } = input;

  return {
    account_owner_user_id: "owner-1",
    contact_recipient_id,
    message_class: "scheduling",
    consent_status: "opted_in",
    ...rest,
  };
}

function makeSuppression(
  input: Partial<SuppressionFixture> &
    ({ contact_recipient_id: string; phone_e164?: string | null } | { phone_e164: string; contact_recipient_id?: string | null }),
): SuppressionFixture {
  return {
    account_owner_user_id: "owner-1",
    contact_recipient_id: input.contact_recipient_id ?? null,
    phone_e164: input.phone_e164 ?? null,
    suppression_type: "manual_suppression",
    is_active: true,
    ...input,
  };
}

function makeSupabase(fixtures?: {
  recipients?: RecipientFixture[];
  consents?: ConsentFixture[];
  suppressions?: SuppressionFixture[];
}) {
  const recipients = fixtures?.recipients ?? [];
  const consents = fixtures?.consents ?? [];
  const suppressions = fixtures?.suppressions ?? [];

  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });

      const eqFilters: Array<[string, unknown]> = [];
      let limitValue: number | null = null;

      const getRows = () => {
        const source =
          table === "contact_recipients"
            ? recipients
            : table === "contact_recipient_consents"
              ? consents
              : table === "contact_recipient_suppressions"
                ? suppressions
                : [];

        let data: any[] = [...source];
        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row?.[column] === value);
        }
        if (limitValue !== null) {
          data = data.slice(0, limitValue);
        }
        return { data, error: null };
      };

      const query: any = {
        select: vi.fn(() => {
          calls.push({ table, op: "select" });
          return query;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          calls.push({ table, op: "eq", column, value });
          eqFilters.push([column, value]);
          return query;
        }),
        limit: vi.fn((value: number) => {
          calls.push({ table, op: "limit", value });
          limitValue = value;
          return query;
        }),
        then: (
          onFulfilled: (value: { data: any[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(getRows()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls };
}

describe("sms eligibility inputs read helper", () => {
  it("returns blocked scope_missing and avoids queries when account scope is missing", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["scope_missing"]);
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("blocks unsupported message class without consent/suppression queries", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "not_supported",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["message_class_invalid_or_unsupported"]);
    expect(calls.some((call) => call.table === "contact_recipient_consents")).toBe(false);
    expect(calls.some((call) => call.table === "contact_recipient_suppressions")).toBe(false);
  });

  it("returns not_found when recipient is missing", async () => {
    const { supabase } = makeSupabase();

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "missing",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("not_found");
    expect(result.blockedReasons).toEqual(["recipient_not_found"]);
    expect(result.recipientFound).toBe(false);
  });

  it("blocks inactive recipient", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", status: "inactive" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["recipient_inactive"]);
  });

  it("blocks archived recipient", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", status: "archived" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["recipient_archived"]);
  });

  it("blocks active recipient when phone is missing", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", status: "active", phone_e164: null })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["recipient_missing_phone"]);
  });

  it("blocks when consent row is missing", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.consentFound).toBe(false);
    expect(result.consentStatus).toBe("missing");
    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["consent_missing"]);
  });

  it("blocks consent unknown", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "unknown" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.consentFound).toBe(true);
    expect(result.consentStatus).toBe("unknown");
    expect(result.blockedReasons).toEqual(["consent_unknown"]);
  });

  it("blocks consent opted_out", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_out" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.consentStatus).toBe("opted_out");
    expect(result.blockedReasons).toEqual(["consent_opted_out"]);
  });

  it("blocks consent revoked", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "revoked" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.consentStatus).toBe("revoked");
    expect(result.blockedReasons).toEqual(["consent_revoked"]);
  });

  it("returns eligible_inputs_present for active recipient with opted_in and no suppression", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", status: "active" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("eligible_inputs_present");
    expect(result.blockedReasons).toEqual([]);
    expect(result.activeRecipientSuppressionFound).toBe(false);
    expect(result.activePhoneSuppressionFound).toBe(false);
    expect(result.consentStatus).toBe("opted_in");
  });

  it("blocks when active recipient suppression exists even with opted_in consent", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", status: "active" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [
        makeSuppression({
          contact_recipient_id: "recipient-1",
          suppression_type: "do_not_text",
          is_active: true,
        }),
      ],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.activeRecipientSuppressionFound).toBe(true);
    expect(result.blockedReasons).toEqual(["suppression_active_recipient"]);
  });

  it("blocks when active phone suppression exists even with opted_in consent", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", status: "active", phone_e164: "+15551234567" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [
        makeSuppression({
          phone_e164: "+15551234567",
          suppression_type: "stop_keyword",
          is_active: true,
        }),
      ],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.activePhoneSuppressionFound).toBe(true);
    expect(result.blockedReasons).toEqual(["suppression_active_phone"]);
  });

  it("returns both suppression flags and suppression types when both are active", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", phone_e164: "+15551234567" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [
        makeSuppression({
          contact_recipient_id: "recipient-1",
          suppression_type: "do_not_text",
          is_active: true,
        }),
        makeSuppression({
          phone_e164: "+15551234567",
          suppression_type: "stop_keyword",
          is_active: true,
        }),
      ],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.activeRecipientSuppressionFound).toBe(true);
    expect(result.activePhoneSuppressionFound).toBe(true);
    expect(result.suppressionTypes).toEqual(["do_not_text", "stop_keyword"]);
    expect(result.blockedReasons).toEqual([
      "suppression_active_recipient",
      "suppression_active_phone",
    ]);
  });

  it("reads only communications tables and never queries jobs/customers/locations/job_events", async () => {
    const { supabase, calls } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
    });

    await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    const fromTables = calls.filter((call) => call.op === "from").map((call) => call.table);
    expect(fromTables).toEqual([
      "contact_recipients",
      "contact_recipient_suppressions",
      "contact_recipient_suppressions",
      "contact_recipient_consents",
    ]);
    expect(fromTables.includes("jobs")).toBe(false);
    expect(fromTables.includes("customers")).toBe(false);
    expect(fromTables.includes("locations")).toBe(false);
    expect(fromTables.includes("job_events")).toBe(false);
  });

  it("orders blockedReasons with suppression before consent", async () => {
    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      suppressions: [
        makeSuppression({
          contact_recipient_id: "recipient-1",
          suppression_type: "do_not_text",
          is_active: true,
        }),
      ],
    });

    const result = await getSmsEligibilityInputsForRecipient({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      contactRecipientId: "recipient-1",
      messageClass: "scheduling",
    });

    expect(result.nonSendingStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["suppression_active_recipient", "consent_missing"]);
  });
});
