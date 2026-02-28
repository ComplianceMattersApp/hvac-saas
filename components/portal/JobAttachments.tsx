"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobAttachmentUploadToken,
  revalidatePortalJob,
} from "@/lib/actions/attachment-actions";

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

    // If your server action returns attachmentId, use it; otherwise null is fine
    return (tok as any).attachmentId ?? null;
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

        // Multi-purpose: log a contractor_note only if there is content
        if (trimmed || uploadedIds.length > 0) {
          const { error: evErr } = await supabase.from("job_events").insert({
            job_id: jobId,
            event_type: "contractor_note",
            meta: {
              note: trimmed || null,
              attachment_ids: uploadedIds,
              caption: caption.trim() || null,
              file_names: files.map((f) => f.name),
            },
          });

          if (evErr) throw new Error(evErr.message);
        }

        await revalidatePortalJob(jobId);
        router.refresh();

        setFiles([]);
        setCaption("");
        setNote("");
        setOk("Files uploaded successfully.");
      } catch (e: any) {
        setError(e?.message ?? "Upload failed");
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

        // Correction submission event (allowed by your RLS allow-list)
        const { error: evErr } = await supabase.from("job_events").insert({
          job_id: jobId,
          event_type: "contractor_correction_submission",
          meta: {
            note: trimmed || null,
            attachment_ids: uploadedIds,
            caption: caption.trim() || null,
            file_names: files.map((f) => f.name),
          },
        });

        if (evErr) throw new Error(evErr.message);

        // Mark job as "needs internal review"
        const { error: rpcErr } = await supabase.rpc(
          "mark_job_needs_internal_review",
          { p_job_id: jobId }
        );
        if (rpcErr) throw new Error(rpcErr.message);

        await revalidatePortalJob(jobId);
        router.refresh();

        setFiles([]);
        setCaption("");
        setNote("");
        setOk(
          "Submitted for review. Thank you — we’ll review and schedule next steps."
        );
      } catch (e: any) {
        setError(e?.message ?? "Submit failed");
      }
    });
  }

  return (
    <div className="rounded-xl border bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="text-sm font-semibold">Photos / Documents</div>
        <div className="text-xs text-gray-500 dark:text-gray-300">
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

        {error ? (
          <div className="text-sm text-red-600 dark:text-red-300">{error}</div>
        ) : null}

        {ok ? (
          <div className="text-sm text-emerald-700 dark:text-emerald-300">
            {ok}
          </div>
        ) : null}

        {/* Choose files */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border bg-white dark:bg-gray-900 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
          >
            Choose Files
          </button>

          <div className="text-xs text-gray-600 dark:text-gray-300">
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
          className="w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900"
          disabled={isPending}
        />

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (model/serial, context, what changed, etc.)"
          className="w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900"
          rows={4}
          disabled={isPending}
        />

        {/* Intent */}
<div className="space-y-2">
  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
    What are you sending this for?
  </div>

  <div className="flex flex-col sm:flex-row gap-2">
    <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer bg-white dark:bg-gray-900">
      <input
        type="radio"
        name="intent"
        checked={intent === "upload"}
        onChange={() => setIntent("upload")}
        className="mt-1"
        disabled={isPending}
      />
      <div>
        <div className="text-sm font-medium">Upload only</div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          Share photos/documents (ex: model/serial photos). No retest request.
        </div>
      </div>
    </label>

    <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer bg-white dark:bg-gray-900">
      <input
        type="radio"
        name="intent"
        checked={intent === "review"}
        onChange={() => setIntent("review")}
        className="mt-1"
        disabled={isPending}
      />
      <div>
        <div className="text-sm font-medium">Correction / Ready for review</div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          Marks this job as “Needs internal review” (usually leads to a retest).
        </div>
      </div>
    </label>
  </div>
</div>

{/* Action */}
<button
  type="button"
  onClick={intent === "review" ? submitForReview : uploadOnly}
  disabled={!canAct}
  className={[
    "px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50",
    intent === "review"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "border bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800",
  ].join(" ")}
>
  {isPending
    ? intent === "review"
      ? "Submitting…"
      : "Uploading…"
    : intent === "review"
    ? "Submit for Review"
    : "Upload Files"}
</button>

        {/* Existing attachments list (images only thumbs) */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          {!initialItems || initialItems.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">
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
                    className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 overflow-hidden"
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
                      <div className="w-full h-40 flex items-center justify-center text-xs text-gray-500 dark:text-gray-300 bg-white/40 dark:bg-gray-900/30">
                        {a.content_type ? a.content_type : "file"}
                      </div>
                    )}

                    <div className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {a.file_name}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300">
                          {a.caption ? a.caption : "—"}
                        </div>
                      </div>

                      {a.signedUrl ? (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition whitespace-nowrap"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-300">
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