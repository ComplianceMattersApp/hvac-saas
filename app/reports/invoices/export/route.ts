import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { requireFinancialExportAccessOrResponse } from "@/lib/auth/financial-access";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  INVOICE_LEDGER_EXPORT_LIMIT,
  buildInvoiceLedgerCsv,
  listInvoiceLedgerRows,
  parseInvoiceLedgerFilters,
} from "@/lib/reports/invoice-ledger";

const emptyInvoiceLedger = {
  rows: [],
  totalCount: 0,
  truncated: false,
  summary: {
    invoiceCount: 0,
    openInvoiceCount: 0,
    totalArCents: 0,
    totalArDisplay: "$0.00",
    partialOpenCount: 0,
    unpaidOpenCount: 0,
    oldestOpenInvoiceDaysOpen: null,
    oldestOpenInvoiceDaysOpenDisplay: "-",
    oldestOpenInvoiceDateDisplay: "-",
  },
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      const redirectTarget = await resolveInternalAccessErrorRedirectPath({
        supabase,
        user,
        fallbackPath: "/login",
      });
      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }

    throw error;
  }

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const financialAccessResponse = requireFinancialExportAccessOrResponse({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    requestUrl: request.url,
    unauthorizedRedirectPath: "/reports/invoices?banner=not_authorized",
  });

  if (financialAccessResponse) {
    return financialAccessResponse;
  }

  const filters = parseInvoiceLedgerFilters(request.nextUrl.searchParams);
  const ledger = billingMode === "internal_invoicing"
    ? await listInvoiceLedgerRows({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        filters,
        limit: INVOICE_LEDGER_EXPORT_LIMIT,
      })
    : emptyInvoiceLedger;

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildInvoiceLedgerCsv(ledger.rows)}`;
  const filenamePrefix = filters.view === "open" ? "open-invoices" : "invoice-ledger";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenamePrefix}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
