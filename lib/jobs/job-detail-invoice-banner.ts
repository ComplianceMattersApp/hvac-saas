export function shouldShowInternalInvoiceRequiredBanner(input: {
  isInternalUser: boolean;
  billingModeBlocksLightweightBilling: boolean;
  billedTruthSatisfied: boolean;
  needsInvoice: boolean;
  isCloseoutPending: boolean;
  currentOpsStatus?: string | null;
  jobType?: string | null;
}) {
  const currentOpsStatus = String(input.currentOpsStatus ?? "").trim().toLowerCase();
  const jobType = String(input.jobType ?? "").trim().toLowerCase();
  const isBillingRequiredCloseoutState =
    input.needsInvoice &&
    (
      input.isCloseoutPending ||
      currentOpsStatus === "invoice_required" ||
      currentOpsStatus === "data_entry"
    );

  return (
    input.isInternalUser &&
    input.billingModeBlocksLightweightBilling &&
    !input.billedTruthSatisfied &&
    isBillingRequiredCloseoutState &&
    (
      jobType === "service" ||
      (jobType === "ecc" && currentOpsStatus !== "closed")
    )
  );
}
