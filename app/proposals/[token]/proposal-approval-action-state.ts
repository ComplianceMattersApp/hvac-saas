export type ProposalApprovalActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const initialProposalApprovalActionState: ProposalApprovalActionState = {
  status: "idle",
  message: null,
};
