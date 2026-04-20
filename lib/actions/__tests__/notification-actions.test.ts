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