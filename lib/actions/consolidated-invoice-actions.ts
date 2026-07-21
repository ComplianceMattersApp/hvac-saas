'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
import { resolveBillingModeByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  composeConsolidatedInvoiceCreationPayload,
  ConsolidatedInvoiceValidationError,
  normalizeConsolidatedInvoiceJobIds,
  validateConsolidatedInvoiceJobs,
  type ConsolidatedInvoiceJob,
} from "@/lib/business/consolidated-invoice";
import { createClient } from "@/lib/supabase/server";

function buildInvoiceNumber() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `INV-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function errorResult(error: unknown) {
  if (error instanceof ConsolidatedInvoiceValidationError) {
    return { ok: false as const, code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : "Consolidated invoice creation failed.";
  if (/active primary invoice|duplicate|unique/i.test(message)) {
    return { ok: false as const, code: "invoice_conflict", message: "A selected job was invoiced by another user. Refresh and review the selection." };
  }
  return { ok: false as const, code: "creation_failed", message };
}

export async function createConsolidatedInvoiceDraftFromForm(formData: FormData) {
  try {
    const selectedJobIds = normalizeConsolidatedInvoiceJobIds(formData.getAll("job_id"));
    const requestKey = String(formData.get("request_key") ?? "").trim();
    if (requestKey.length < 16 || requestKey.length > 200) {
      throw new ConsolidatedInvoiceValidationError("request_key_invalid", "Refresh the page and try creating the invoice again.");
    }

    const supabase = await createClient();
    const { userId, internalUser } = await requireInternalUser({ supabase });
    if (!canManageInvoiceLifecycle({
      actorUserId: userId,
      internalUser,
      resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    })) {
      return { ok: false as const, code: "not_authorized", message: "Invoice lifecycle authority is required." };
    }

    const billingMode = await resolveBillingModeByAccountOwnerId({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
    if (billingMode !== "internal_invoicing") {
      return { ok: false as const, code: "billing_mode", message: "Internal invoicing is not enabled for this account." };
    }

    const { data: jobRows, error: jobsError } = await supabase
      .from("jobs")
      .select("id, account_owner_user_id, title, status, lifecycle_state, deleted_at, field_complete, billing_disposition, customer_id, contractor_id, location_id, service_case_id, billing_recipient, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, scheduled_date, window_start, job_display_number, visit_scope_items")
      .in("id", selectedJobIds);
    if (jobsError) throw jobsError;
    const jobs = (jobRows ?? []) as ConsolidatedInvoiceJob[];
    const { contractorId } = validateConsolidatedInvoiceJobs({
      jobs,
      selectedJobIds,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    const customerIds = Array.from(new Set(jobs.map((job) => String(job.customer_id ?? "")).filter(Boolean)));
    const pricebookIds = Array.from(new Set(jobs.flatMap((job) => {
      try {
        return (Array.isArray(job.visit_scope_items) ? job.visit_scope_items : [])
          .map((item: any) => String(item?.source_pricebook_item_id ?? "").trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    })));

    const [contractorResult, customersResult, pricebookResult] = await Promise.all([
      supabase.from("contractors")
        .select("id, owner_user_id, name, billing_name, billing_email, billing_phone, billing_contact_name, billing_contact_email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, qbo_customer_name")
        .eq("id", contractorId)
        .eq("owner_user_id", internalUser.account_owner_user_id)
        .maybeSingle(),
      customerIds.length
        ? supabase.from("customers")
          .select("id, owner_user_id, full_name, first_name, last_name, billing_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, qbo_customer_name")
          .eq("owner_user_id", internalUser.account_owner_user_id)
          .in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      pricebookIds.length
        ? supabase.from("pricebook_items")
          .select("id, default_unit_price")
          .eq("account_owner_user_id", internalUser.account_owner_user_id)
          .eq("is_active", true)
          .in("id", pricebookIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (contractorResult.error) throw contractorResult.error;
    if (!contractorResult.data) throw new ConsolidatedInvoiceValidationError("contractor_missing", "The contractor billing account is unavailable.");
    if (customersResult.error) throw customersResult.error;
    if (pricebookResult.error) throw pricebookResult.error;

    const customerBillingById = new Map((customersResult.data ?? []).map((customer: any) => [String(customer.id), {
      ...customer,
      billing_email: customer.email ?? null,
      billing_phone: customer.phone ?? null,
    }]));
    const pricebookUnitPriceById = new Map((pricebookResult.data ?? []).map((item: any) => [String(item.id), item.default_unit_price]));
    const payload = composeConsolidatedInvoiceCreationPayload({
      jobs,
      accountOwnerUserId: internalUser.account_owner_user_id,
      actorUserId: userId,
      contractorBilling: contractorResult.data,
      customerBillingById,
      pricebookUnitPriceById,
      invoiceNumber: buildInvoiceNumber(),
      invoiceDate: new Date().toISOString().slice(0, 10),
    });

    const { data: invoiceId, error: createError } = await supabase.rpc("create_consolidated_invoice_draft_v1", {
      p_account_owner_user_id: internalUser.account_owner_user_id,
      p_request_key: requestKey,
      p_invoice: payload.invoice,
      p_memberships: payload.memberships,
      p_line_items: payload.lineItems,
    });
    if (createError) throw createError;
    const createdInvoiceId = String(invoiceId ?? "").trim();
    if (!createdInvoiceId) throw new Error("Consolidated invoice creation returned no invoice ID.");

    for (const job of payload.orderedJobs) {
      revalidatePath(`/jobs/${job.id}`);
      revalidatePath(`/jobs/${job.id}/invoice`);
    }
    revalidatePath("/jobs");
    revalidatePath("/ops");
    revalidatePath("/reports/invoices");
    revalidatePath("/billing/ready-to-bill");

    if (String(formData.get("no_redirect") ?? "") === "1") {
      return { ok: true as const, invoiceId: createdInvoiceId, anchorJobId: payload.orderedJobs[0].id };
    }
    redirect(`/jobs/${payload.orderedJobs[0].id}/invoice?invoice_id=${encodeURIComponent(createdInvoiceId)}#invoice-workspace`);
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return errorResult(error);
  }
}
