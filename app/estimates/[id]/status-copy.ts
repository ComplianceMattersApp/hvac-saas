type FinalizeProposalCopyParams = {
  isMultiOptionProposal: boolean;
};

export function getFinalizeProposalActionCopy(params: FinalizeProposalCopyParams) {
  const base =
    "Finalize this proposal? This locks line editing and enables customer delivery tools. This action does not send an email.";

  if (params.isMultiOptionProposal) {
    return {
      label: "Finalize Proposal",
      confirmMessage: `${base} No option will be selected or approved.`,
    };
  }

  return {
    label: "Finalize Proposal",
    confirmMessage: base,
  };
}

export function getDraftCustomerDeliveryHelperCopy() {
  return "Finalizing locks editing and enables Proposal Link and Email Proposal tools. This action does not send an email.";
}
