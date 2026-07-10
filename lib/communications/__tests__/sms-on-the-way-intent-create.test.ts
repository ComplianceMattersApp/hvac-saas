import { describe, expect, it, vi, beforeEach } from "vitest";

import { createOnTheWayIntentFromEvent } from "@/lib/communications/sms-on-the-way-intent-create";
import { evaluateOnTheWayIntentEligibility } from "@/lib/communications/sms-on-the-way-intent-eligibility";

vi.mock("@/lib/communications/sms-on-the-way-intent-eligibility", () => ({
  evaluateOnTheWayIntentEligibility: vi.fn(),
}));

type RecipientFixture = {
  id: string;
  account_owner_user_id: string;
  phone_e164: string | null;
  recipient_role: string | null;
  status: string;
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

type IntentRow = Record<string, unknown>;

function makeRecipient(input: Partial<RecipientFixture> & { id: string }): RecipientFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    phone_e164: "+15551234567",
    recipient_role: "customer_primary",
    status: "active",
    ...rest,
  };
}

function makeConsent(input: Partial<ConsentFixture> & { contact_recipient_id: string }): ConsentFixture {
  const { contact_recipient_id, ...rest } = input;

  return {
    account_owner_user_id: "owner-1",
    contact_recipient_id,
    message_class: "on_the_way",
    consent_status: "opted_in",
    ...rest,
  };
}

function makeSuppression(input: Partial<SuppressionFixture>): SuppressionFixture {
  return {
    account_owner_user_id: "owner-1",
    contact_recipient_id: null,
    phone_e164: null,
    suppression_type: "manual_suppression",
    is_active: true,
    ...input,
  };
}

function makeEligibility(overrides?: Record<string, unknown>) {
  return {
    eligibleForIntent: true,
    decisionStatus: "ready",
    blockedReasons: [],
    warnings: [
      "quiet_hours_gate_deferred",
      "stop_help_readiness_deferred",
      "live_sms_activation_deferred",
    ],
    messageClass: "on_the_way",
    templateKey: "on_the_way",
    templateVersion: 7,
    bodyTemplate:
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to {{appointment_or_job_context}}. Reply STOP to opt out.",
    messageBodySnapshot: "Hi Taylor, this is Alex with Your company.",
    recipientRef: "recipient-1",
    jobEventId: "event-1",
    jobId: "job-1",
    providerReady: true,
    templateReady: true,
    recipientReady: true,
    consentReady: true,
    quietHoursReady: false,
    liveSendEnabled: false,
    ...overrides,
  };
}

function makeSupabase(fixtures?: {
  recipients?: RecipientFixture[];
  consents?: ConsentFixture[];
  suppressions?: SuppressionFixture[];
  insertError?: any;
  throwOnInsert?: any;
}) {
  const recipients = fixtures?.recipients ?? [];
  const consents = fixtures?.consents ?? [];
  const suppressions = fixtures?.suppressions ?? [];
  const intentRows: IntentRow[] = [];

  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const tables: Record<string, any[]> = {
    contact_recipients: recipients,
    contact_recipient_consents: consents,
    contact_recipient_suppressions: suppressions,
  };

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });

      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let limitValue: number | null = null;

      const getRows = () => {
        let data: any[] = [...(tables[table] ?? [])];

        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row?.[column] === value);
        }

        for (const [column, values] of inFilters) {
          data = data.filter((row) => values.includes(row?.[column]));
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
        in: vi.fn((column: string, values: unknown[]) => {
          calls.push({ table, op: "in", column, value: values });
          inFilters.push([column, values]);
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn((value: number) => {
          calls.push({ table, op: "limit", value });
          limitValue = value;
          return query;
        }),
        insert: vi.fn((payload: IntentRow) => {
          calls.push({ table, op: "insert" });

          if (table !== "sms_message_intents") {
            throw new Error(`Unexpected insert table: ${table}`);
          }

          if (fixtures?.throwOnInsert) {
            throw fixtures.throwOnInsert;
          }

          intentRows.push(payload);

          return {
            select: () => ({
              single: async () => {
                if (fixtures?.insertError) {
                  return {
                    data: null,
                    error: fixtures.insertError,
                  };
                }

                return {
                  data: { id: `intent-${intentRows.length}` },
                  error: null,
                };
              },
            }),
          };
        }),
        update: vi.fn(() => {
          calls.push({ table, op: "update" });
          throw new Error("Unexpected update");
        }),
        delete: vi.fn(() => {
          calls.push({ table, op: "delete" });
          throw new Error("Unexpected delete");
        }),
        then: (
          onFulfilled: (value: { data: any[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(getRows()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls, intentRows };
}

describe("sms on-the-way intent creation helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts one ready intent row when eligibility is ready", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [],
    });

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.created).toBe(true);
    expect(result.decisionStatus).toBe("ready");
    expect(result.decisionOutcomeWritten).toBe("ready_for_provider");
    expect(intentRows).toHaveLength(1);
  });

  it("maps ready insert fields including template, body, recipient snapshots, and idempotency", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1", phone_e164: "+15551234567", recipient_role: "customer_primary" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [],
    });

    await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
      now: new Date("2026-05-15T13:00:00Z"),
    });

    const row = intentRows[0] as any;
    expect(row.message_class).toBe("on_the_way");
    expect(row.template_key).toBe("on_the_way");
    expect(row.template_version).toBe("7");
    expect(row.message_body_snapshot).toBe("Hi Taylor, this is Alex with Your company.");
    expect(row.contact_recipient_id).toBe("recipient-1");
    expect(row.recipient_phone_snapshot).toBe("+15551234567");
    expect(row.recipient_role_snapshot).toBe("customer_primary");
    expect(row.quiet_hours_decision).toBe("not_checked");
    expect(row.blocked_reason_codes).toEqual([]);
    expect(row.idempotency_key).toBe("owner-1:event-1:on_the_way:recipient-1");
    expect(row.decision_outcome).toBe("ready_for_provider");
  });

  it("renders real token values into message_body_snapshot when tokenValues provided", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [],
    });

    await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
      tokenValues: {
        recipientFirstName: "Maria",
        operatorOrTechName: "Jordan",
        companyName: "Cool Air HVAC",
        appointmentOrJobContext: "Tuesday, July 9 between 10 AM – 12 PM",
      },
    });

    const body = (intentRows[0] as any).message_body_snapshot as string;
    // Real values present, sample placeholders absent, no unrendered tokens.
    expect(body).toContain("Maria");
    expect(body).toContain("Jordan");
    expect(body).toContain("Cool Air HVAC");
    expect(body).toContain("Tuesday, July 9 between 10 AM – 12 PM");
    expect(body).not.toContain("Taylor");
    expect(body).not.toContain("Alex");
    expect(body).not.toContain("Your company");
    expect(body).not.toContain("{{");
  });

  it("stamps the v2 real-tokens decision_policy_version", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [],
    });

    await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect((intentRows[0] as any).decision_policy_version).toBe(
      "f5c-b-on-the-way-intent-create-v2-real-tokens",
    );
  });

  it("keeps the sample preview when tokenValues are absent (backward compatible)", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_in" })],
      suppressions: [],
    });

    await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect((intentRows[0] as any).message_body_snapshot).toBe(
      "Hi Taylor, this is Alex with Your company.",
    );
  });

  it("inserts blocked intent when eligibility is blocked and required truth exists", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(
      makeEligibility({
        decisionStatus: "blocked",
        blockedReasons: ["recipient_consent_blocked"],
        eligibleForIntent: false,
      }) as any,
    );

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "opted_out" })],
      suppressions: [],
    });

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.created).toBe(true);
    expect(result.decisionStatus).toBe("blocked");
    expect(result.decisionOutcomeWritten).toBe("blocked");
    expect((intentRows[0] as any).decision_outcome).toBe("blocked");
    expect((intentRows[0] as any).blocked_reason_codes).toEqual(["recipient_consent_blocked"]);
  });

  it("does not insert when eligibility is skipped", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(
      makeEligibility({
        decisionStatus: "skipped",
        blockedReasons: ["job_event_not_on_the_way"],
        eligibleForIntent: false,
      }) as any,
    );

    const { supabase, intentRows } = makeSupabase();

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-2",
    });

    expect(intentRows).toHaveLength(0);
    expect(result.created).toBe(false);
    expect(result.writeSkippedReason).toBe("skipped_non_target_event");
  });

  it("does not insert when recipient truth is missing", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(
      makeEligibility({
        recipientRef: undefined,
        decisionStatus: "blocked",
        blockedReasons: ["recipient_missing"],
      }) as any,
    );

    const { supabase, intentRows } = makeSupabase();

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(intentRows).toHaveLength(0);
    expect(result.created).toBe(false);
    expect(result.writeSkippedReason).toBe("missing_recipient_truth");
  });

  it("does not insert when template version is missing", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility({ templateVersion: undefined }) as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [],
    });

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(intentRows).toHaveLength(0);
    expect(result.writeSkippedReason).toBe("missing_template_version");
  });

  it("does not insert when message body snapshot is missing", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility({ messageBodySnapshot: "" }) as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [],
    });

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(intentRows).toHaveLength(0);
    expect(result.writeSkippedReason).toBe("missing_message_body_snapshot");
  });

  it("treats idempotency conflict as deduped success", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, intentRows } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [],
      insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(intentRows).toHaveLength(1);
    expect(result.created).toBe(false);
    expect(result.deduped).toBe(true);
  });

  it("throws on non-idempotency insert failure", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [],
      insertError: { code: "23514", message: "check violation" },
    });

    await expect(
      createOnTheWayIntentFromEvent({
        supabase: supabase as any,
        accountOwnerUserId: "owner-1",
        actingUserId: "actor-1",
        jobId: "job-1",
        jobEventId: "event-1",
      }),
    ).rejects.toEqual({ code: "23514", message: "check violation" });
  });

  it("never writes sms_provider_deliveries and does not expose canSend", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, calls } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [],
    });

    const result = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(calls.some((call) => call.table === "sms_provider_deliveries" && call.op === "from")).toBe(false);
    expect(result).not.toHaveProperty("canSend");
  });

  it("always returns liveSendEnabled false", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock
      .mockResolvedValueOnce(makeEligibility({ decisionStatus: "ready" }) as any)
      .mockResolvedValueOnce(
        makeEligibility({ decisionStatus: "blocked", blockedReasons: ["recipient_consent_blocked"] }) as any,
      )
      .mockResolvedValueOnce(
        makeEligibility({ decisionStatus: "skipped", blockedReasons: ["job_event_not_on_the_way"] }) as any,
      );

    const { supabase } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [],
    });

    const ready = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    const blocked = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    const skipped = await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-2",
    });

    expect(ready.liveSendEnabled).toBe(false);
    expect(blocked.liveSendEnabled).toBe(false);
    expect(skipped.liveSendEnabled).toBe(false);
  });

  it("touches only expected tables and never updates jobs/job_events", async () => {
    const evaluateMock = vi.mocked(evaluateOnTheWayIntentEligibility);
    evaluateMock.mockResolvedValue(makeEligibility() as any);

    const { supabase, calls } = makeSupabase({
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      suppressions: [makeSuppression({ contact_recipient_id: "recipient-1" })],
    });

    await createOnTheWayIntentFromEvent({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      actingUserId: "actor-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    const touchedTables = Array.from(new Set(calls.filter((call) => call.op === "from").map((call) => call.table))).sort();
    expect(touchedTables).toEqual([
      "contact_recipient_consents",
      "contact_recipient_suppressions",
      "contact_recipients",
      "sms_message_intents",
    ]);

    expect(calls.some((call) => call.table === "jobs")).toBe(false);
    expect(calls.some((call) => call.table === "job_events")).toBe(false);
    expect(calls.some((call) => call.op === "update" || call.op === "delete")).toBe(false);
  });
});
