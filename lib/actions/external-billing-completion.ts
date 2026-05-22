export type ExternalBillingCompletionFieldMode = "always" | "if_missing";

export async function applyExternalBillingCompletionMutation(params: {
  supabase: any;
  jobId: string;
  currentInvoiceComplete?: boolean | null;
  currentDataEntryCompletedAt?: string | null;
  invoiceFieldMode?: ExternalBillingCompletionFieldMode;
  dataEntryFieldMode?: ExternalBillingCompletionFieldMode;
  extraUpdateFields?: Record<string, unknown>;
}) {
  const jobId = String(params.jobId ?? "").trim();
  if (!jobId) {
    throw new Error("Missing job_id");
  }

  const currentInvoiceComplete = Boolean(params.currentInvoiceComplete);
  const currentDataEntryCompletedAt = String(params.currentDataEntryCompletedAt ?? "").trim() || null;
  const invoiceFieldMode = params.invoiceFieldMode ?? "if_missing";
  const dataEntryFieldMode = params.dataEntryFieldMode ?? "if_missing";
  const completedAt = currentDataEntryCompletedAt ?? new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    ...(params.extraUpdateFields ?? {}),
  };

  if (invoiceFieldMode === "always" || !currentInvoiceComplete) {
    updatePayload.invoice_complete = true;
  }

  if (dataEntryFieldMode === "always" || !currentDataEntryCompletedAt) {
    updatePayload.data_entry_completed_at = completedAt;
  }

  const shouldWrite = Object.keys(updatePayload).length > 0;

  if (!shouldWrite) {
    return {
      completedAt,
      wrote: false,
      invoiceCompleteChanged: false,
      dataEntryCompletedChanged: false,
    };
  }

  const updateQuery = params.supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", jobId);

  let updateResult: { data: any; error: any };

  if (typeof updateQuery?.select === "function") {
    const selectedQuery = updateQuery.select("id, invoice_complete, data_entry_completed_at");
    if (typeof selectedQuery?.maybeSingle === "function") {
      updateResult = await selectedQuery.maybeSingle();
    } else if (typeof selectedQuery?.single === "function") {
      updateResult = await selectedQuery.single();
    } else {
      throw new Error("Invoice complete update failed (unexpected update query shape).");
    }
  } else if (typeof updateQuery?.maybeSingle === "function") {
    updateResult = await updateQuery.maybeSingle();
  } else {
    updateResult = await params.supabase
      .from("jobs")
      .select("id, invoice_complete, data_entry_completed_at")
      .eq("id", jobId)
      .maybeSingle();
  }

  const { data: updatedRow, error: updateErr } = updateResult;

  if (updateErr) throw updateErr;

  if (!updatedRow?.id || updatedRow.invoice_complete !== true) {
    throw new Error("Invoice complete update failed (no row updated).");
  }

  if (!currentDataEntryCompletedAt && !updatedRow.data_entry_completed_at) {
    throw new Error("Data entry completion update failed (timestamp missing).");
  }

  return {
    completedAt,
    wrote: true,
    invoiceCompleteChanged: !currentInvoiceComplete,
    dataEntryCompletedChanged: !currentDataEntryCompletedAt,
  };
}
