import type { ProductMode } from "@/lib/business/product-mode-defaults";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";

export type OpsBoardFilterBucket =
  | "all"
  | "pending"
  | "field_work"
  | "without_tech"
  | "waiting"
  | "exceptions"
  | "closeout"
  | "follow_ups"
  | "contractor_intake"
  | "permits";

export type OpsWorkspaceQueueKey =
  | "need_to_schedule"
  | "field_work"
  | "without_tech"
  | "waiting"
  | "exceptions"
  | "closeout"
  | "follow_ups"
  | "contractor_intake"
  | "permits";

export type OpsWorkspaceQueueBucket = Exclude<OpsBoardFilterBucket, "all">;
export type OpsWorkspaceTabKey = OpsWorkspaceQueueKey | "updates";

export type OpsWorkspaceQueueDefinition = {
  key: OpsWorkspaceQueueKey;
  bucket: OpsWorkspaceQueueBucket;
  label: string;
  mobileLabel: string;
};

export type OpsWorkspaceTab = {
  key: OpsWorkspaceTabKey;
  label: string;
  count: number;
  href: string;
};

export const OPS_WORKSPACE_QUEUE_DEFINITIONS = {
  need_to_schedule: {
    key: "need_to_schedule",
    bucket: "pending",
    label: "Needs Scheduling",
    mobileLabel: "Scheduling",
  },
  field_work: {
    key: "field_work",
    bucket: "field_work",
    label: "Field Work",
    mobileLabel: "Field Work",
  },
  without_tech: {
    key: "without_tech",
    bucket: "without_tech",
    label: "Needs Assignment",
    mobileLabel: "Needs Assignment",
  },
  waiting: {
    key: "waiting",
    bucket: "waiting",
    label: "Waiting / Pending Info",
    mobileLabel: "Waiting",
  },
  exceptions: {
    key: "exceptions",
    bucket: "exceptions",
    label: "Exceptions",
    mobileLabel: "Exceptions",
  },
  closeout: {
    key: "closeout",
    bucket: "closeout",
    label: "Closeout & Review",
    mobileLabel: "Closeout & Review",
  },
  follow_ups: {
    key: "follow_ups",
    bucket: "follow_ups",
    label: "Follow Ups",
    mobileLabel: "Follow Ups",
  },
  contractor_intake: {
    key: "contractor_intake",
    bucket: "contractor_intake",
    label: "Contractor Intake",
    mobileLabel: "Intake",
  },
  permits: {
    key: "permits",
    bucket: "permits",
    label: "Permits",
    mobileLabel: "Permits",
  },
} as const satisfies Record<OpsWorkspaceQueueKey, OpsWorkspaceQueueDefinition>;

export const OPS_WORKSPACE_KEY_BY_BUCKET = {
  pending: "need_to_schedule",
  field_work: "field_work",
  without_tech: "without_tech",
  waiting: "waiting",
  exceptions: "exceptions",
  closeout: "closeout",
  follow_ups: "follow_ups",
  contractor_intake: "contractor_intake",
  permits: "permits",
} as const satisfies Record<OpsWorkspaceQueueBucket, OpsWorkspaceQueueKey>;

export function getOpsWorkspaceQueueDefinition(
  key: OpsWorkspaceQueueKey,
): OpsWorkspaceQueueDefinition {
  return OPS_WORKSPACE_QUEUE_DEFINITIONS[key];
}

export function resolveOpsWorkspaceQueueKey(
  bucket: OpsWorkspaceQueueBucket,
): OpsWorkspaceQueueKey {
  return OPS_WORKSPACE_KEY_BY_BUCKET[bucket];
}

export function opsWorkspaceQueueHref(
  bucket: OpsWorkspaceQueueBucket,
  options: { contractor?: string | null; sort?: string | null } = {},
): string {
  const query = new URLSearchParams({ bucket });
  const contractor = String(options.contractor ?? "").trim();
  const sort = String(options.sort ?? "").trim();
  if (contractor) query.set("contractor", contractor);
  if (sort && sort !== "oldest") query.set("sort", sort);
  return `/ops?${query.toString()}#ops-workspace`;
}

function normalizedCount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function buildOpsWorkspaceTabs(params: {
  counts: Partial<Record<OpsWorkspaceTabKey, number | null | undefined>>;
  contractorScopeFilter?: string | null;
  contractorIntakeQueueAvailable: boolean;
  permitRequestsSchemaAvailable: boolean;
}): OpsWorkspaceTab[] {
  const contractor = String(params.contractorScopeFilter ?? "").trim();
  const count = (key: OpsWorkspaceTabKey) => normalizedCount(params.counts[key]);
  const workspaceTab = (key: OpsWorkspaceQueueKey): OpsWorkspaceTab => {
    const definition = getOpsWorkspaceQueueDefinition(key);
    return {
      key,
      label: definition.label,
      count: count(key),
      href: opsWorkspaceQueueHref(definition.bucket, { contractor }),
    };
  };

  return [
    {
      ...workspaceTab("need_to_schedule"),
      href: `/ops/call-list${contractor ? `?contractor=${encodeURIComponent(contractor)}` : ""}`,
    },
    {
      ...workspaceTab("field_work"),
      href: "/ops/field",
    },
    workspaceTab("without_tech"),
    workspaceTab("waiting"),
    workspaceTab("exceptions"),
    workspaceTab("closeout"),
    workspaceTab("follow_ups"),
    ...(params.contractorIntakeQueueAvailable
      ? [workspaceTab("contractor_intake")]
      : []),
    ...(params.permitRequestsSchemaAvailable
      ? [workspaceTab("permits")]
      : []),
    {
      key: "updates",
      label: "Updates",
      count: count("updates"),
      href: "/ops/notifications?state=unread",
    },
  ];
}

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
    "follow_ups",
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
