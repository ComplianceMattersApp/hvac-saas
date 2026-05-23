export type ProposalEmailActionState = {
  success: boolean;
  error: string | null;
  code?: string;
  attemptStatus?: "blocked" | "accepted" | "failed";
  communicationId?: string;
  proposalLinkId?: string;
  proposalUrl?: string | null;
  providerMessageId?: string | null;
  emailDisabled?: boolean;
};

export const initialProposalEmailActionState: ProposalEmailActionState = {
  success: false,
  error: null,
};
