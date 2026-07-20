import { getDepositsLedgerSummary } from "@/lib/reports/deposits-ledger";
import { accountScopeInList, resolveReportAccountContractorIds } from "@/lib/reports/report-account-scope";
import { laDateTimeToUtcIso } from "@/lib/utils/schedule-la";

type MoneyRow = { amount_cents?: number | null };
type InvoiceRow = { id: string; total_cents: number | null };
type PaymentRow = { invoice_id?: string | null; amount_cents?: number | null; paid_at?: string | null };
type JobRow = { id: string; field_complete_at: string | null };

export type MonthlyOverviewTrendPoint = {
  day: number;
  receivedCents: number;
  completedJobs: number;
};

export type MonthlyOverviewModel = {
  month: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  range: { startIso: string; endIso: string; fromDate: string; toDate: string };
  comparisonLabel: string;
  billedCents: number;
  receivedCents: number;
  depositedCents: number;
  outstandingCents: number;
  completedJobs: number;
  averageReceivedPerCompletedJobCents: number | null;
  prior: { receivedCents: number; completedJobs: number };
  receivedChangePercent: number | null;
  completedJobsChangePercent: number | null;
  trend: MonthlyOverviewTrendPoint[];
};

function cleanMonth(value: unknown, now = new Date()) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit",
  }).format(now);
}

function monthParts(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, monthNumber };
}

function adjacentMonth(month: string, delta: number) {
  const { year, monthNumber } = monthParts(month);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string) {
  const { year, monthNumber } = monthParts(month);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function ymd(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function buildMonthlyRange(monthInput: unknown, now = new Date()) {
  const month = cleanMonth(monthInput, now);
  const currentMonth = cleanMonth(null, now);
  const isCurrentMonth = month === currentMonth;
  const lastDay = daysInMonth(month);
  const todayDay = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", day: "numeric",
  }).format(now));
  const throughDay = isCurrentMonth ? Math.min(todayDay, lastDay) : lastDay;
  const nextDayDate = new Date(Date.UTC(monthParts(month).year, monthParts(month).monthNumber - 1, throughDay + 1));
  const endDate = `${nextDayDate.getUTCFullYear()}-${String(nextDayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDayDate.getUTCDate()).padStart(2, "0")}`;
  return {
    month,
    isCurrentMonth,
    throughDay,
    startIso: laDateTimeToUtcIso(`${month}-01`, "00:00"),
    endIso: laDateTimeToUtcIso(endDate, "00:00"),
    fromDate: `${month}-01`,
    toDate: ymd(month, throughDay),
  };
}

function percentChange(current: number, prior: number) {
  return prior > 0 ? Math.round(((current - prior) / prior) * 100) : null;
}

function amount(rows: MoneyRow[]) {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount_cents ?? 0) || 0), 0);
}

async function queryRange(params: {
  supabase: any; accountOwnerUserId: string; table: string; select: string; dateColumn: string;
  startIso: string; endIso: string; extra?: (query: any) => any;
}) {
  let query = params.supabase.from(params.table).select(params.select)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .gte(params.dateColumn, params.startIso).lt(params.dateColumn, params.endIso).limit(5000);
  if (params.extra) query = params.extra(query);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? `Failed to load ${params.table}.`);
  return data ?? [];
}

export async function getMonthlyOverview(params: {
  supabase: any; accountOwnerUserId: string; month?: string | null; now?: Date;
}): Promise<MonthlyOverviewModel> {
  const now = params.now ?? new Date();
  const current = buildMonthlyRange(params.month, now);
  const priorMonth = adjacentMonth(current.month, -1);
  const priorFull = buildMonthlyRange(priorMonth, now);
  const priorThroughDay = Math.min(current.throughDay, daysInMonth(priorMonth));
  const priorEndDate = new Date(Date.UTC(monthParts(priorMonth).year, monthParts(priorMonth).monthNumber - 1, priorThroughDay + 1));
  const priorEndYmd = `${priorEndDate.getUTCFullYear()}-${String(priorEndDate.getUTCMonth() + 1).padStart(2, "0")}-${String(priorEndDate.getUTCDate()).padStart(2, "0")}`;
  const prior = { ...priorFull, throughDay: priorThroughDay, endIso: laDateTimeToUtcIso(priorEndYmd, "00:00"), toDate: ymd(priorMonth, priorThroughDay) };

  const contractorIdsPromise = resolveReportAccountContractorIds(params);
  const billedPromise = queryRange({ ...params, table: "internal_invoices", select: "amount_cents:total_cents", dateColumn: "issued_at", startIso: current.startIso, endIso: current.endIso, extra: (q) => q.eq("status", "issued") });
  const receivedPromise = queryRange({ ...params, table: "internal_invoice_payments", select: "amount_cents, paid_at", dateColumn: "paid_at", startIso: current.startIso, endIso: current.endIso, extra: (q) => q.eq("payment_status", "recorded") });
  const priorReceivedPromise = queryRange({ ...params, table: "internal_invoice_payments", select: "amount_cents, paid_at", dateColumn: "paid_at", startIso: prior.startIso, endIso: prior.endIso, extra: (q) => q.eq("payment_status", "recorded") });
  const depositsPromise = getDepositsLedgerSummary({ supabase: params.supabase, accountOwnerUserId: params.accountOwnerUserId, dateFrom: current.startIso, dateTo: new Date(Date.parse(current.endIso) - 1) });

  const { data: openInvoices, error: invoiceError } = await params.supabase.from("internal_invoices")
    .select("id, total_cents").eq("account_owner_user_id", params.accountOwnerUserId).eq("status", "issued").limit(5000);
  if (invoiceError) throw new Error(invoiceError.message ?? "Failed to load outstanding invoices.");
  const invoiceRows = (openInvoices ?? []) as InvoiceRow[];
  const invoiceIds = invoiceRows.map((row) => row.id);
  let allRecordedPayments: PaymentRow[] = [];
  if (invoiceIds.length) {
    const { data, error } = await params.supabase.from("internal_invoice_payments")
      .select("invoice_id, amount_cents").eq("account_owner_user_id", params.accountOwnerUserId)
      .eq("payment_status", "recorded").in("invoice_id", invoiceIds).limit(10000);
    if (error) throw new Error(error.message ?? "Failed to load outstanding payment totals.");
    allRecordedPayments = data ?? [];
  }

  const contractorIds = await contractorIdsPromise;
  const loadJobs = async (range: typeof current) => {
    const { data, error } = await params.supabase.from("jobs").select("id, field_complete_at")
      .in("contractor_id", accountScopeInList(contractorIds)).eq("field_complete", true)
      .gte("field_complete_at", range.startIso).lt("field_complete_at", range.endIso).is("deleted_at", null).limit(5000);
    if (error) throw new Error(error.message ?? "Failed to load completed jobs.");
    return (data ?? []) as JobRow[];
  };

  const [billedRows, receivedRows, priorReceivedRows, deposits, completedRows, priorCompletedRows] = await Promise.all([
    billedPromise, receivedPromise, priorReceivedPromise, depositsPromise, loadJobs(current), loadJobs(prior),
  ]);
  const paidByInvoice = new Map<string, number>();
  for (const row of allRecordedPayments) paidByInvoice.set(String(row.invoice_id), (paidByInvoice.get(String(row.invoice_id)) ?? 0) + Math.max(0, Number(row.amount_cents ?? 0) || 0));
  const outstandingCents = invoiceRows.reduce((sum, row) => sum + Math.max(0, Number(row.total_cents ?? 0) - (paidByInvoice.get(row.id) ?? 0)), 0);
  const receivedCents = amount(receivedRows);
  const trend = Array.from({ length: current.throughDay }, (_, index) => ({ day: index + 1, receivedCents: 0, completedJobs: 0 }));
  for (const row of receivedRows as PaymentRow[]) {
    const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", day: "numeric" }).format(new Date(String(row.paid_at))));
    if (trend[day - 1]) trend[day - 1].receivedCents += Math.max(0, Number(row.amount_cents ?? 0) || 0);
  }
  for (const row of completedRows) {
    const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", day: "numeric" }).format(new Date(String(row.field_complete_at))));
    if (trend[day - 1]) trend[day - 1].completedJobs += 1;
  }

  return {
    month: current.month,
    monthLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${current.month}-01T12:00:00Z`)),
    isCurrentMonth: current.isCurrentMonth,
    range: current,
    comparisonLabel: current.isCurrentMonth ? `Same days in ${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${priorMonth}-01T12:00:00Z`))}` : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${priorMonth}-01T12:00:00Z`)),
    billedCents: amount(billedRows), receivedCents, depositedCents: deposits.summary.netDepositsCents, outstandingCents,
    completedJobs: completedRows.length,
    averageReceivedPerCompletedJobCents: completedRows.length ? Math.round(receivedCents / completedRows.length) : null,
    prior: { receivedCents: amount(priorReceivedRows), completedJobs: priorCompletedRows.length },
    receivedChangePercent: percentChange(receivedCents, amount(priorReceivedRows)),
    completedJobsChangePercent: percentChange(completedRows.length, priorCompletedRows.length),
    trend,
  };
}
