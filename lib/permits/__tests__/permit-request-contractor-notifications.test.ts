import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
const resolveTenantIdentityMock = vi.fn();

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/lib/email/operational-tenant-branding", () => ({
  resolveOperationalTenantIdentity: (...args: unknown[]) => resolveTenantIdentityMock(...args),
}));

type FixtureOptions = {
  portalUserIds?: string[];
  profileEmails?: Array<{ id: string; email: string | null }>;
  contractorEmail?: string | null;
};

function buildAdmin(options?: FixtureOptions) {
  const calls = {
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  };

  const admin = {
    from(table: string) {
      if (table === "contractor_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({
                data: (options?.portalUserIds ?? ["portal-user-1"]).map((id) => ({ user_id: id })),
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data:
                options?.profileEmails ??
                [{ id: "portal-user-1", email: "RBHVACR@gmail.com" }],
              error: null,
            })),
          })),
        };
      }

      if (table === "contractors") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  // `null` here means "no address on file" — distinct from the
                  // fixture default, so do not collapse it with ??.
                  email:
                    options && "contractorEmail" in options
                      ? options.contractorEmail
                      : "rbhvacr@gmail.com",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "notifications") {
        const chain: any = {
          insert: vi.fn((payload: Record<string, unknown>) => {
            calls.inserts.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "notif-1" }, error: null })),
              })),
            };
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
  requestSummary: "Jaswinder Singh",
};

describe("contractor permit request status notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("writes contractor-safe copy for each notifiable status", async () => {
    const { buildContractorPermitStatusContent } = await import(
      "../permit-request-contractor-notifications"
    );

    const hold = buildContractorPermitStatusContent({
      status: "on_hold_additional_info_needed",
      referenceCode: "PR-FFE521B9",
      companyDisplayName: "Compliance Matters",
    });
    expect(hold.subject).toBe("Action needed on permit request PR-FFE521B9");
    expect(hold.statusLabel).toBe("Additional Information Needed");

    const created = buildContractorPermitStatusContent({
      status: "permit_created",
      referenceCode: "PR-FFE521B9",
      companyDisplayName: "Compliance Matters",
      postPermitRoute: "ready_for_testing",
    });
    expect(created.subject).toBe("Permit created for request PR-FFE521B9");
    expect(created.statusLabel).toBe("Ready for Testing");
    expect(created.nextStep).toContain("ready to be scheduled for testing");

    const closed = buildContractorPermitStatusContent({
      status: "not_needed",
      referenceCode: "PR-FFE521B9",
      companyDisplayName: "Compliance Matters",
    });
    expect(closed.subject).toBe("Permit request PR-FFE521B9 closed");

    const accepted = buildContractorPermitStatusContent({
      status: "accepted_in_process",
      referenceCode: "PR-FFE521B9",
      companyDisplayName: "Compliance Matters",
    });
    expect(accepted.statusLabel).toBe("In Progress");
  });

  it("emails the contractor's portal users and records the delivery", async () => {
    const { admin, calls } = buildAdmin();
    const { notifyContractorPermitRequestStatusChange } = await import(
      "../permit-request-contractor-notifications"
    );

    await notifyContractorPermitRequestStatusChange({
      admin,
      ...baseParams,
      status: "on_hold_additional_info_needed",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmailMock.mock.calls[0][0];
    expect(emailArgs.to).toEqual(["rbhvacr@gmail.com"]);
    expect(emailArgs.subject).toBe("Action needed on permit request PR-FFE521B9");
    expect(emailArgs.html).toContain("PR-FFE521B9");
    expect(emailArgs.html).toContain("https://app.example.com/portal/permit-request");

    expect(calls.inserts[0]).toMatchObject({
      recipient_type: "contractor",
      recipient_ref: "ctr-1",
      channel: "email",
      notification_type: "contractor_permit_request_status_email",
      status: "queued",
    });
    expect(calls.updates).toEqual([expect.objectContaining({ status: "sent" })]);
  });

  it("never leaks internal permit detail to the contractor", async () => {
    const { admin } = buildAdmin();
    const { notifyContractorPermitRequestStatusChange } = await import(
      "../permit-request-contractor-notifications"
    );

    await notifyContractorPermitRequestStatusChange({
      admin,
      ...baseParams,
      status: "on_hold_additional_info_needed",
    });

    const html = sendEmailMock.mock.calls[0][0].html as string;
    expect(html).not.toContain("additional_information_needed");
    expect(html).not.toContain("internal_intake_note");
  });

  it("stays silent for statuses the contractor should not be pinged about", async () => {
    const { admin, calls } = buildAdmin();
    const { notifyContractorPermitRequestStatusChange } = await import(
      "../permit-request-contractor-notifications"
    );

    await notifyContractorPermitRequestStatusChange({
      admin,
      ...baseParams,
      status: "permit_request",
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
  });

  it("falls back to the contractor record email when no portal user has one", async () => {
    const { admin } = buildAdmin({
      profileEmails: [{ id: "portal-user-1", email: null }],
      contractorEmail: "office@rbhvac.example",
    });
    const { notifyContractorPermitRequestStatusChange } = await import(
      "../permit-request-contractor-notifications"
    );

    await notifyContractorPermitRequestStatusChange({
      admin,
      ...baseParams,
      status: "permit_created",
      permitNumber: "B26-2057",
    });

    expect(sendEmailMock.mock.calls[0][0].to).toEqual(["office@rbhvac.example"]);
    expect(sendEmailMock.mock.calls[0][0].html).toContain("B26-2057");
  });

  it("records a failed delivery without throwing at the caller", async () => {
    const { admin, calls } = buildAdmin();
    sendEmailMock.mockRejectedValue(new Error("Resend is down"));
    const { notifyContractorPermitRequestStatusChange } = await import(
      "../permit-request-contractor-notifications"
    );

    await expect(
      notifyContractorPermitRequestStatusChange({
        admin,
        ...baseParams,
        status: "not_needed",
      }),
    ).resolves.toBeUndefined();

    expect(calls.updates).toEqual([expect.objectContaining({ status: "failed" })]);
  });

  it("skips silently when the contractor has no reachable address", async () => {
    const { admin, calls } = buildAdmin({
      profileEmails: [{ id: "portal-user-1", email: null }],
      contractorEmail: null,
    });
    const { notifyContractorPermitRequestStatusChange } = await import(
      "../permit-request-contractor-notifications"
    );

    await notifyContractorPermitRequestStatusChange({
      admin,
      ...baseParams,
      status: "permit_created",
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
  });
});
