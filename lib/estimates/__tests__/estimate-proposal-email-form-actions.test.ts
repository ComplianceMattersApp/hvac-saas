import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();
const sendEstimateProposalEmailMock = vi.fn();
const transitionEstimateStatusMock = vi.fn();
const getEstimateByIdMock = vi.fn();
const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", async () => {
  const actual = await vi.importActual<typeof import("@/lib/estimates/estimate-exposure")>(
    "@/lib/estimates/estimate-exposure"
  );
  return {
    ...actual,
    isEstimatesEnabled: (...args: unknown[]) => isEstimatesEnabledMock(...args),
  };
});

vi.mock("@/lib/estimates/estimate-proposal-email", () => ({
  sendEstimateProposalEmail: (...args: unknown[]) => sendEstimateProposalEmailMock(...args),
}));

vi.mock("@/lib/estimates/estimate-proposal-links", () => ({
  issueEstimateProposalLink: vi.fn(),
  regenerateEstimateProposalLink: vi.fn(),
  revokeEstimateProposalLink: vi.fn(),
}));

vi.mock("@/lib/estimates/estimate-communication", () => ({
  sendEstimateCommunication: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/estimates/estimate-read", () => ({
  getEstimateById: (...args: unknown[]) => getEstimateByIdMock(...args),
}));

vi.mock("@/lib/estimates/estimate-actions", () => ({
  addEstimateLineItem: vi.fn(),
  addEstimateOptionLineItem: vi.fn(),
  updateEstimateLineItem: vi.fn(),
  updateEstimateOptionLineItem: vi.fn(),
  removeEstimateLineItem: vi.fn(),
  removeEstimateOptionLineItem: vi.fn(),
  transitionEstimateStatus: (...args: unknown[]) => transitionEstimateStatusMock(...args),
  createDefaultEstimateOptions: vi.fn(),
  updateEstimateOptionMetadata: vi.fn(),
  recordEstimateApprovalResponse: vi.fn(),
  convertApprovedEstimateToJob: vi.fn(),
  recordEstimateToInvoiceDraftConversion: vi.fn(),
  saveManualEstimateLineToPricebook: vi.fn(),
}));

function makeFormData(estimateId = "est-1", recipientEmail = "owner@client.com") {
  const formData = new FormData();
  formData.set("estimate_id", estimateId);
  formData.set("recipient_email", recipientEmail);
  return formData;
}

describe("proposal email form action wrappers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    isEstimatesEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      internalUser: { user_id: "user-1", account_owner_user_id: "owner-1", role: "admin" },
    });
    getEstimateByIdMock.mockResolvedValue({
      id: "est-1",
      status: "draft",
      proposalMode: "single_option_flat",
      line_items: [{ id: "line-1" }],
      options: [],
    });
    transitionEstimateStatusMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      previousStatus: "draft",
      nextStatus: "sent",
    });
  });

  it("requires recipient email", async () => {
    const { sendEstimateProposalEmailFromForm } = await import("@/app/estimates/[id]/actions");

    const formData = makeFormData("est-1", "");
    const result = await sendEstimateProposalEmailFromForm(formData);

    expect(result).toMatchObject({
      success: false,
      code: "recipient_required",
      error: "Recipient email is required.",
    });
    expect(sendEstimateProposalEmailMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns invalid email result without revalidate", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({
      success: false,
      code: "recipient_invalid",
      error: "Recipient email is not a valid email address.",
    });

    const { sendEstimateProposalEmailFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await sendEstimateProposalEmailFromForm(makeFormData("est-1", "bad-email"));

    expect(sendEstimateProposalEmailMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      recipientEmail: "bad-email",
    });
    expect(result).toMatchObject({
      success: false,
      code: "recipient_invalid",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("records blocked result when email delivery flag is off", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({
      success: true,
      attemptStatus: "blocked",
      communicationId: "comm-1",
      proposalLinkId: "plink-1",
      providerMessageId: null,
      emailDisabled: true,
    });

    const { sendEstimateProposalEmailFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await sendEstimateProposalEmailFromForm(makeFormData());

    expect(result).toMatchObject({
      success: true,
      attemptStatus: "blocked",
      emailDisabled: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("returns success and revalidates for accepted send", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({
      success: true,
      attemptStatus: "accepted",
      communicationId: "comm-2",
      proposalLinkId: "plink-2",
      providerMessageId: "provider-msg-1",
      emailDisabled: false,
    });

    const { sendEstimateProposalEmailFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await sendEstimateProposalEmailFromForm(makeFormData());

    expect(result).toMatchObject({
      success: true,
      attemptStatus: "accepted",
      communicationId: "comm-2",
      proposalLinkId: "plink-2",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("returns safe failure state for failed send attempts", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({
      success: true,
      attemptStatus: "failed",
      communicationId: "comm-3",
      proposalLinkId: "plink-3",
      providerMessageId: null,
      emailDisabled: false,
    });

    const { sendEstimateProposalEmailFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await sendEstimateProposalEmailFromForm(makeFormData());

    expect(result).toMatchObject({
      success: true,
      attemptStatus: "failed",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("supports action-state submit wrapper", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({
      success: true,
      attemptStatus: "accepted",
      communicationId: "comm-9",
      proposalLinkId: "plink-9",
      providerMessageId: "provider-msg-9",
      emailDisabled: false,
    });

    const { submitEstimateProposalEmailActionFromForm } = await import(
      "@/app/estimates/[id]/actions"
    );
    const { initialProposalEmailActionState } = await import(
      "@/app/estimates/[id]/proposal-email-action-state"
    );

    const result = await submitEstimateProposalEmailActionFromForm(
      initialProposalEmailActionState,
      makeFormData()
    );

    expect(result).toMatchObject({ success: true, attemptStatus: "accepted" });
  });

  it("finalizes a complete draft and sends the proposal in one action", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({
      success: true,
      attemptStatus: "accepted",
      deliveryMode: "provider",
      proposalLinkId: "plink-combined",
      providerMessageId: "msg-combined",
      emailDisabled: false,
    });
    const { submitFinalizeAndSendProposalActionFromForm } = await import("@/app/estimates/[id]/actions");
    const { initialFinalizeAndSendProposalActionState } = await import("@/app/estimates/[id]/finalize-send-action-state");
    const result = await submitFinalizeAndSendProposalActionFromForm(initialFinalizeAndSendProposalActionState, makeFormData());

    expect(transitionEstimateStatusMock).toHaveBeenCalledWith({ estimateId: "est-1", nextStatus: "sent" });
    expect(sendEstimateProposalEmailMock).toHaveBeenCalledWith({ estimateId: "est-1", recipientEmail: "owner@client.com" });
    expect(result).toMatchObject({ success: true, finalized: true, attemptStatus: "accepted" });
  });

  it("does not finalize an incomplete proposal", async () => {
    getEstimateByIdMock.mockResolvedValue({ id: "est-1", status: "draft", proposalMode: "single_option_flat", line_items: [], options: [] });
    const { submitFinalizeAndSendProposalActionFromForm } = await import("@/app/estimates/[id]/actions");
    const { initialFinalizeAndSendProposalActionState } = await import("@/app/estimates/[id]/finalize-send-action-state");
    const result = await submitFinalizeAndSendProposalActionFromForm(initialFinalizeAndSendProposalActionState, makeFormData());

    expect(result).toMatchObject({ success: false, finalized: false, code: "proposal_incomplete" });
    expect(transitionEstimateStatusMock).not.toHaveBeenCalled();
    expect(sendEstimateProposalEmailMock).not.toHaveBeenCalled();
  });

  it("reports a truthful partial failure after finalization", async () => {
    sendEstimateProposalEmailMock.mockResolvedValue({ success: false, code: "provider_failed", error: "Email provider unavailable." });
    const { submitFinalizeAndSendProposalActionFromForm } = await import("@/app/estimates/[id]/actions");
    const { initialFinalizeAndSendProposalActionState } = await import("@/app/estimates/[id]/finalize-send-action-state");
    const result = await submitFinalizeAndSendProposalActionFromForm(initialFinalizeAndSendProposalActionState, makeFormData());

    expect(result).toMatchObject({ success: false, finalized: true, code: "provider_failed" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("retries delivery without repeating an already completed finalization", async () => {
    getEstimateByIdMock.mockResolvedValue({ id: "est-1", status: "sent", proposalMode: "single_option_flat", line_items: [{ id: "line-1" }], options: [] });
    sendEstimateProposalEmailMock.mockResolvedValue({ success: true, attemptStatus: "accepted", deliveryMode: "provider", emailDisabled: false });
    const { submitFinalizeAndSendProposalActionFromForm } = await import("@/app/estimates/[id]/actions");
    const { initialFinalizeAndSendProposalActionState } = await import("@/app/estimates/[id]/finalize-send-action-state");
    const result = await submitFinalizeAndSendProposalActionFromForm(initialFinalizeAndSendProposalActionState, makeFormData());

    expect(transitionEstimateStatusMock).not.toHaveBeenCalled();
    expect(sendEstimateProposalEmailMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ success: true, finalized: true });
  });
});
