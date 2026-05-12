import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

describe("createContractorIntakeProposalAwarenessNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates the internal awareness notification row for proposal submission", async () => {
    const rpcMock = vi.fn(async () => ({
      data: "notif-1",
      error: null,
    }));

    const { createContractorIntakeProposalAwarenessNotification } = await import("@/lib/actions/notification-actions");

    const notificationId = await createContractorIntakeProposalAwarenessNotification({
      supabase: { rpc: rpcMock },
      contractorIntakeSubmissionId: "proposal-1",
      accountOwnerUserId: "owner-1",
      actorUserId: "actor-1",
      contractorId: "contractor-1",
    });

    expect(notificationId).toBe("notif-1");
    expect(rpcMock).toHaveBeenCalledWith("insert_internal_notification", {
      p_job_id: null,
      p_submission_id: "proposal-1",
      p_account_owner_user_id: "owner-1",
      p_actor_user_id: "actor-1",
      p_notification_type: "contractor_intake_proposal_submitted",
      p_subject: "New Contractor Intake Proposal",
      p_body: "A contractor submitted an intake proposal pending internal finalization.",
      p_payload: {
        source: "contractor_intake_submissions",
        contractor_id: "contractor-1",
        submitted_by_user_id: "actor-1",
        account_owner_user_id: "owner-1",
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("throws when the awareness insert fails", async () => {
    const rpcMock = vi.fn(async () => ({
      data: null,
      error: { message: "boom" },
    }));

    const { createContractorIntakeProposalAwarenessNotification } = await import("@/lib/actions/notification-actions");

    await expect(
      createContractorIntakeProposalAwarenessNotification({
        supabase: { rpc: rpcMock },
        contractorIntakeSubmissionId: "proposal-1",
        accountOwnerUserId: "owner-1",
        actorUserId: "actor-1",
        contractorId: "contractor-1",
      }),
    ).rejects.toEqual({ message: "boom" });
  });
});

describe("markInternalNewWorkNotificationsResolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function makeUpdateTrackingSupabase() {
    const calls: Array<{
      table: string;
      payload: Record<string, unknown>;
      filters: Array<{ op: string; column: string; value: unknown }>;
    }> = [];

    return {
      supabase: {
        from(table: string) {
          return {
            update(payload: Record<string, unknown>) {
              const filters: Array<{ op: string; column: string; value: unknown }> = [];
              const chain: any = {
                eq(column: string, value: unknown) {
                  filters.push({ op: "eq", column, value });
                  return chain;
                },
                in(column: string, value: unknown) {
                  filters.push({ op: "in", column, value });
                  return chain;
                },
                contains(column: string, value: unknown) {
                  filters.push({ op: "contains", column, value });
                  return chain;
                },
                is(column: string, value: unknown) {
                  filters.push({ op: "is", column, value });
                  return chain;
                },
                then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
                  calls.push({ table, payload, filters: [...filters] });
                  return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
                },
              };
              return chain;
            },
          };
        },
      },
      calls,
    };
  }

  it("scopes proposal resolution to approved proposal notification families", async () => {
    const { supabase, calls } = makeUpdateTrackingSupabase();
    const { markInternalNewWorkNotificationsResolved } = await import("@/lib/actions/notification-actions");

    await markInternalNewWorkNotificationsResolved({
      supabase,
      accountOwnerUserId: "owner-1",
      contractorIntakeSubmissionId: "proposal-1",
      readAtIso: "2026-04-24T10:00:00.000Z",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("notifications");
    expect(calls[0]?.filters).toEqual(
      expect.arrayContaining([
        { op: "eq", column: "account_owner_user_id", value: "owner-1" },
        { op: "eq", column: "recipient_type", value: "internal" },
        {
          op: "in",
          column: "notification_type",
          value: [
            "contractor_intake_proposal_submitted",
            "internal_contractor_intake_proposal_email",
          ],
        },
        {
          op: "contains",
          column: "payload",
          value: { contractor_intake_submission_id: "proposal-1" },
        },
        { op: "is", column: "read_at", value: null },
      ]),
    );
  });

  it("scopes job resolution to approved job notification families", async () => {
    const { supabase, calls } = makeUpdateTrackingSupabase();
    const { markInternalNewWorkNotificationsResolved } = await import("@/lib/actions/notification-actions");

    await markInternalNewWorkNotificationsResolved({
      supabase,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
    });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.table).toBe("notifications");
      expect(call.filters).toEqual(
        expect.arrayContaining([
          { op: "eq", column: "account_owner_user_id", value: "owner-1" },
          { op: "eq", column: "recipient_type", value: "internal" },
          {
            op: "in",
            column: "notification_type",
            value: ["contractor_job_created", "internal_contractor_job_intake_email"],
          },
          { op: "is", column: "read_at", value: null },
        ]),
      );
    }
  });

  it("is a no-op when both submission and job ids are empty", async () => {
    const { supabase, calls } = makeUpdateTrackingSupabase();
    const { markInternalNewWorkNotificationsResolved } = await import("@/lib/actions/notification-actions");

    await markInternalNewWorkNotificationsResolved({
      supabase,
      accountOwnerUserId: "owner-1",
      contractorIntakeSubmissionId: null,
      jobId: "",
    });

    expect(calls).toHaveLength(0);
  });
});