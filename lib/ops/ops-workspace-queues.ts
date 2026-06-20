import type { ProductMode } from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";

export type OpsBoardFilterBucket =
  | "all"
  | "pending"
  | "field_work"
  | "waiting"
  | "exceptions"
  | "closeout"
  | "contractor_intake"
  | "permits";

export type OpsWorkspaceQueueKey =
  | "need_to_schedule"
  | "field_work"
  | "waiting"
  | "exceptions"
  | "closeout"
  | "contractor_intake"
  | "permits";

export function isContractorIntakeQueueAvailableForProductMode(productMode: ProductMode) {
  return resolveProductSurfaceProfile(productMode).surfaces.contractorRaterHandoff;
}

export function resolveVisibleOpsWorkspaceQueueKeys(params: {
  productMode: ProductMode;
  permitRequestsSchemaAvailable: boolean;
}): OpsWorkspaceQueueKey[] {
  return [
    "need_to_schedule",
    "field_work",
    ...(isContractorIntakeQueueAvailableForProductMode(params.productMode)
      ? (["contractor_intake"] as const)
      : []),
    "waiting",
    "exceptions",
    "closeout",
    ...(params.permitRequestsSchemaAvailable ? (["permits"] as const) : []),
  ];
}

export function resolveEffectiveOpsBoardBucketFilter(params: {
  requestedBucket: OpsBoardFilterBucket;
  productMode: ProductMode;
  permitRequestsSchemaAvailable: boolean;
}): Exclude<OpsBoardFilterBucket, "all"> {
  const requestedBucket = params.requestedBucket === "all" ? "pending" : params.requestedBucket;

  if (
    requestedBucket === "contractor_intake" &&
    !isContractorIntakeQueueAvailableForProductMode(params.productMode)
  ) {
    return "pending";
  }

  if (requestedBucket === "permits" && !params.permitRequestsSchemaAvailable) {
    return "pending";
  }

  return requestedBucket;
}
