type FinalizeProposalCopyParams = {
  isMultiOptionProposal: boolean;
};

export function getFinalizeProposalActionCopy(params: FinalizeProposalCopyParams) {
  void params;

  return {
    label: "Finalize Proposal",
  };
}

export function getDraftCustomerDeliveryHelperCopy() {
  return "Finalizing locks editing and enables Proposal Link and Email Proposal tools. This action does not send an email.";
}
