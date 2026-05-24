export type ProposalEmailActionState = {
  success: boolean;
  error: string | null;
  code?: string;
  attemptStatus?: "blocked" | "accepted" | "failed";
  deliveryMode?: "provider" | "preview";
  communicationId?: string;
  proposalLinkId?: string;
  proposalUrl?: string | null;
  emailPreviewUrl?: string | null;
  providerMessageId?: string | null;
  emailDisabled?: boolean;
};

export const initialProposalEmailActionState: ProposalEmailActionState = {
  success: false,
  error: null,
};
