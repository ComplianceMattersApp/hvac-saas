"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobAttachmentUploadToken,
  finalizePortalAttachmentSubmission,
  revalidatePortalJob,
} from "@/lib/actions/attachment-actions";
import ActionFeedback from "@/components/ui/ActionFeedback";

const portalPrimaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_16px_28px_-20px_rgba(37,99,235,0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:opacity-50";
const portalSecondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800";
const portalInputClass =
  "w-full rounded-xl border border-slate-300/80 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

type Item = {
  id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string;
  signedUrl: string | null;
};

function attachmentErrorMessage(intent: "upload" | "review") {
  return intent === "review" ? "Could not save changes." : "Could not upload files.";
}

function getActionErrorMessage(intent: "upload" | "review", error: unknown) {
  const fallback = attachmentErrorMessage(intent);
  if (!error || typeof error !== "object") return fallback;

  const message = "message" in error ? String((error as { message?: unknown }).message ?? "").trim() : "";
  if (!message) return fallback;

  if (message === "Correction review submission is only available for failed ECC jobs.") {
    return message;
  }

  return fallback;
}

export default function JobAttachments({
  jobId,
  initialItems,
}: {
  jobId: string;
  initialItems: Item[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // UI state
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [intent, setIntent] = useState<"upload" | "review">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasFiles = files.length > 0;
  const canAct = !isPending && (hasFiles || note.trim().length > 0);

  function openPicker() {
    setError(null);
    setOk(null);

    if (!fileRef.current) return;

    // Critical: allows reopening & reselecting same file reliably
    fileRef.current.value = "";
    fileRef.current.click();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    // Critical: clear after selection too
    e.target.value = "";
  }

  async function uploadOne(file: File) {
    // 1) Create DB row + signed upload token/url (server action)
    const tok = await createJobAttachmentUploadToken({
      jobId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      caption: caption.trim() || undefined,
    });

    // 2) Upload to storage using signed token (client)
    const { error: upErr } = await supabase.storage
      .from(tok.bucket)
      .uploadToSignedUrl(tok.path, tok.token, file, {
        contentType: file.type || "application/octet-stream",
      });

    if (upErr) throw new Error(upErr.message);

    return tok.attachmentId ?? null;
  }

  async function uploadOnly() {
    setError(null);
    setOk(null);

    startTransition(async () => {
      try {
        const uploadedIds: string[] = [];

        for (const f of files) {
          const id = await uploadOne(f);
          if (id) uploadedIds.push(id);
        }

        const trimmed = note.trim();

        await finalizePortalAttachmentSubmission({
          jobId,
          intent: "upload",
          note: trimmed,
          caption: caption.trim(),
          attachmentIds: uploadedIds,
          fileNames: files.map((f) => f.name),
        });

        await revalidatePortalJob(jobId);
        router.refresh();

        setFiles([]);
        setCaption("");
        setNote("");
        setOk("Upload complete.");
      } catch (e) {
        console.error("portal uploadOnly failed", e);
        setError(getActionErrorMessage("upload", e));
      }
    });
  }

  async function submitForReview() {
    setError(null);
    setOk(null);

    startTransition(async () => {
      try {
        const uploadedIds: string[] = [];

        for (const f of files) {
          const id = await uploadOne(f);
          if (id) uploadedIds.push(id);
        }

        const trimmed = note.trim();

        await finalizePortalAttachmentSubmission({
          jobId,
          intent: "review",
          note: trimmed,
          caption: caption.trim(),
          attachmentIds: uploadedIds,
          fileNames: files.map((f) => f.name),
        });

        await revalidatePortalJob(jobId);
        router.refresh();

        setFiles([]);
        setCaption("");
        setNote("");
        setOk("Submission received.");
      } catch (e) {
        console.error("portal submitForReview failed", e);
        setError(getActionErrorMessage("review", e));
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/96 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.22)] dark:border-slate-800 dark:bg-slate-950/85">
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">Photos / Documents</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Share supporting files or submit corrections for review.</div>
        </div>
        <div className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {initialItems?.length ?? 0} files
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={onPickFiles}
          className="hidden"
          disabled={isPending}
        />

        <ActionFeedback type="error" message={error} />
        <ActionFeedback type="success" message={ok} />

        {/* Choose files */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className={portalSecondaryButtonClass}
          >
            Choose Files
          </button>

          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {hasFiles ? (
              <>Selected: {files.map((f) => f.name).join(", ")}</>
            ) : (
              <>No files selected</>
            )}
          </div>
        </div>

        {/* Caption */}
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption (e.g., before/after, gauges, etc.)"
          className={portalInputClass}
          disabled={isPending}
        />

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (model/serial, context, what changed, etc.)"
          className={portalInputClass}
          rows={4}
          disabled={isPending}
        />

        {/* Intent */}
<div className="space-y-2">
  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
    What are you sending this for?
  </div>

  <div className="flex flex-col sm:flex-row gap-2">
    <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${intent === "upload" ? "border-slate-300 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-900" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"}`}>
      <input
        type="radio"
        name="intent"
        checked={intent === "upload"}
        onChange={() => setIntent("upload")}
        className="mt-1"
        disabled={isPending}
      />
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Upload only</div>
        <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">
          Share photos/documents (ex: model/serial photos). No retest request.
        </div>
      </div>
    </label>

    <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${intent === "review" ? "border-blue-200 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"}`}>
      <input
        type="radio"
        name="intent"
        checked={intent === "review"}
        onChange={() => setIntent("review")}
        className="mt-1"
        disabled={isPending}
      />
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Correction / Ready for review</div>
        <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">
          Marks this job as “Needs internal review” (usually leads to a retest).
        </div>
      </div>
    </label>
  </div>
</div>

{/* Action */}
<div className="text-xs text-slate-500 dark:text-slate-300">
If this job failed testing, choose &quot;Correction / Ready for review&quot;.
</div>
<button
  type="button"
  onClick={intent === "review" ? submitForReview : uploadOnly}
  disabled={!canAct}
  className={intent === "review" ? portalPrimaryButtonClass : portalSecondaryButtonClass}
>
  {isPending
    ? intent === "review"
      ? "Submitting..."
      : "Uploading..."
    : intent === "review"
    ? "Submit for Review"
    : "Upload Files"}
</button>

        {/* Existing attachments list (images only thumbs) */}
        <div className="border-t border-slate-200/80 pt-2 dark:border-slate-800">
          {!initialItems || initialItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-300">
              No files uploaded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {initialItems.map((a) => {
                const isImage =
                  !!a.content_type &&
                  a.content_type.toLowerCase().startsWith("image/");
                const hasThumb = isImage && !!a.signedUrl;

                return (
                  <div
                    key={a.id}
                    className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/80 shadow-[0_12px_24px_-26px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-900/55"
                  >
                    {hasThumb ? (
                      <a href={a.signedUrl!} target="_blank" rel="noreferrer">
                        <img
                          src={a.signedUrl!}
                          alt={a.file_name}
                          className="w-full h-40 object-cover bg-black/5"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center bg-white/50 text-xs text-slate-500 dark:bg-slate-950/40 dark:text-slate-300">
                        {a.content_type ? a.content_type : "file"}
                      </div>
                    )}

                    <div className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {a.file_name}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {a.caption ? a.caption : "—"}
                        </div>
                      </div>

                      {a.signedUrl ? (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-300">
                          (no link)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}