import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();

const isEstimatesEnabledMock = vi.fn();
const isEstimateProposalLinksEnabledMock = vi.fn();

const issueEstimateProposalLinkMock = vi.fn();
const regenerateEstimateProposalLinkMock = vi.fn();
const revokeEstimateProposalLinkMock = vi.fn();

const sendEstimateCommunicationMock = vi.fn();
const convertApprovedEstimateToJobMock = vi.fn();
const recordEstimateToInvoiceDraftConversionMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", async () => {
  const actual = await vi.importActual<typeof import("@/lib/estimates/estimate-exposure")>(
    "@/lib/estimates/estimate-exposure"
  );
  return {
    ...actual,
    isEstimatesEnabled: (...args: unknown[]) => isEstimatesEnabledMock(...args),
    isEstimateProposalLinksEnabled: (...args: unknown[]) =>
      isEstimateProposalLinksEnabledMock(...args),
  };
});

vi.mock("@/lib/estimates/estimate-proposal-links", () => ({
  issueEstimateProposalLink: (...args: unknown[]) => issueEstimateProposalLinkMock(...args),
  regenerateEstimateProposalLink: (...args: unknown[]) =>
    regenerateEstimateProposalLinkMock(...args),
  revokeEstimateProposalLink: (...args: unknown[]) => revokeEstimateProposalLinkMock(...args),
}));

vi.mock("@/lib/estimates/estimate-communication", () => ({
  sendEstimateCommunication: (...args: unknown[]) => sendEstimateCommunicationMock(...args),
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
  saveManualEstimateLineToPricebook: vi.fn(),
  convertApprovedEstimateToJob: (...args: unknown[]) => convertApprovedEstimateToJobMock(...args),
  recordEstimateToInvoiceDraftConversion: (...args: unknown[]) =>
    recordEstimateToInvoiceDraftConversionMock(...args),
}));

function makeFormData(intent: "issue" | "regenerate" | "revoke", estimateId = "est-1") {
  const formData = new FormData();
  formData.set("intent", intent);
  formData.set("estimate_id", estimateId);
  return formData;
}

describe("estimate proposal-link form wrappers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    isEstimatesEnabledMock.mockReturnValue(true);
    isEstimateProposalLinksEnabledMock.mockReturnValue(true);
  });

  it("issues for sent estimate and revalidates estimate detail route", async () => {
    issueEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const { issueEstimateProposalLinkFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await issueEstimateProposalLinkFromForm(makeFormData("issue"));

    expect(issueEstimateProposalLinkMock).toHaveBeenCalledWith({ estimateId: "est-1" });
    expect(result).toMatchObject({
      status: "success",
      hasActiveLink: true,
      copyToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("maps schema unavailable failures to safe setup message", async () => {
    issueEstimateProposalLinkMock.mockResolvedValue({
      success: false,
      error: "Proposal link setup is unavailable in this environment.",
    });

    const { issueEstimateProposalLinkFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await issueEstimateProposalLinkFromForm(makeFormData("issue"));

    expect(result).toMatchObject({
      status: "error",
      schemaUnavailable: true,
      message: "Proposal link setup is unavailable in this environment.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("regenerates and returns a fresh copy token", async () => {
    regenerateEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_9876543210",
      expiresAt: "2099-01-02T00:00:00.000Z",
    });

    const { regenerateEstimateProposalLinkFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await regenerateEstimateProposalLinkFromForm(makeFormData("regenerate"));

    expect(regenerateEstimateProposalLinkMock).toHaveBeenCalledWith({ estimateId: "est-1" });
    expect(result).toMatchObject({
      status: "success",
      hasActiveLink: true,
      copyToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_9876543210",
      expiresAt: "2099-01-02T00:00:00.000Z",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("revokes active link and clears copy token", async () => {
    revokeEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      revoked: true,
      proposalLinkId: "plink-1",
      status: "revoked",
    });

    const { revokeEstimateProposalLinkFromForm } = await import("@/app/estimates/[id]/actions");
    const result = await revokeEstimateProposalLinkFromForm(makeFormData("revoke"));

    expect(revokeEstimateProposalLinkMock).toHaveBeenCalledWith({ estimateId: "est-1" });
    expect(result).toMatchObject({
      status: "success",
      hasActiveLink: false,
      copyToken: null,
      expiresAt: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("dispatches through unified form action without redirect", async () => {
    issueEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const { submitEstimateProposalLinkActionFromForm } = await import("@/app/estimates/[id]/actions");
    const { initialEstimateProposalLinkActionState } = await import(
      "@/app/estimates/[id]/proposal-link-action-state"
    );

    const result = await submitEstimateProposalLinkActionFromForm(
      initialEstimateProposalLinkActionState,
      makeFormData("issue")
    );

    expect(result.status).toBe("success");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does not call email, sms/provider, payment, or conversion behavior", async () => {
    issueEstimateProposalLinkMock.mockResolvedValue({
      success: true,
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const { issueEstimateProposalLinkFromForm } = await import("@/app/estimates/[id]/actions");
    await issueEstimateProposalLinkFromForm(makeFormData("issue"));

    expect(sendEstimateCommunicationMock).not.toHaveBeenCalled();
    expect(convertApprovedEstimateToJobMock).not.toHaveBeenCalled();
    expect(recordEstimateToInvoiceDraftConversionMock).not.toHaveBeenCalled();
  });
});
