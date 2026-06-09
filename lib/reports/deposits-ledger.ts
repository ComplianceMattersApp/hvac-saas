export type DepositsLedgerPayoutStatus = "" | "paid" | "complete" | "pending" | "in_transit" | "failed" | "canceled";
export type DepositsLedgerSyncStatus = "" | "pending" | "synced" | "skipped" | "unmatched" | "failed";

type StripePaymentSettlementRow = {
  id: string;
  account_owner_user_id: string;
  internal_invoice_payment_id: string | null;
  stripe_balance_transaction_id: string | null;
  stripe_payout_id: string | null;
  settlement_kind: string | null;
  gross_amount_cents: number | null;
  stripe_fee_cents: number | null;
  platform_fee_cents: number | null;
  net_amount_cents: number | null;
  currency: string | null;
  available_on: string | null;
  payout_arrival_date: string | null;
  payout_status: string | null;
  reporting_category: string | null;
  sync_status: string | null;
  sync_error: string | null;
};

export type DepositsLedgerFilters = {
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  payoutStatus?: DepositsLedgerPayoutStatus | null;
  syncStatus?: DepositsLedgerSyncStatus | null;
};

export type DepositsLedgerSummary = {
  grossCollectedCents: number;
  feesAndAdjustmentsCents: number;
  netDepositsCents: number;
  pendingPayoutsCents: number;
  unmatchedNeedsReviewCount: number;
  currency: string;
  hasMultipleCurrencies: boolean;
};

export type DepositsLedgerCurrencySummary = DepositsLedgerSummary & {
  currency: string;
};

export type DepositsLedgerPayoutRow = {
  groupKey: string;
  payoutId: string | null;
  payoutLabel: string;
  payoutStatus: string | null;
  payoutArrivalDate: string | null;
  availableDateFrom: string | null;
  availableDateTo: string | null;
  grossCollectedCents: number;
  feesAndAdjustmentsCents: number;
  netDepositsCents: number;
  paymentCount: number;
  unmatchedCount: number;
  failedSyncCount: number;
  pendingSyncCount: number;
  needsReview: boolean;
  syncStatusSummary: Record<string, number>;
  currency: string;
  hasMultipleCurrencies: boolean;
};

export type DepositsLedgerViewModel = {
  summary: DepositsLedgerSummary;
  rows: DepositsLedgerPayoutRow[];
  perCurrencySummaries: DepositsLedgerCurrencySummary[];
  warnings: string[];
};

export type GetDepositsLedgerSummaryParams = {
  supabase: any;
  accountOwnerUserId: string;
} & DepositsLedgerFilters;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCurrency(value: unknown) {
  const currency = clean(value).toLowerCase();
  return /^[a-z]{3}$/.test(currency) ? currency : "usd";
}

function cents(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(clean(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateKey(value: string | null | undefined) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function settlementDate(row: StripePaymentSettlementRow) {
  return normalizeDate(row.payout_arrival_date) ?? normalizeDate(row.available_on);
}

function inDateRange(row: StripePaymentSettlementRow, filters: DepositsLedgerFilters) {
  const from = normalizeDate(filters.dateFrom);
  const to = normalizeDate(filters.dateTo);
  if (!from && !to) return true;

  const date = settlementDate(row);
  if (!date) return false;
  if (from && date.getTime() < from.getTime()) return false;
  if (to && date.getTime() > to.getTime()) return false;
  return true;
}

function normalizePayoutStatus(value: unknown) {
  return clean(value).toLowerCase();
}

function normalizeSyncStatus(value: unknown) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "synced") return "synced";
  if (normalized === "skipped") return "skipped";
  if (normalized === "unmatched") return "unmatched";
  if (normalized === "failed") return "failed";
  return "pending";
}

function normalizeSettlementKind(value: unknown) {
  return clean(value).toLowerCase() || "unmatched";
}

function isPaidPayoutStatus(value: unknown) {
  const status = normalizePayoutStatus(value);
  return status === "paid" || status === "complete";
}

function isNeedsReview(row: StripePaymentSettlementRow) {
  const syncStatus = normalizeSyncStatus(row.sync_status);
  const kind = normalizeSettlementKind(row.settlement_kind);

  if (!clean(row.internal_invoice_payment_id)) return true;
  if (kind === "unmatched") return true;
  if (syncStatus === "unmatched" || syncStatus === "failed") return true;
  if (syncStatus === "synced" && !clean(row.stripe_balance_transaction_id)) return true;
  return false;
}

function isIncludedInSettlementMath(row: StripePaymentSettlementRow) {
  const syncStatus = normalizeSyncStatus(row.sync_status);
  const kind = normalizeSettlementKind(row.settlement_kind);

  if (isNeedsReview(row)) return false;
  if (syncStatus !== "synced") return false;
  if (kind === "unmatched") return false;
  if (!clean(row.stripe_balance_transaction_id)) return false;
  return true;
}

function feesAndAdjustmentsForRow(row: StripePaymentSettlementRow) {
  if (!isIncludedInSettlementMath(row)) return 0;

  const kind = normalizeSettlementKind(row.settlement_kind);
  const storedFees = cents(row.stripe_fee_cents) + cents(row.platform_fee_cents);
  if (kind === "payment") return storedFees;

  // Non-payment settlement rows are already settlement truth. Negative net
  // amounts reduce deposits, positive net amounts increase them.
  return storedFees - cents(row.net_amount_cents);
}

function grossForRow(row: StripePaymentSettlementRow) {
  if (!isIncludedInSettlementMath(row)) return 0;
  if (normalizeSettlementKind(row.settlement_kind) !== "payment") return 0;
  return cents(row.gross_amount_cents);
}

function netForRow(row: StripePaymentSettlementRow) {
  return isIncludedInSettlementMath(row) ? cents(row.net_amount_cents) : 0;
}

function groupKeyForRow(row: StripePaymentSettlementRow) {
  if (isNeedsReview(row)) return "unmatched";
  const payoutId = clean(row.stripe_payout_id);
  if (payoutId) return `payout:${payoutId}`;
  return "pending:no-payout";
}

function payoutLabelForGroup(groupKey: string, payoutId: string | null) {
  if (payoutId) return payoutId;
  if (groupKey === "unmatched") return "Unmatched / Needs Review";
  return "Pending / No Payout";
}

function addStatus(summary: Record<string, number>, status: string) {
  summary[status] = (summary[status] ?? 0) + 1;
}

function buildZeroSummary(currency = "usd"): DepositsLedgerSummary {
  return {
    grossCollectedCents: 0,
    feesAndAdjustmentsCents: 0,
    netDepositsCents: 0,
    pendingPayoutsCents: 0,
    unmatchedNeedsReviewCount: 0,
    currency,
    hasMultipleCurrencies: false,
  };
}

function summarizeRows(rows: StripePaymentSettlementRow[], currency: string): DepositsLedgerSummary {
  const summary = buildZeroSummary(currency);

  for (const row of rows) {
    summary.grossCollectedCents += grossForRow(row);
    summary.feesAndAdjustmentsCents += feesAndAdjustmentsForRow(row);
    summary.netDepositsCents += netForRow(row);

    if (!isPaidPayoutStatus(row.payout_status) || !clean(row.stripe_payout_id)) {
      summary.pendingPayoutsCents += netForRow(row);
    }

    if (isNeedsReview(row)) {
      summary.unmatchedNeedsReviewCount += 1;
    }
  }

  return summary;
}

function buildGroupRow(groupKey: string, rows: StripePaymentSettlementRow[]): DepositsLedgerPayoutRow {
  const first = rows[0] ?? null;
  const payoutId = clean(first?.stripe_payout_id) || null;
  const currencies = Array.from(new Set(rows.map((row) => normalizeCurrency(row.currency))));
  const availableDates = rows.map((row) => dateKey(row.available_on)).filter(Boolean).sort() as string[];
  const arrivalDates = rows.map((row) => dateKey(row.payout_arrival_date)).filter(Boolean).sort() as string[];
  const syncStatusSummary: Record<string, number> = {};

  for (const row of rows) {
    addStatus(syncStatusSummary, normalizeSyncStatus(row.sync_status));
  }

  return {
    groupKey,
    payoutId,
    payoutLabel: payoutLabelForGroup(groupKey, payoutId),
    payoutStatus: clean(first?.payout_status) || null,
    payoutArrivalDate: arrivalDates[0] ?? null,
    availableDateFrom: availableDates[0] ?? null,
    availableDateTo: availableDates[availableDates.length - 1] ?? null,
    grossCollectedCents: rows.reduce((sum, row) => sum + grossForRow(row), 0),
    feesAndAdjustmentsCents: rows.reduce((sum, row) => sum + feesAndAdjustmentsForRow(row), 0),
    netDepositsCents: rows.reduce((sum, row) => sum + netForRow(row), 0),
    paymentCount: rows.filter((row) => normalizeSettlementKind(row.settlement_kind) === "payment" && isIncludedInSettlementMath(row)).length,
    unmatchedCount: rows.filter(isNeedsReview).length,
    failedSyncCount: rows.filter((row) => normalizeSyncStatus(row.sync_status) === "failed").length,
    pendingSyncCount: rows.filter((row) => normalizeSyncStatus(row.sync_status) === "pending").length,
    needsReview: rows.some(isNeedsReview) || currencies.length > 1,
    syncStatusSummary,
    currency: currencies.length === 1 ? currencies[0] : "mixed",
    hasMultipleCurrencies: currencies.length > 1,
  };
}

export function buildDepositsLedgerViewModel(rows: StripePaymentSettlementRow[]): DepositsLedgerViewModel {
  const currencies = Array.from(new Set(rows.map((row) => normalizeCurrency(row.currency))));
  const hasMultipleCurrencies = currencies.length > 1;
  const warnings = hasMultipleCurrencies
    ? ["Multiple currencies are present; owner-facing totals are not combined across currencies."]
    : [];

  const groups = new Map<string, StripePaymentSettlementRow[]>();
  for (const row of rows) {
    const key = groupKeyForRow(row);
    const groupRows = groups.get(key) ?? [];
    groupRows.push(row);
    groups.set(key, groupRows);
  }

  const groupedRows = Array.from(groups.entries())
    .map(([groupKey, groupRows]) => buildGroupRow(groupKey, groupRows))
    .sort((a, b) => {
      const aDate = a.payoutArrivalDate ?? a.availableDateTo ?? "";
      const bDate = b.payoutArrivalDate ?? b.availableDateTo ?? "";
      return bDate.localeCompare(aDate) || a.groupKey.localeCompare(b.groupKey);
    });

  const perCurrencySummaries = currencies
    .sort()
    .map((currency) => summarizeRows(rows.filter((row) => normalizeCurrency(row.currency) === currency), currency));

  const summary = hasMultipleCurrencies
    ? { ...buildZeroSummary("mixed"), hasMultipleCurrencies: true }
    : summarizeRows(rows, currencies[0] ?? "usd");

  return {
    summary,
    rows: groupedRows,
    perCurrencySummaries,
    warnings,
  };
}

export async function getDepositsLedgerSummary(
  params: GetDepositsLedgerSummaryParams,
): Promise<DepositsLedgerViewModel> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  if (!accountOwnerUserId) throw new Error("accountOwnerUserId is required.");

  let query = params.supabase
    .from("stripe_payment_settlements")
    .select(
      [
        "id",
        "account_owner_user_id",
        "internal_invoice_payment_id",
        "stripe_balance_transaction_id",
        "stripe_payout_id",
        "settlement_kind",
        "gross_amount_cents",
        "stripe_fee_cents",
        "platform_fee_cents",
        "net_amount_cents",
        "currency",
        "available_on",
        "payout_arrival_date",
        "payout_status",
        "reporting_category",
        "sync_status",
        "sync_error",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId);

  const payoutStatus = normalizePayoutStatus(params.payoutStatus);
  if (payoutStatus) query = query.eq("payout_status", payoutStatus);

  const syncStatus = normalizeSyncStatus(params.syncStatus);
  if (clean(params.syncStatus)) query = query.eq("sync_status", syncStatus);

  const { data, error } = await query.order("payout_arrival_date", { ascending: false, nullsFirst: false });
  if (error) throw error;

  const rows = ((data ?? []) as StripePaymentSettlementRow[]).filter((row) => inDateRange(row, params));
  return buildDepositsLedgerViewModel(rows);
}
