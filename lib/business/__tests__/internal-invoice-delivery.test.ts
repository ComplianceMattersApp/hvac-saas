import { describe, expect, it, vi } from "vitest";
import { resolveInternalInvoiceEmailDeliveries } from "@/lib/business/internal-invoice-delivery";

function supabaseWith(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(async () => ({ data: rows, error: null }));
  return { from: vi.fn(() => chain) };
}

describe("internal invoice delivery attachment metadata", () => {
  it("normalizes safe PDF attachment facts", async () => {
    const rows = await resolveInternalInvoiceEmailDeliveries({
      supabase: supabaseWith([{
        id: "delivery-1",
        job_id: "job-1",
        status: "sent",
        payload: {
          invoice_id: "invoice-1",
          pdf_attached: true,
          attachment_filename: "Invoice-3001.pdf",
          attachment_mime_type: "application/pdf",
          attachment_byte_size: 2048,
          provider_message_id: "provider-1",
        },
      }]),
      jobId: "job-1",
      invoiceId: "invoice-1",
    });
    expect(rows[0]).toMatchObject({
      pdfAttached: true,
      attachmentFilename: "Invoice-3001.pdf",
      attachmentMimeType: "application/pdf",
      attachmentByteSize: 2048,
      providerMessageId: "provider-1",
    });
  });

  it("keeps historical records without attachment metadata backward compatible", async () => {
    const rows = await resolveInternalInvoiceEmailDeliveries({
      supabase: supabaseWith([{ id: "legacy-1", job_id: "job-1", status: "sent", payload: { invoice_id: "invoice-1" } }]),
      jobId: "job-1",
      invoiceId: "invoice-1",
    });
    expect(rows[0]).toMatchObject({
      pdfAttached: false,
      attachmentFilename: null,
      attachmentMimeType: null,
      attachmentByteSize: null,
      failureClassification: null,
    });
  });

  it("normalizes generation failure without claiming an attachment", async () => {
    const rows = await resolveInternalInvoiceEmailDeliveries({
      supabase: supabaseWith([{
        id: "failed-1",
        job_id: "job-1",
        status: "failed",
        payload: {
          invoice_id: "invoice-1",
          pdf_attached: false,
          failure_classification: "pdf_generation_failed",
          error_detail: "Invoice PDF generation failed.",
        },
      }]),
      jobId: "job-1",
      invoiceId: "invoice-1",
    });
    expect(rows[0]).toMatchObject({
      status: "failed",
      pdfAttached: false,
      failureClassification: "pdf_generation_failed",
      errorDetail: "Invoice PDF generation failed.",
    });
  });
});
