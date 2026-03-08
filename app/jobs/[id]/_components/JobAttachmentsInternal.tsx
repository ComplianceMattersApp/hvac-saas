"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createJobAttachmentUploadToken } from "@/lib/actions/attachment-actions";

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

export default function JobAttachmentsInternal({
  jobId,
  initialItems,
}: {
  jobId: string;
  initialItems: Item[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasFiles = files.length > 0;
  const canAct = !isPending && hasFiles;

  function openPicker() {
    setError(null);
    setOk(null);
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    e.target.value = "";
  }

  async function uploadOne(file: File) {
    const tok = await createJobAttachmentUploadToken({
      jobId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      caption: caption.trim() || undefined,
    });

    const { error: upErr } = await supabase.storage
      .from(tok.bucket)
      .uploadToSignedUrl(tok.path, tok.token, file, {
        contentType: file.type || "application/octet-stream",
      });

    if (upErr) throw new Error(upErr.message);
    return (tok as any).attachmentId ?? null;
  }

  async function uploadInternal() {
    setError(null);
    setOk(null);

    startTransition(async () => {
      try {
        const uploadedIds: string[] = [];

        for (const f of files) {
          const id = await uploadOne(f);
          if (id) uploadedIds.push(id);
        }

        const fileNames = files.map((f) => f.name);
        const count = fileNames.length;
        const trimmed = note.trim();

        // Single summary event for the whole batch
        const { error: evErr } = await supabase.from("job_events").insert({
          job_id: jobId,
          event_type: "attachment_added",
          meta: {
            source: "internal",
            count,
            note: trimmed || null,
            caption: caption.trim() || null,
            attachment_ids: uploadedIds,
            file_names: fileNames,
          },
        });

        if (evErr) throw new Error(evErr.message);

        setFiles([]);
        setCaption("");
        setNote("");
        setOk(`Uploaded ${count} attachment${count === 1 ? "" : "s"}.`);
        router.refresh();
      } catch (e: any) {
        setError(e?.message ?? "Upload failed");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-white text-gray-900 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm font-semibold">Attachments</div>
        <div className="text-xs text-gray-500">
          {initialItems?.length ?? 0} files
        </div>
      </div>

      <div className="p-4 space-y-4">
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={onPickFiles}
          className="hidden"
          disabled={isPending}
        />

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {ok ? <div className="text-sm text-emerald-700">{ok}</div> : null}

          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Choose Files
          </button>

          <div className="text-xs text-gray-700">
            {hasFiles
              ? `Selected: ${files.length} file${files.length === 1 ? "" : "s"}`
              : "No files selected"}
          </div>
        </div>

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption (e.g., gauges, nameplate, permit photo)"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
          disabled={isPending}
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for this upload batch..."
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
          rows={3}
          disabled={isPending}
        />

        <button
          type="button"
          onClick={uploadInternal}
          disabled={!canAct}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Upload Files"}
        </button>

        <div className="pt-2 border-t border-gray-200">
          {!initialItems || initialItems.length === 0 ? (
        <div className="text-sm text-gray-700">No files uploaded yet.</div>
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
                    className="rounded-lg border bg-gray-50 overflow-hidden"
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
                      <div className="w-full h-40 flex items-center justify-center text-xs text-gray-500 bg-white/40">
                        {a.content_type ? a.content_type : "file"}
                      </div>
                    )}

                    <div className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {a.file_name}
                        </div>
                        <div className="text-xs text-gray-600">
                          {a.caption ? a.caption : "—"}
                        </div>
                      </div>

                      {a.signedUrl ? (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-gray-50 transition whitespace-nowrap"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-500">
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