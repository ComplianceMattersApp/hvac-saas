"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobAttachmentUploadToken,
  shareJobAttachmentToContractor,
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

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatAttachmentDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function fileExtension(name: string) {
  const trimmed = String(name ?? "").trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return "FILE";
  return trimmed.slice(lastDot + 1).toUpperCase();
}

function fileTypeLabel(contentType: string | null, name: string) {
  const normalized = String(contentType ?? "").toLowerCase();
  if (normalized.startsWith("image/")) return "Image";
  if (normalized.includes("pdf")) return "PDF";
  if (normalized.includes("spreadsheet") || normalized.includes("excel") || normalized.includes("csv")) return "Spreadsheet";
  if (normalized.includes("word") || normalized.includes("document") || normalized.includes("text/")) return "Document";
  if (normalized.includes("zip") || normalized.includes("archive") || normalized.includes("compressed")) return "Archive";
  return fileExtension(name);
}

function fileGlyph(contentType: string | null, name: string) {
  const normalized = String(contentType ?? "").toLowerCase();
  if (normalized.startsWith("image/")) return "IMG";
  if (normalized.includes("pdf")) return "PDF";
  if (normalized.includes("spreadsheet") || normalized.includes("excel") || normalized.includes("csv")) return "XLS";
  if (normalized.includes("word") || normalized.includes("document") || normalized.includes("text/")) return "DOC";
  if (normalized.includes("zip") || normalized.includes("archive") || normalized.includes("compressed")) return "ZIP";
  return fileExtension(name);
}

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
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [failedPreviewIds, setFailedPreviewIds] = useState<Set<string>>(
    () => new Set()
  );
  const [sharedAttachmentIds, setSharedAttachmentIds] = useState<Set<string>>(
    () => new Set()
  );

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
    return (tok as { attachmentId?: string | null }).attachmentId ?? null;
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  async function shareToContractor(attachment: Item) {
    if (sharedAttachmentIds.has(attachment.id)) return;

    setError(null);
    setOk(null);
    setSharingId(attachment.id);

    try {
      await shareJobAttachmentToContractor({
        jobId,
        attachmentId: attachment.id,
      });

      setSharedAttachmentIds((prev) => new Set(prev).add(attachment.id));
      setOk(`Shared "${attachment.file_name}" to contractor.`);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Share failed");
    } finally {
      setSharingId(null);
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white/96 text-gray-900 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.22)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="text-sm font-semibold">Upload & Share</div>
        <div className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
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

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
          >
            Choose Files
          </button>

          <div className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600">
            {hasFiles
              ? `Selected: ${files.length} file${files.length === 1 ? "" : "s"}`
              : "No files selected"}
          </div>
        </div>

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption (e.g., gauges, nameplate, permit photo)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-slate-400"
          disabled={isPending}
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for this upload batch..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-slate-400"
          rows={3}
          disabled={isPending}
        />

          <button
          type="button"
          onClick={uploadInternal}
          disabled={!canAct}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Upload Files"}
        </button>

        <div className="border-t border-slate-200 pt-2">
          {!initialItems || initialItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/72 px-4 py-8 text-center text-sm text-slate-600">
              <div className="font-medium text-slate-700">No files uploaded yet.</div>
              <div className="mt-1 text-xs text-slate-500">Upload job photos, reports, or permit documents here.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {initialItems.map((a) => {
                const isImage =
                  !!a.content_type &&
                  a.content_type.toLowerCase().startsWith("image/");
                const hasThumb =
                  isImage &&
                  !!a.signedUrl &&
                  !failedPreviewIds.has(a.id);
                const isShared = sharedAttachmentIds.has(a.id);
                const createdLabel = formatAttachmentDate(a.created_at);
                const sizeLabel = formatFileSize(a.file_size);
                const typeLabel = fileTypeLabel(a.content_type, a.file_name);
                const glyph = fileGlyph(a.content_type, a.file_name);

                return (
                  <div
                    key={a.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_20px_-24px_rgba(15,23,42,0.22)] transition-shadow hover:shadow-[0_16px_28px_-24px_rgba(15,23,42,0.24)]"
                  >
                    {hasThumb ? (
                      <a
                        href={a.signedUrl!}
                        target="_blank"
                        rel="noreferrer"
                        className="group block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                        aria-label={`Open ${a.file_name}`}
                        title={`Open ${a.file_name}`}
                      >
                        <img
                          src={a.signedUrl!}
                          alt={a.file_name}
                          className="h-32 w-full object-cover bg-slate-100 transition-transform duration-200 group-hover:scale-[1.01]"
                          loading="lazy"
                          onError={() => {
                            setFailedPreviewIds((prev) => {
                              if (prev.has(a.id)) return prev;
                              const next = new Set(prev);
                              next.add(a.id);
                              return next;
                            });
                          }}
                        />
                      </a>
                    ) : (
                      <div className="flex h-28 w-full items-center gap-3 bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4">
                        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-semibold tracking-[0.12em] text-slate-500 shadow-sm">
                          {glyph}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800" title={a.file_name}>
                            {a.file_name}
                          </div>
                          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                            {typeLabel}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {hasThumb ? (
                            <div
                              className="truncate text-sm font-semibold text-slate-900"
                              title={a.file_name}
                            >
                              {a.file_name}
                            </div>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                              {typeLabel}
                            </span>
                            {sizeLabel ? <span>{sizeLabel}</span> : null}
                            {createdLabel ? <span>{createdLabel}</span> : null}
                          </div>
                        </div>

                        {a.signedUrl && !hasThumb ? (
                          <a
                            href={a.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
                          >
                            Open
                          </a>
                        ) : null}
                      </div>

                      {a.caption ? (
                        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                          <div className="line-clamp-2 text-sm text-slate-700">
                            {a.caption}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                        <button
                          type="button"
                          onClick={() => shareToContractor(a)}
                          disabled={isPending || sharingId === a.id || isShared}
                          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          {isShared
                            ? "Shared ✓"
                            : sharingId === a.id
                            ? "Sharing..."
                            : "Share to Contractor"}
                        </button>

                        {a.signedUrl ? (
                          <a
                            href={a.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-black whitespace-nowrap"
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
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