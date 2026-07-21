import type { InternalInvoiceRecord } from "@/lib/business/internal-invoice";
import { formatServiceLocationAddressLines } from "@/lib/business/internal-invoice-address-rendering";
import { formatPersonNamePart } from "@/lib/utils/identity-display";

export type InternalInvoiceMemberPresentationContext = {
  jobId: string;
  jobTitle: string;
  jobReference: string;
  customerName: string;
  serviceLocation: string;
};

export async function loadInternalInvoiceMemberPresentationContexts(params: {
  supabase: any;
  invoice: InternalInvoiceRecord;
  accountOwnerUserId: string;
}): Promise<Map<string, InternalInvoiceMemberPresentationContext>> {
  const jobIds = params.invoice.member_job_ids?.length
    ? params.invoice.member_job_ids
    : [params.invoice.job_id];
  if (jobIds.length <= 1) return new Map();

  const { data, error } = await params.supabase
    .from("jobs")
    .select("id, title, job_display_number, job_address, customer_first_name, customer_last_name, account_owner_user_id, locations:location_id(address_line1, address_line2, city, state, zip)")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .in("id", jobIds);
  if (error) throw error;
  if ((data ?? []).length !== jobIds.length) throw new Error("Invoice member presentation context is incomplete.");

  return new Map((data ?? []).map((row: any) => {
    const location = Array.isArray(row.locations) ? row.locations.find(Boolean) : row.locations;
    const serviceLocation = String(row.job_address ?? "").trim()
      || formatServiceLocationAddressLines(location ?? null).join(", ");
    return [String(row.id), {
      jobId: String(row.id),
      jobTitle: String(row.title ?? "").trim() || "Service visit",
      jobReference: row.job_display_number ? `Job #${row.job_display_number}` : `Job ${String(row.id).slice(0, 8)}`,
      customerName: formatPersonNamePart([row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ") || "Customer"),
      serviceLocation,
    } satisfies InternalInvoiceMemberPresentationContext];
  }));
}
