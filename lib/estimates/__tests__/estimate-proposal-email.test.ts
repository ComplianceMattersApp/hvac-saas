import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();
const isEstimateProposalLinksEnabledMock = vi.fn();
const isEstimateProposalEmailSendEnabledMock = vi.fn();
const readActiveEstimateProposalLinkForInternalMock = vi.fn();
const issueEstimateProposalLinkMock = vi.fn();
const regenerateEstimateProposalLinkMock = vi.fn();
const readCachedEstimateProposalLinkRawTokenMock = vi.fn();
const resolveOperationalTenantIdentityMock = vi.fn();
const sendEmailMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", () => ({
  isEstimatesEnabled: (...args: unknown[]) => isEstimatesEnabledMock(...args),
  isEstimateProposalLinksEnabled: (...args: unknown[]) => isEstimateProposalLinksEnabledMock(...args),
  isEstimateProposalEmailSendEnabled: (...args: unknown[]) =>
    isEstimateProposalEmailSendEnabledMock(...args),
}));

vi.mock("@/lib/estimates/estimate-proposal-links", () => ({
  readActiveEstimateProposalLinkForInternal: (...args: unknown[]) =>
    readActiveEstimateProposalLinkForInternalMock(...args),
  issueEstimateProposalLink: (...args: unknown[]) => issueEstimateProposalLinkMock(...args),
  regenerateEstimateProposalLink: (...args: unknown[]) =>
    regenerateEstimateProposalLinkMock(...args),
  readCachedEstimateProposalLinkRawToken: (...args: unknown[]) =>
    readCachedEstimateProposalLinkRawTokenMock(...args),
}));

vi.mock("@/lib/email/operational-tenant-branding", () => ({
  resolveOperationalTenantIdentity: (...args: unknown[]) =>
    resolveOperationalTenantIdentityMock(...args),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

const ACCOUNT_OWNER = "owner-1";
const USER_ID = "user-1";
const ESTIMATE_ID = "est-1";
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

type CommunicationInsert = {
  attempt_status: string;
  provider_name: string | null;
  provider_message_id: string | null;
  attempt_error: string | null;
  recipient_email_snapshot: string;
  [key: string]: unknown;
};

function makeSupabaseClient(options?: {
  estimateStatus?: string;
  estimateExists?: boolean;
  communicationInsertError?: string | null;
}) {
  const estimateExists = options?.estimateExists ?? true;
  const estimateStatus = options?.estimateStatus ?? "sent";
  const communicationInsertError = options?.communicationInsertError ?? null;

  const communicationInserts: CommunicationInsert[] = [];
  const eventInserts: Array<Record<string, unknown>> = [];
  const proposalLinkUpdates: Array<Record<string, unknown>> = [];

  function buildEstimateSelectChain() {
    const chain: any = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: estimateExists
          ? {
              id: ESTIMATE_ID,
              estimate_number: "EST-1001",
              title: "Spring Tune-up",
              status: estimateStatus,
              account_owner_user_id: ACCOUNT_OWNER,
            }
          : null,
        error: null,
      })),
    };
    return chain;
  }

  function buildProposalLinkUpdateChain(patch: Record<string, unknown>) {
    const chain: any = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      then: (resolve: (value: { data: null; error: null }) => unknown) => {
        proposalLinkUpdates.push(patch);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => buildEstimateSelectChain()),
        };
      }

      if (table === "estimate_communications") {
        return {
          insert: vi.fn((payload: CommunicationInsert) => {
            communicationInserts.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: communicationInsertError ? null : { id: "comm-1" },
                  error: communicationInsertError
                    ? { message: communicationInsertError }
                    : null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            eventInserts.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "estimate_proposal_links") {
        return {
          update: vi.fn((patch: Record<string, unknown>) => buildProposalLinkUpdateChain(patch)),
        };
      }

      return {
        select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
    _communicationInserts: communicationInserts,
    _eventInserts: eventInserts,
    _proposalLinkUpdates: proposalLinkUpdates,
  };
}

describe("sendEstimateProposalEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();

    isEstimatesEnabledMock.mockReturnValue(true);
    isEstimateProposalLinksEnabledMock.mockReturnValue(true);
    isEstimateProposalEmailSendEnabledMock.mockReturnValue(true);

    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: USER_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        role: "admin",
        is_active: true,
      },
    });

    readActiveEstimateProposalLinkForInternalMock.mockResolvedValue({
      schemaAvailable: true,
      activeLink: null,
    });

    issueEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      proposalLinkId: "plink-new",
      proposalUrl: "https://unused.example.com",
      rawToken: "raw-token-new",
      expiresAt: "2026-06-01T00:00:00.000Z",
      recipientEmailSnapshot: "owner@client.com",
    });

    regenerateEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      proposalLinkId: "plink-regenerated",
      rawToken: "raw-token-regenerated",
      expiresAt: "2026-06-02T00:00:00.000Z",
      recipientEmailSnapshot: "owner@client.com",
      status: "active",
    });

    readCachedEstimateProposalLinkRawTokenMock.mockReturnValue("raw-token-cached");

    resolveOperationalTenantIdentityMock.mockResolvedValue({
      displayName: "Acme Heating",
      logoUrl: null,
      supportEmail: "support@acme.test",
      supportPhone: "555-0000",
    });

    sendEmailMock.mockResolvedValue({ data: { id: "resend-1" }, error: null });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    delete process.env.EMAIL_DELIVERY_MODE;
    delete process.env.ENABLE_EMAIL_PREVIEW_OUTBOX;
    delete process.env.ALLOWED_TEST_EMAIL_RECIPIENTS;
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", ORIGINAL_NODE_ENV ?? "test");
    vi.stubEnv("VERCEL_ENV", ORIGINAL_VERCEL_ENV ?? "");
  });

  it("fails closed when estimates are disabled", async () => {
    isEstimatesEnabledMock.mockReturnValue(false);
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe("estimates_unavailable");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase._communicationInserts).toHaveLength(0);
  });

  it("rejects non-sent estimate status", async () => {
    const supabase = makeSupabaseClient({ estimateStatus: "draft" });
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe("estimate_status_invalid");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase._communicationInserts).toHaveLength(0);
  });

  it("validates recipient email", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "not-an-email",
    });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe("recipient_invalid");
    expect(supabase._communicationInserts).toHaveLength(0);
  });

  it("records blocked attempt when proposal email send flag is off", async () => {
    isEstimateProposalEmailSendEnabledMock.mockReturnValue(false);
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "Owner@Client.com",
    });

    expect(result.success).toBe(true);
    expect((result as { attemptStatus?: string }).attemptStatus).toBe("blocked");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase._communicationInserts[0].attempt_status).toBe("blocked");
    expect(supabase._eventInserts).toHaveLength(1);
    expect(String(supabase._eventInserts[0].event_type)).toBe("estimate_proposal_email_send_attempted");
  });

  it("issues proposal link, sends email, updates sent timestamps, and avoids raw-token metadata", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect((result as { emailPreviewUrl?: string | null }).emailPreviewUrl).toBeNull();
    expect(issueEstimateProposalLinkMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0][0] as {
      subject: string;
      html: string;
      text: string;
      to: string;
    };
    expect(sendArgs.to).toBe("owner@client.com");
    expect(sendArgs.subject).toBe("Proposal Ready: Spring Tune-up");
    expect(sendArgs.html).toContain("Your proposal is ready");
    expect(sendArgs.html).toContain(
      "We have prepared the details for the recommended work and included the full proposal for your review."
    );
    expect(sendArgs.html).toContain("When you are ready, you can approve it securely online.");
    expect(sendArgs.html).toContain("Prepared for you by Acme Heating");
    expect(sendArgs.html).toContain("Sent on ");
    expect(sendArgs.html).toContain("Review Proposal");
    expect(sendArgs.html).toContain("Secure online review and approval.");
    expect(sendArgs.html).toContain("If the button does not open, use this secure link:");
    expect(sendArgs.html).toContain("Questions before approving? Contact Acme Heating at support@acme.test or 555-0000.");
    expect(sendArgs.html).toContain(
      "What happens next: after approval, our team will follow up to confirm scheduling details."
    );
    expect(sendArgs.html).toContain("This secure proposal was sent by Acme Heating.");
    expect(sendArgs.html).toContain("If the button does not open, use this secure link:");
    expect(sendArgs.html).toContain("Acme Heating");
    expect(sendArgs.html).toContain("support@acme.test");
    expect(sendArgs.html).toContain("555-0000");
    expect(sendArgs.html).toContain("http://localhost:3000/proposals/raw-token-new");
    expect(sendArgs.text).toContain("Your proposal is ready");
    expect(sendArgs.text).toContain(
      "We've prepared the details for the recommended work and included the full proposal for your review."
    );
    expect(sendArgs.text).toContain("When you're ready, you can approve it securely online.");
    expect(sendArgs.text).toContain("Prepared for you by Acme Heating");
    expect(sendArgs.text).toContain("Sent on ");
    expect(sendArgs.text).toContain("Secure online review and approval.");
    expect(sendArgs.text).toContain("Questions before approving? Contact Acme Heating at support@acme.test or 555-0000.");
    expect(sendArgs.text).toContain(
      "What happens next: after approval, our team will follow up to confirm scheduling details."
    );
    expect(sendArgs.text).toContain("This secure proposal was sent by Acme Heating.");
    expect(sendArgs.text).toContain("http://localhost:3000/proposals/raw-token-new");

    const supportEmailOccurrences = sendArgs.html.match(/support@acme\.test/g)?.length ?? 0;
    const supportPhoneOccurrences = sendArgs.html.match(/555-0000/g)?.length ?? 0;
    expect(supportEmailOccurrences).toBe(1);
    expect(supportPhoneOccurrences).toBe(1);
    expect(sendArgs.html.toLowerCase()).not.toContain("automated message");
    expect(sendArgs.text.toLowerCase()).not.toContain("automated message");

    expect(sendArgs.html.toLowerCase()).not.toContain("invoice");
    expect(sendArgs.html.toLowerCase()).not.toContain("payment");
    expect(sendArgs.html.toLowerCase()).not.toContain("sms");
    expect(sendArgs.html.toLowerCase()).not.toContain("provider");
    expect(sendArgs.html.toLowerCase()).not.toContain("token_hash");
    expect(sendArgs.text.toLowerCase()).not.toContain("invoice");
    expect(sendArgs.text.toLowerCase()).not.toContain("payment");
    expect(sendArgs.text.toLowerCase()).not.toContain("sms");
    expect(sendArgs.text.toLowerCase()).not.toContain("provider");
    expect(sendArgs.text.toLowerCase()).not.toContain("token_hash");

    expect(regenerateEstimateProposalLinkMock).not.toHaveBeenCalled();
    expect(supabase._communicationInserts[0].attempt_status).toBe("accepted");
    expect(supabase._proposalLinkUpdates).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(supabase._proposalLinkUpdates[0], "sent_at")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(supabase._proposalLinkUpdates[0], "last_sent_at")).toBe(true);

    expect(supabase._eventInserts).toHaveLength(2);
    const allMeta = supabase._eventInserts.map((event) => JSON.stringify(event.meta ?? {})).join("\n");
    expect(allMeta).not.toContain("raw-token");
    expect(allMeta).not.toContain("token_hash");

    const allCommunicationPayloads = JSON.stringify(supabase._communicationInserts);
    expect(allCommunicationPayloads).not.toContain("raw-token");
    expect(allCommunicationPayloads).not.toContain("token_hash");
  });

  it("uses fallback subject style when estimate title is blank", async () => {
    const supabase = makeSupabaseClient();
    const originalFrom = supabase.from;
    supabase.from = vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => {
            const chain: any = {
              eq: vi.fn(() => chain),
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: ESTIMATE_ID,
                  estimate_number: "EST-1001",
                  title: "",
                  status: "sent",
                  account_owner_user_id: ACCOUNT_OWNER,
                },
                error: null,
              })),
            };
            return chain;
          }),
        };
      }
      return originalFrom(table);
    });

    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    const sendArgs = sendEmailMock.mock.calls[0][0] as { subject: string };
    expect(sendArgs.subject).toBe("Proposal Ready: EST-1001");
  });

  it("reuses active link with cached raw token without issuing a new link", async () => {
    readActiveEstimateProposalLinkForInternalMock.mockResolvedValue({
      schemaAvailable: true,
      activeLink: {
        proposalLinkId: "plink-active",
        expiresAt: "2026-06-10T00:00:00.000Z",
        recipientEmailSnapshot: "owner@client.com",
        sentAt: null,
      },
    });

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect(issueEstimateProposalLinkMock).not.toHaveBeenCalled();
    expect(regenerateEstimateProposalLinkMock).not.toHaveBeenCalled();
    expect(readCachedEstimateProposalLinkRawTokenMock).toHaveBeenCalledWith({
      proposalLinkId: "plink-active",
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("regenerates and sends when active link exists but cached raw token is unavailable", async () => {
    readActiveEstimateProposalLinkForInternalMock.mockResolvedValue({
      schemaAvailable: true,
      activeLink: {
        proposalLinkId: "plink-active",
        expiresAt: "2026-06-10T00:00:00.000Z",
        recipientEmailSnapshot: "owner@client.com",
        sentAt: null,
      },
    });
    readCachedEstimateProposalLinkRawTokenMock.mockReturnValue(null);

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect(issueEstimateProposalLinkMock).not.toHaveBeenCalled();
    expect(regenerateEstimateProposalLinkMock).toHaveBeenCalledWith({
      estimateId: ESTIMATE_ID,
      recipientEmailSnapshot: "owner@client.com",
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(supabase._communicationInserts).toHaveLength(1);
  });

  it("returns proposal_link_unavailable when regeneration fails", async () => {
    readActiveEstimateProposalLinkForInternalMock.mockResolvedValue({
      schemaAvailable: true,
      activeLink: {
        proposalLinkId: "plink-active",
        expiresAt: "2026-06-10T00:00:00.000Z",
        recipientEmailSnapshot: "owner@client.com",
        sentAt: null,
      },
    });
    readCachedEstimateProposalLinkRawTokenMock.mockReturnValue(null);
    regenerateEstimateProposalLinkMock.mockResolvedValue({
      success: false,
      error: "Proposal link setup is unavailable in this environment.",
    });

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe("proposal_link_unavailable");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase._communicationInserts).toHaveLength(0);
  });

  it("records failed attempt with sanitized provider error", async () => {
    sendEmailMock.mockRejectedValue(new Error(" provider failed\n   temporary outage "));

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect((result as { attemptStatus?: string }).attemptStatus).toBe("failed");
    expect(supabase._communicationInserts[0].attempt_status).toBe("failed");
    expect(supabase._communicationInserts[0].attempt_error).toBe("provider failed temporary outage");
    expect(supabase._eventInserts).toHaveLength(2);
    expect(String(supabase._eventInserts[1].event_type)).toBe("estimate_proposal_email_failed");
    expect(supabase._proposalLinkUpdates).toHaveLength(0);
  });

  it("updates only last_sent_at for links already sent previously", async () => {
    readActiveEstimateProposalLinkForInternalMock.mockResolvedValue({
      schemaAvailable: true,
      activeLink: {
        proposalLinkId: "plink-active",
        expiresAt: "2026-06-10T00:00:00.000Z",
        recipientEmailSnapshot: "owner@client.com",
        sentAt: "2026-05-25T00:00:00.000Z",
      },
    });

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect(supabase._proposalLinkUpdates).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(supabase._proposalLinkUpdates[0], "sent_at")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(supabase._proposalLinkUpdates[0], "last_sent_at")).toBe(true);
  });

  it("generates local preview outbox without calling provider", async () => {
    process.env.EMAIL_DELIVERY_MODE = "preview";
    isEstimateProposalLinksEnabledMock.mockReturnValue(false);

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect((result as { deliveryMode?: string }).deliveryMode).toBe("preview");
    expect((result as { proposalUrl?: string }).proposalUrl).toContain("/proposals/preview-est-1");
    expect((result as { emailPreviewUrl?: string | null }).emailPreviewUrl).toBe(
      "/dev/email-preview/proposal"
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledTimes(3);

    const htmlWrite = writeFileMock.mock.calls.find((call) =>
      String(call[0]).includes("latest-proposal-email.html")
    );
    const textWrite = writeFileMock.mock.calls.find((call) =>
      String(call[0]).includes("latest-proposal-email.txt")
    );
    const jsonWrite = writeFileMock.mock.calls.find((call) =>
      String(call[0]).includes("latest-proposal-email.json")
    );

    expect(htmlWrite?.[1]).toContain("/proposals/preview-est-1");
    expect(textWrite?.[1]).toContain("/proposals/preview-est-1");
    expect(String(jsonWrite?.[1])).not.toContain("token_hash");
    expect(String(jsonWrite?.[1])).not.toContain("raw_token");

    expect(supabase._communicationInserts).toHaveLength(0);
    expect(supabase._eventInserts).toHaveLength(0);
    expect(supabase._proposalLinkUpdates).toHaveLength(0);
  });

  it("fails closed when preview mode is set in production runtime", async () => {
    process.env.EMAIL_DELIVERY_MODE = "preview";
    vi.stubEnv("NODE_ENV", "production");

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe("preview_mode_unavailable");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("blocks non-allowlisted recipients in explicit non-production provider mode", async () => {
    process.env.EMAIL_DELIVERY_MODE = "provider";
    process.env.ALLOWED_TEST_EMAIL_RECIPIENTS = "sandbox-only@client.com";

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe("recipient_not_allowlisted");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase._communicationInserts).toHaveLength(0);
  });

  it("allows explicit non-production provider mode for allowlisted recipients", async () => {
    process.env.EMAIL_DELIVERY_MODE = "provider";
    process.env.ALLOWED_TEST_EMAIL_RECIPIENTS = "owner@client.com";

    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { sendEstimateProposalEmail } = await import("@/lib/estimates/estimate-proposal-email");
    const result = await sendEstimateProposalEmail({
      estimateId: ESTIMATE_ID,
      recipientEmail: "owner@client.com",
    });

    expect(result.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0][0] as { subject: string };
    expect(sendArgs.subject).toContain("[LOCAL TEST]");
    expect(sendArgs.subject).toContain("Proposal Ready:");
  });
});
