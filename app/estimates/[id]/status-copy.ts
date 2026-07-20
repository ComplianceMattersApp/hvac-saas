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
  return "Finalize & Send locks editing, creates a secure proposal link, and emails it to the customer. Confirm the scope, pricing, photos, and recipient first.";
}
