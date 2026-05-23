export type EstimateProposalLinkActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  hasActiveLink: boolean;
  copyToken: string | null;
  expiresAt: string | null;
  schemaUnavailable: boolean;
};

export const initialEstimateProposalLinkActionState: EstimateProposalLinkActionState = {
  status: "idle",
  message: null,
  hasActiveLink: false,
  copyToken: null,
  expiresAt: null,
  schemaUnavailable: false,
};
