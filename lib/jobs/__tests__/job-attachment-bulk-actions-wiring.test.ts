import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const internalSource = readFileSync(resolve(__dirname, "../../../app/jobs/[id]/_components/JobAttachmentsInternal.tsx"), "utf8");
const portalSource = readFileSync(resolve(__dirname, "../../../components/portal/JobAttachments.tsx"), "utf8");
const actionsSource = readFileSync(resolve(__dirname, "../../actions/attachment-actions.ts"), "utf8");
const zipSource = readFileSync(resolve(__dirname, "../../attachments/download-attachment-zip.ts"), "utf8");

describe("job attachment bulk actions", () => {
  it("supports selecting, sharing, and downloading multiple internal attachments", () => {
    expect(internalSource).toContain("selectedIds");
    expect(internalSource).toContain("Share selected");
    expect(internalSource).toContain("Download selected");
    expect(internalSource).toContain("shareJobAttachmentsToContractor");
  });

  it("keeps individual actions and adds contractor bulk download", () => {
    expect(internalSource).toContain("Share to Contractor");
    expect(internalSource).toContain("a.signedUrl ? (");
    expect(internalSource).toContain("Download\n");
    expect(portalSource).toContain("Download selected");
    expect(portalSource).toContain("Select all");
  });

  it("scopes bulk sharing and packages selected signed files as a zip", () => {
    expect(actionsSource).toContain("loadScopedInternalJobAttachmentsForMutation");
    expect(actionsSource).toContain("export async function shareJobAttachmentsToContractor");
    expect(actionsSource).toContain("attachment_ids: attachmentIds");
    expect(zipSource).toContain('import { zipSync } from "fflate"');
    expect(zipSource).toContain("URL.createObjectURL(blob)");
  });
});
