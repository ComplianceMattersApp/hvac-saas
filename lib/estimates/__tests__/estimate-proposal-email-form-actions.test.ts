import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();
const sendEstimateProposalEmailMock = vi.fn();

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

vi.mock("@/lib/estimates/estimate-actions", () => ({
  addEstimateLineItem: vi.fn(),
  addEstimateOptionLineItem: vi.fn(),
  updateEstimateLineItem: vi.fn(),
  updateEstimateOptionLineItem: vi.fn(),
  removeEstimateLineItem: vi.fn(),
  removeEstimateOptionLineItem: vi.fn(),
  transitionEstimateStatus: vi.fn(),
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
});
