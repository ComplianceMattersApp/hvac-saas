// lib/estimates/__tests__/estimate-communication.test.ts
// Compliance Matters: Estimate V1H communication send-attempt tests.
// Covers: flag-blocked, valid send (email enabled), email provider failure,
//         missing/invalid inputs, terminal estimate guard, scope enforcement.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_OWNER = "owner-aaa";
const USER_ID = "user-111";
const ESTIMATE_ID = "est-001";

function makeInternalUser(accountOwnerUserId = ACCOUNT_OWNER) {
  return {
    internalUser: {
      user_id: USER_ID,
      account_owner_user_id: accountOwnerUserId,
      role: "admin" as const,
      is_active: true,
    },
  };
}

function makeEstimateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ESTIMATE_ID,
    status: "draft",
    title: "Residential AC Install",
    estimate_number: "EST-20260502-ABCD1234",
    account_owner_user_id: ACCOUNT_OWNER,
    ...overrides,
  };
}

type CommInsertArgs = {
  attempt_status: string;
  recipient_email_snapshot: string;
  provider_name: string | null;
  provider_message_id: string | null;
  attempt_error: string | null;
  [key: string]: unknown;
};

/**
 * Build a minimal chainable Supabase mock that returns the given estimate row
 * on .from("estimates") and captures inserts into estimate_communications and
 * estimate_events.
 */
function makeSupabaseClient(opts: {
  estimateRow?: Record<string, unknown> | null;
  commInsertId?: string;
  commInsertError?: string | null;
}) {
  const capturedComms: CommInsertArgs[] = [];
  const capturedEvents: unknown[] = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: opts.estimateRow ?? null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "estimate_communications") {
        return {
          insert: vi.fn((args: CommInsertArgs) => {
            capturedComms.push(args);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: opts.commInsertError
                    ? null
                    : { id: opts.commInsertId ?? "comm-001" },
                  error: opts.commInsertError
                    ? { message: opts.commInsertError }
                    : null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn((args: unknown) => {
            capturedEvents.push(args);
            return Promise.resolve({ error: null });
          }),
        };
      }

      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
    _capturedComms: capturedComms,
    _capturedEvents: capturedEvents,
  };

  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendEstimateCommunication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_ESTIMATES;
    delete process.env.ENABLE_ESTIMATE_EMAIL_SEND;
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
    sendEmailMock.mockResolvedValue({ data: { id: "resend-msg-abc" }, error: null });
  });

  // -------------------------------------------------------------------------
  // 1. Feature-flag blocked (ENABLE_ESTIMATES off)
  // -------------------------------------------------------------------------

  it("returns unavailable when ENABLE_ESTIMATES is disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "test@example.com",
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/unavailable/i);
    expect(supabase._capturedComms).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. ENABLE_ESTIMATE_EMAIL_SEND off → attempt_status = 'blocked'
  // -------------------------------------------------------------------------

  it("records a blocked attempt when ENABLE_ESTIMATE_EMAIL_SEND is off", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    process.env.ENABLE_ESTIMATE_EMAIL_SEND = "false";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect((result as { attemptStatus: string }).attemptStatus).toBe("blocked");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase._capturedComms).toHaveLength(1);
    expect(supabase._capturedComms[0].attempt_status).toBe("blocked");
    expect(supabase._capturedComms[0].provider_name).toBeNull();
    expect(supabase._capturedComms[0].provider_message_id).toBeNull();
    expect(supabase._capturedComms[0].attempt_error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. ENABLE_ESTIMATE_EMAIL_SEND on → attempt_status = 'accepted'
  // -------------------------------------------------------------------------

  it("records an accepted attempt when email send is enabled and provider succeeds", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    process.env.ENABLE_ESTIMATE_EMAIL_SEND = "true";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);
    sendEmailMock.mockResolvedValue({ data: { id: "resend-xyz" }, error: null });

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "Customer@Example.COM",
    });

    expect(result.success).toBe(true);
    expect((result as { attemptStatus: string }).attemptStatus).toBe("accepted");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(supabase._capturedComms[0].attempt_status).toBe("accepted");
    expect(supabase._capturedComms[0].provider_name).toBe("resend");
    // Recipient should be normalized to lowercase
    expect(supabase._capturedComms[0].recipient_email_snapshot).toBe("customer@example.com");
  });

  // -------------------------------------------------------------------------
  // 4. Provider throws → attempt_status = 'failed', attempt_error set
  // -------------------------------------------------------------------------

  it("records a failed attempt when email provider throws", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    process.env.ENABLE_ESTIMATE_EMAIL_SEND = "1";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);
    sendEmailMock.mockRejectedValue(new Error("Resend rate limit exceeded"));

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "test@example.com",
    });

    expect(result.success).toBe(true);
    expect((result as { attemptStatus: string }).attemptStatus).toBe("failed");
    expect(supabase._capturedComms[0].attempt_status).toBe("failed");
    expect(supabase._capturedComms[0].attempt_error).toMatch(/rate limit/i);
  });

  // -------------------------------------------------------------------------
  // 5. estimate_id missing
  // -------------------------------------------------------------------------

  it("returns error when estimate_id is missing", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: "",
      recipientEmail: "test@example.com",
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/estimate_id/i);
  });

  // -------------------------------------------------------------------------
  // 6. Invalid email address
  // -------------------------------------------------------------------------

  it("returns error for invalid email address", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "not-an-email",
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/email/i);
    expect(supabase._capturedComms).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 7. Cross-account scope: estimate not found
  // -------------------------------------------------------------------------

  it("returns error when estimate is not found in this account", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    const supabase = makeSupabaseClient({ estimateRow: null });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: "other-account-estimate",
      recipientEmail: "test@example.com",
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/not found/i);
    expect(supabase._capturedComms).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 8. Terminal estimate guard (approved status)
  // -------------------------------------------------------------------------

  it("returns error when estimate is in a terminal status", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    const supabase = makeSupabaseClient({
      estimateRow: makeEstimateRow({ status: "approved" }),
    });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    const result = await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "test@example.com",
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/draft or sent/i);
    expect(supabase._capturedComms).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. Terminal estimate guard — all terminal statuses
  // -------------------------------------------------------------------------

  it.each(["declined", "expired", "cancelled", "converted"])(
    "rejects send attempt for terminal status '%s'",
    async (status) => {
      process.env.ENABLE_ESTIMATES = "true";
      const supabase = makeSupabaseClient({
        estimateRow: makeEstimateRow({ status }),
      });
      createClientMock.mockResolvedValue(supabase);

      const { sendEstimateCommunication } = await import(
        "@/lib/estimates/estimate-communication"
      );

      const result = await sendEstimateCommunication({
        estimateId: ESTIMATE_ID,
        recipientEmail: "test@example.com",
      });

      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toMatch(/draft or sent/i);
    }
  );

  // -------------------------------------------------------------------------
  // 10. Blocked attempt still writes estimate_events audit row
  // -------------------------------------------------------------------------

  it("writes an estimate_events audit row even for a blocked attempt", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    process.env.ENABLE_ESTIMATE_EMAIL_SEND = "0";
    const supabase = makeSupabaseClient({ estimateRow: makeEstimateRow() });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateCommunication } = await import(
      "@/lib/estimates/estimate-communication"
    );

    await sendEstimateCommunication({
      estimateId: ESTIMATE_ID,
      recipientEmail: "audit@example.com",
    });

    expect(supabase._capturedEvents).toHaveLength(1);
    const event = supabase._capturedEvents[0] as {
      event_type: string;
      meta: { attempt_status: string };
    };
    expect(event.event_type).toBe("estimate_send_attempted");
    expect(event.meta.attempt_status).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// isEstimateEmailSendEnabled — exposure flag tests
// ---------------------------------------------------------------------------

describe("isEstimateEmailSendEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_ESTIMATE_EMAIL_SEND;
  });

  it("fails closed when unset", async () => {
    const { isEstimateEmailSendEnabled } = await import(
      "@/lib/estimates/estimate-exposure"
    );
    expect(isEstimateEmailSendEnabled(undefined)).toBe(false);
    expect(isEstimateEmailSendEnabled(null)).toBe(false);
    expect(isEstimateEmailSendEnabled("")).toBe(false);
  });

  it("accepts true values", async () => {
    const { isEstimateEmailSendEnabled } = await import(
      "@/lib/estimates/estimate-exposure"
    );
    expect(isEstimateEmailSendEnabled("1")).toBe(true);
    expect(isEstimateEmailSendEnabled("true")).toBe(true);
    expect(isEstimateEmailSendEnabled("yes")).toBe(true);
    expect(isEstimateEmailSendEnabled("on")).toBe(true);
  });

  it("rejects false values", async () => {
    const { isEstimateEmailSendEnabled } = await import(
      "@/lib/estimates/estimate-exposure"
    );
    expect(isEstimateEmailSendEnabled("false")).toBe(false);
    expect(isEstimateEmailSendEnabled("0")).toBe(false);
    expect(isEstimateEmailSendEnabled("no")).toBe(false);
    expect(isEstimateEmailSendEnabled("off")).toBe(false);
  });
});
