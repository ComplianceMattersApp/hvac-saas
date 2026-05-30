export const DEFAULT_PLATFORM_APPLICATION_FEE_BASIS_POINTS = 25;

export type PlatformApplicationFeeSkippedReason =
  | "platform_fee_disabled"
  | "connect_not_ready"
  | "missing_connected_account"
  | "internal_comped_account"
  | "test_mode_disabled"
  | "non_positive_amount"
  | "non_positive_basis_points"
  | "unsafe_amount"
  | "unsafe_basis_points"
  | "rounded_to_zero"
  | "fee_not_less_than_charge";

export type PlatformApplicationFeeConfig = {
  enabled: boolean;
  feeBasisPoints: number;
  skippedReason: PlatformApplicationFeeSkippedReason | null;
};

export type DerivePlatformApplicationFeeConfigParams = {
  enabled?: boolean | null;
  feeBasisPoints?: number | null;
  stripeConnectReady?: boolean | null;
  connectedAccountId?: string | null;
  isInternalComped?: boolean | null;
  disableInTestMode?: boolean | null;
};

export type CalculatePlatformApplicationFeeAmountParams = {
  amountCents: number;
  feeBasisPoints?: number | null;
  enabled?: boolean | null;
};

export type PlatformApplicationFeeCalculation = {
  enabled: boolean;
  basisPoints: number;
  amountCents: number;
  applicationFeeAmountCents: number;
  skippedReason: PlatformApplicationFeeSkippedReason | null;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeWholeNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.trunc(numeric);
}

function isSafeNonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function derivePlatformApplicationFeeConfig(
  params: DerivePlatformApplicationFeeConfigParams,
): PlatformApplicationFeeConfig {
  const feeBasisPoints = normalizeWholeNumber(
    params.feeBasisPoints ?? DEFAULT_PLATFORM_APPLICATION_FEE_BASIS_POINTS,
  );

  if (!Boolean(params.enabled ?? true)) {
    return {
      enabled: false,
      feeBasisPoints,
      skippedReason: "platform_fee_disabled",
    };
  }

  if (Boolean(params.isInternalComped)) {
    return {
      enabled: false,
      feeBasisPoints,
      skippedReason: "internal_comped_account",
    };
  }

  if (Boolean(params.disableInTestMode)) {
    return {
      enabled: false,
      feeBasisPoints,
      skippedReason: "test_mode_disabled",
    };
  }

  if (!Boolean(params.stripeConnectReady ?? true)) {
    return {
      enabled: false,
      feeBasisPoints,
      skippedReason: "connect_not_ready",
    };
  }

  if (!toCleanString(params.connectedAccountId ?? "connected").length) {
    return {
      enabled: false,
      feeBasisPoints,
      skippedReason: "missing_connected_account",
    };
  }

  return {
    enabled: true,
    feeBasisPoints,
    skippedReason: null,
  };
}

export function calculatePlatformApplicationFeeAmountCents(
  params: CalculatePlatformApplicationFeeAmountParams,
): PlatformApplicationFeeCalculation {
  const enabled = Boolean(params.enabled ?? true);
  const amountCents = normalizeWholeNumber(params.amountCents);
  const basisPoints = normalizeWholeNumber(
    params.feeBasisPoints ?? DEFAULT_PLATFORM_APPLICATION_FEE_BASIS_POINTS,
  );

  if (!enabled) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "platform_fee_disabled",
    };
  }

  if (amountCents <= 0) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "non_positive_amount",
    };
  }

  if (basisPoints <= 0) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "non_positive_basis_points",
    };
  }

  if (!isSafeNonNegativeInteger(amountCents)) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "unsafe_amount",
    };
  }

  if (!isSafeNonNegativeInteger(basisPoints)) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "unsafe_basis_points",
    };
  }

  // Foundation rule: round(amount * bps / 10000), while preserving fee < charge.
  const rawFee = Math.round((amountCents * basisPoints) / 10000);
  const fee = Math.max(0, rawFee);

  if (fee <= 0) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "rounded_to_zero",
    };
  }

  if (fee >= amountCents) {
    return {
      enabled,
      basisPoints,
      amountCents,
      applicationFeeAmountCents: 0,
      skippedReason: "fee_not_less_than_charge",
    };
  }

  return {
    enabled,
    basisPoints,
    amountCents,
    applicationFeeAmountCents: fee,
    skippedReason: null,
  };
}
