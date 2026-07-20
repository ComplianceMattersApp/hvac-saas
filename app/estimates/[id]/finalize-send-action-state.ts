import type { ProposalEmailActionState } from "./proposal-email-action-state";

export type FinalizeAndSendProposalActionState = ProposalEmailActionState & {
  finalized: boolean;
};

export const initialFinalizeAndSendProposalActionState: FinalizeAndSendProposalActionState = {
  success: false,
  error: null,
  finalized: false,
};
