import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isInternalAccessError, requireInternalUser } from '@/lib/auth/internal-user';
import { canExportFinancialData } from '@/lib/auth/financial-access';
import {
  buildPaymentsRegisterCsv,
  listPaymentsRegisterRows,
  parsePaymentsRegisterFilters,
  PAYMENTS_REGISTER_PAGE_LIMIT,
} from '@/lib/reports/payments-register';

// Export as CSV with current filters applied
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    let internalUser: Awaited<ReturnType<typeof requireInternalUser>>['internalUser'];
    try {
      ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
    } catch (err) {
      if (isInternalAccessError(err)) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      throw err;
    }

    const accountOwnerUserId = String(internalUser.account_owner_user_id ?? '').trim();
    if (!accountOwnerUserId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check financial export authority
    if (!canExportFinancialData({ internalUser, resourceAccountOwnerUserId: accountOwnerUserId })) {
      return NextResponse.redirect(
        new URL('/reports/invoices?banner=not_authorized', request.url),
      );
    }

    // Parse filters from query string
    const searchParams = request.nextUrl.searchParams;
    const filters = parsePaymentsRegisterFilters(searchParams);

    // Fetch filtered rows (use a higher limit for export to capture all matching rows)
    const result = await listPaymentsRegisterRows({
      supabase,
      accountOwnerUserId,
      filters,
      limit: PAYMENTS_REGISTER_PAGE_LIMIT,
    });

    // Build CSV from rows
    const csv = buildPaymentsRegisterCsv(result.rows);

    // Return CSV file download
    const filename = `payments-register-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment;filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Payments register export error:', err);
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 },
    );
  }
}
