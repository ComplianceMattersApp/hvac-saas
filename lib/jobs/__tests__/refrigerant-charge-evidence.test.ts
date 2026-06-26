import { describe, expect, it } from "vitest";

import {
  REFRIGERANT_CHARGE_ATTACHMENT_TAG,
  buildAttachmentCaptionWithEvidenceContext,
  isInlineReportImageAttachment,
  isRefrigerantChargeEvidenceCaption,
  listJobRefrigerantChargeEvidenceImages,
  normalizeJobAttachmentEvidenceContext,
  stripRefrigerantChargeEvidenceTag,
} from "@/lib/jobs/refrigerant-charge-evidence";

describe("refrigerant charge evidence helpers", () => {
  it("normalizes supported evidence context", () => {
    expect(normalizeJobAttachmentEvidenceContext("refrigerant_charge_photo")).toBe(
      "refrigerant_charge_photo",
    );
    expect(normalizeJobAttachmentEvidenceContext("unknown")).toBeNull();
  });

  it("tags caption for refrigerant charge evidence context", () => {
    const tagged = buildAttachmentCaptionWithEvidenceContext({
      context: "refrigerant_charge_photo",
      caption: "Gauge manifold at stable readings",
    });

    expect(tagged).toBe(`${REFRIGERANT_CHARGE_ATTACHMENT_TAG} Gauge manifold at stable readings`);
  });

  it("uses the tag alone when caption is empty", () => {
    const tagged = buildAttachmentCaptionWithEvidenceContext({
      context: "refrigerant_charge_photo",
      caption: "   ",
    });

    expect(tagged).toBe(REFRIGERANT_CHARGE_ATTACHMENT_TAG);
  });

  it("does not tag caption without evidence context", () => {
    const caption = buildAttachmentCaptionWithEvidenceContext({
      caption: "Job note",
      context: null,
    });

    expect(caption).toBe("Job note");
  });

  it("detects and strips evidence tag", () => {
    const caption = `${REFRIGERANT_CHARGE_ATTACHMENT_TAG} Gauge photo`;
    expect(isRefrigerantChargeEvidenceCaption(caption)).toBe(true);
    expect(stripRefrigerantChargeEvidenceTag(caption)).toBe("Gauge photo");
  });

  it("identifies inline report images by content type", () => {
    expect(isInlineReportImageAttachment({ content_type: "image/jpeg" })).toBe(true);
    expect(isInlineReportImageAttachment({ content_type: " image/png " })).toBe(true);
    expect(isInlineReportImageAttachment({ content_type: "application/pdf" })).toBe(false);
    expect(isInlineReportImageAttachment({ content_type: null })).toBe(false);
  });

  it("lists signed refrigerant evidence images only", async () => {
    const rows = [
      {
        id: "att-image-1",
        bucket: "attachments",
        storage_path: "/jobs/job-1/att-image-1.jpg",
        file_name: "gauge.jpg",
        content_type: "image/jpeg",
        caption: `${REFRIGERANT_CHARGE_ATTACHMENT_TAG} Gauge readings`,
        created_at: "2026-06-24T18:00:00Z",
      },
      {
        id: "att-normal-image",
        bucket: "attachments",
        storage_path: "jobs/job-1/normal.jpg",
        file_name: "normal.jpg",
        content_type: "image/jpeg",
        caption: "Normal job photo",
        created_at: "2026-06-24T17:00:00Z",
      },
      {
        id: "att-pdf",
        bucket: "attachments",
        storage_path: "jobs/job-1/att-pdf.pdf",
        file_name: "charge.pdf",
        content_type: "application/pdf",
        caption: REFRIGERANT_CHARGE_ATTACHMENT_TAG,
        created_at: "2026-06-24T16:00:00Z",
      },
      {
        id: "att-image-2",
        bucket: "attachments",
        storage_path: "jobs/job-1/att-image-2.png",
        file_name: "scale.png",
        content_type: "image/png",
        caption: REFRIGERANT_CHARGE_ATTACHMENT_TAG,
        created_at: "2026-06-24T15:00:00Z",
      },
    ];
    const signedPaths: string[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              ilike: (_column: string, pattern: string) => ({
                order: () => ({
                  limit: async () => ({
                    data: rows.filter((row) =>
                      String(row.caption).toLowerCase().startsWith(pattern.replace("%", "").toLowerCase()),
                    ),
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const admin = {
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => {
            signedPaths.push(path);
            return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
          },
        }),
      },
    };

    const result = await listJobRefrigerantChargeEvidenceImages({
      supabase,
      admin,
      jobId: "job-1",
    });

    expect(result.map((row) => row.id)).toEqual(["att-image-1", "att-image-2"]);
    expect(result[0]).toMatchObject({
      fileName: "gauge.jpg",
      contentType: "image/jpeg",
      caption: "Gauge readings",
      signedUrl: "https://signed.example/jobs/job-1/att-image-1.jpg",
    });
    expect(result[1]).toMatchObject({
      fileName: "scale.png",
      contentType: "image/png",
      caption: null,
      signedUrl: "https://signed.example/jobs/job-1/att-image-2.png",
    });
    expect(signedPaths).toEqual(["jobs/job-1/att-image-1.jpg", "jobs/job-1/att-image-2.png"]);
  });

  it("keeps image evidence on file when signed URL generation fails", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              ilike: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: "att-image-1",
                        bucket: "attachments",
                        storage_path: "jobs/job-1/att-image-1.jpg",
                        file_name: "gauge.jpg",
                        content_type: "image/jpeg",
                        caption: REFRIGERANT_CHARGE_ATTACHMENT_TAG,
                        created_at: "2026-06-24T18:00:00Z",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const admin = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: new Error("signing failed") }),
        }),
      },
    };

    await expect(
      listJobRefrigerantChargeEvidenceImages({ supabase, admin, jobId: "job-1" }),
    ).resolves.toMatchObject([{ id: "att-image-1", signedUrl: null }]);
  });
});
