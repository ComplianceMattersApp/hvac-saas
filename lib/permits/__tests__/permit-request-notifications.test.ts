import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
const resolveRecipientsMock = vi.fn();
const resolveTenantIdentityMock = vi.fn();

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/lib/notifications/internal-email-recipients", () => ({
  resolveInternalOpsRecipientEmails: (...args: unknown[]) => resolveRecipientsMock(...args),
}));

vi.mock("@/lib/email/operational-tenant-branding", () => ({
  resolveOperationalTenantIdentity: (...args: unknown[]) => resolveTenantIdentityMock(...args),
}));

type FixtureOptions = {
  existingInApp?: boolean;
  existingEmail?: boolean;
  contractorName?: string | null;
  inAppInsertError?: unknown;
};

function buildAdmin(options?: FixtureOptions) {
  const calls = {
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  };

  const admin = {
    from(table: string) {
      if (table === "contractors") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  options?.contractorName === null
                    ? null
                    : { name: options?.contractorName ?? "RB HVAC" },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "notifications") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          contains: vi.fn((_column: string, value: Record<string, unknown>) => {
            chain.__containsValue = value;
            return chain;
          }),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => {
            const isEmailDedupe = Boolean(chain.__containsValue?.dedupe_key);
            const hit = isEmailDedupe ? options?.existingEmail : options?.existingInApp;
            return { data: hit ? { id: "existing-1" } : null, error: null };
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.inserts.push(payload);
            const insertResult: any = {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "notif-1" }, error: null })),
              })),
              then: (resolve: (value: unknown) => unknown) =>
                resolve({ data: null, error: options?.inAppInsertError ?? null }),
            };
            return insertResult;
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            calls.updates.push(patch);
            return { eq: vi.fn(async () => ({ data: null, error: null })) };
          }),
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin: admin as unknown as SupabaseClient, calls };
}

const baseParams = {
  permitRequestId: "ffe521b9-1c1a-4378-9995-ad5cdcb90939",
  accountOwnerUserId: "owner-1",
  contractorId: "ctr-1",
  submittedByUserId: "contractor-user-1",
  attachmentCount: 3,
  note: "Name - Jaswinder Singh\nAddress - 440 Dela Vina Ave",
};

describe("permit request received alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRecipientsMock.mockResolvedValue(["eddie@example.com"]);
    resolveTenantIdentityMock.mockResolvedValue({
      displayName: "Compliance Matters",
      logoUrl: null,
      supportPhone: null,
      supportEmail: null,
    });
    sendEmailMock.mockResolvedValue({ id: "email-1" });
    process.env.APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("builds subject and body naming the contractor, reference, and file count", async () => {
    const { buildPermitRequestAlertContent } = await import("../permit-request-notifications");

    const content = buildPermitRequestAlertContent({
      contractorName: "RB HVAC",
      referenceCode: "PR-FFE521B9",
      attachmentCount: 3,
      note: "Two new residential units",
    });

    expect(content.subject).toBe("New permit request from RB HVAC");
    expect(content.body).toBe(
      "RB HVAC sent a permit request (PR-FFE521B9) with 3 files. Two new residential units",
    );
  });

  it("uses singular file wording and tolerates a missing contractor name", async () => {
    const { buildPermitRequestAlertContent } = await import("../permit-request-notifications");

    const content = buildPermitRequestAlertContent({
      contractorName: null,
      referenceCode: "PR-ABC12345",
      attachmentCount: 1,
      note: null,
    });

    expect(content.body).toBe("A contractor sent a permit request (PR-ABC12345) with 1 file.");
  });

  it("writes an in-app notification and sends the ops email", async () => {
    const { admin, calls } = buildAdmin();
    const { notifyInternalPermitRequestReceived } = await import("../permit-request-notifications");

    await notifyInternalPermitRequestReceived({ admin, ...baseParams });

    const inApp = calls.inserts.find((row) => row.channel === "in_app");
    expect(inApp).toMatchObject({
      job_id: null,
      account_owner_user_id: "owner-1",
      recipient_type: "internal",
      recipient_ref: null,
      channel: "in_app",
      notification_type: "permit_request_received",
      subject: "New permit request from RB HVAC",
      status: "queued",
    });
    expect(inApp?.payload).toMatchObject({
      source: "permit_requests",
      permit_request_id: baseParams.permitRequestId,
      permit_request_reference: "PR-FFE521B9",
      contractor_id: "ctr-1",
      submitted_by_user_id: "contractor-user-1",
      attachment_count: 3,
    });

    const emailLedger = calls.inserts.find((row) => row.channel === "email");
    expect(emailLedger).toMatchObject({
      notification_type: "internal_permit_request_email",
      status: "queued",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmailMock.mock.calls[0][0];
    expect(emailArgs.to).toEqual(["eddie@example.com"]);
    expect(emailArgs.subject).toBe("New permit request from RB HVAC");
    expect(emailArgs.html).toContain("PR-FFE521B9");
    expect(emailArgs.html).toContain("Jaswinder Singh");
    expect(emailArgs.html).toContain("https://app.example.com/ops?bucket=permits");

    expect(calls.updates).toEqual([expect.objectContaining({ status: "sent" })]);
  });

  it("does not double-alert when a notification already exists for the request", async () => {
    const { admin, calls } = buildAdmin({ existingInApp: true });
    const { notifyInternalPermitRequestReceived } = await import("../permit-request-notifications");

    await notifyInternalPermitRequestReceived({ admin, ...baseParams });

    expect(calls.inserts).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips a duplicate email while still writing the in-app signal", async () => {
    const { admin, calls } = buildAdmin({ existingEmail: true });
    const { notifyInternalPermitRequestReceived } = await import("../permit-request-notifications");

    await notifyInternalPermitRequestReceived({ admin, ...baseParams });

    expect(calls.inserts.filter((row) => row.channel === "in_app")).toHaveLength(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("keeps the in-app notification when the email provider fails", async () => {
    const { admin, calls } = buildAdmin();
    sendEmailMock.mockRejectedValue(new Error("Resend is down"));
    const { notifyInternalPermitRequestReceived } = await import("../permit-request-notifications");

    await expect(
      notifyInternalPermitRequestReceived({ admin, ...baseParams }),
    ).resolves.toBeUndefined();

    expect(calls.inserts.filter((row) => row.channel === "in_app")).toHaveLength(1);
    expect(calls.updates).toEqual([expect.objectContaining({ status: "failed" })]);
  });

  it("does not send when no internal ops recipients resolve", async () => {
    const { admin, calls } = buildAdmin();
    resolveRecipientsMock.mockResolvedValue([]);
    const { notifyInternalPermitRequestReceived } = await import("../permit-request-notifications");

    await notifyInternalPermitRequestReceived({ admin, ...baseParams });

    expect(calls.inserts.filter((row) => row.channel === "in_app")).toHaveLength(1);
    expect(calls.inserts.filter((row) => row.channel === "email")).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("ignores calls without a permit request id or account owner", async () => {
    const { admin, calls } = buildAdmin();
    const { notifyInternalPermitRequestReceived } = await import("../permit-request-notifications");

    await notifyInternalPermitRequestReceived({ ...baseParams, admin, permitRequestId: "  " });
    await notifyInternalPermitRequestReceived({ ...baseParams, admin, accountOwnerUserId: "" });

    expect(calls.inserts).toHaveLength(0);
  });
});
