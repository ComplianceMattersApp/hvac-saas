import { INVOICE_LEDGER_EXPORT_LIMIT, listInvoiceLedgerRows, parseInvoiceLedgerFilters } from "@/lib/reports/invoice-ledger";

export async function resolveContractorFinancialHistory(params: {
  supabase: any;
  accountOwnerUserId: string;
  contractorId: string;
}) {
  const [jobsResult, invoiceLedger] = await Promise.all([
    params.supabase
      .from("jobs")
      .select("id, job_display_number, title, status, job_address, city, created_at", { count: "exact" })
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .eq("contractor_id", params.contractorId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
    listInvoiceLedgerRows({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
      filters: parseInvoiceLedgerFilters({
        view: "all",
        contractor: params.contractorId,
        sort: "created_desc",
      }),
      limit: INVOICE_LEDGER_EXPORT_LIMIT,
    }),
  ]);

  if (jobsResult.error) throw jobsResult.error;

  const billedRows = invoiceLedger.rows.slice(0, 8);
  const totalBilledCents = invoiceLedger.rows.reduce((sum, row) => sum + row.totalCents, 0);
  const totalPaidCents = invoiceLedger.rows.reduce((sum, row) => sum + row.amountPaidCents, 0);
  const totalOpenCents = invoiceLedger.rows.reduce((sum, row) => sum + row.balanceDueCents, 0);

  return {
    associatedJobCount: jobsResult.count ?? (jobsResult.data?.length ?? 0),
    recentJobs: jobsResult.data ?? [],
    billedInvoiceCount: invoiceLedger.totalCount,
    totalBilledCents,
    totalPaidCents,
    totalOpenCents,
    invoices: billedRows,
    truncated: invoiceLedger.truncated || invoiceLedger.totalCount > billedRows.length,
  };
}
