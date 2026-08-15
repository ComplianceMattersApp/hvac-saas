import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const notificationSource = readFileSync(resolve(__dirname, "../contractor-shared-job-update.ts"), "utf8");
const attachmentActionsSource = readFileSync(resolve(__dirname, "../../actions/attachment-actions.ts"), "utf8");
// Note actions moved to job-note-actions.ts; the job action surface spans both.
const jobActionsSource = [
  resolve(__dirname, "../../actions/job-actions.ts"),
  resolve(__dirname, "../../actions/job-note-actions.ts"),
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("contractor shared job update email wiring", () => {
  it("emails contractor portal recipients and records a deduplicated delivery", () => {
    expect(notificationSource).toContain("resolveContractorPortalRecipientEmails");
    expect(notificationSource).toContain("CONTRACTOR_SHARED_JOB_UPDATE_EMAIL_TYPE");
    expect(notificationSource).toContain('.contains("payload", { event_id: eventId })');
    expect(notificationSource).toContain("await sendEmail({ to: recipients, subject, html })");
    expect(notificationSource).toContain("/portal/jobs/${jobId}");
  });

  it("notifies once for a shared note and once for an attachment batch", () => {
    expect(jobActionsSource).toContain("notifyContractorOfSharedJobUpdate");
    expect(jobActionsSource).toContain("contractor_shared_note_email_failed");
    expect(attachmentActionsSource).toContain("contractor_attachment_share_email_failed");
    expect(attachmentActionsSource).toContain("contractor_bulk_attachment_share_email_failed");
    expect(attachmentActionsSource).toContain("fileNames,");
  });

  it("keeps email delivery best-effort after shared truth is written", () => {
    const eventWrite = attachmentActionsSource.indexOf('event_type: "public_note"', attachmentActionsSource.indexOf("shareJobAttachmentsToContractor"));
    const notification = attachmentActionsSource.indexOf("await notifyContractorOfSharedJobUpdate", eventWrite);
    expect(eventWrite).toBeGreaterThan(-1);
    expect(notification).toBeGreaterThan(eventWrite);
    expect(notificationSource).toContain('update({ status: "failed" })');
  });
});
