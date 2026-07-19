import { NextRequest, NextResponse } from "next/server";
import { loadScopedInternalJobDetailReadBoundary } from "@/lib/actions/internal-job-detail-read-boundary";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { buildInternalInvoiceDocumentModel, buildInternalInvoicePdfFilename } from "@/lib/business/internal-invoice-document";
import { resolveInternalInvoiceById } from "@/lib/business/internal-invoice";
import { resolveInvoiceCollectedPaymentLedger } from "@/lib/business/internal-invoice-payments";
import { type BillingMode, resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { renderInternalInvoicePdf } from "@/lib/pdf/internal-invoice-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function safeError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: jobId } = await context.params;
  const invoiceId = String(request.nextUrl.searchParams.get("invoice_id") ?? "").trim();
  if (!jobId || !invoiceId) return safeError(404, "Invoice not found.");

  const supabase = await createClient();
  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      return safeError(error.code === "AUTH_REQUIRED" ? 401 : 403, "Invoice PDF access is not authorized.");
    }
    throw error;
  }

  const scopedJob = await loadScopedInternalJobDetailReadBoundary({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
  });
  if (!scopedJob?.id) return safeError(404, "Invoice not found.");

  const billingMode: BillingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  if (billingMode !== "internal_invoicing") {
    return safeError(403, "Invoice PDF access is not available for this account.");
  }

  const invoice = await resolveInternalInvoiceById({ supabase, invoiceId });
  if (
    !invoice
    || invoice.job_id !== jobId
    || invoice.account_owner_user_id !== internalUser.account_owner_user_id
  ) {
    return safeError(404, "Invoice not found.");
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(`
      id,
      title,
      customer_first_name,
      customer_last_name,
      billing_recipient,
      locations:location_id (
        address_line1,
        address_line2,
        city,
        state,
        zip
      )
    `)
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job?.id) return safeError(404, "Invoice not found.");

  const [paymentLedger, tenantIdentity] = await Promise.all([
    resolveInvoiceCollectedPaymentLedger(
      internalUser.account_owner_user_id,
      invoice.id,
      supabase,
    ),
    resolveOperationalTenantIdentity({
      accountOwnerUserId: internalUser.account_owner_user_id,
      supabase,
    }),
  ]);
  const jobWithLocation = job as typeof job & {
    locations?: Array<Record<string, string | null>> | Record<string, string | null> | null;
  };
  const location = Array.isArray(jobWithLocation.locations)
    ? jobWithLocation.locations.find(Boolean)
    : jobWithLocation.locations;
  const documentModel = buildInternalInvoiceDocumentModel({
    invoice,
    job,
    location,
    paymentSummary: paymentLedger.summary,
    tenantIdentity,
  });

  try {
    const pdf = await renderInternalInvoicePdf(documentModel);
    const filename = buildInternalInvoicePdfFilename(documentModel.invoiceNumber);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Internal invoice PDF generation failed", {
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      invoiceId: invoice.id,
      stage: "render",
      errorClass: error instanceof Error ? error.name : "unknown",
    });
    return safeError(500, "The invoice PDF could not be generated. Please try again.");
  }
}
