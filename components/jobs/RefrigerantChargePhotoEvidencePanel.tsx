"use client";

import { useMemo, useRef, useState, useTransition, type ChangeEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobAttachmentUploadToken,
  discardInternalJobAttachmentUpload,
  finalizeInternalJobAttachmentUpload,
} from "@/lib/actions/attachment-actions";

type EvidenceAttachment = {
  id: string;
  fileName: string;
  uploadedAt: string;
  caption: string | null;
  signedUrl: string | null;
};

type Props = {
  jobId: string;
  systemName?: string | null;
  evidenceAttachments: EvidenceAttachment[];
};

function formatUploadDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "(date unavailable)";
  return parsed.toLocaleString();
}

export default function RefrigerantChargePhotoEvidencePanel({
  jobId,
  systemName,
  evidenceAttachments,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const takePhotoRef = useRef<HTMLInputElement | null>(null);
  const uploadPhotoRef = useRef<HTMLInputElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultLabel = systemName
    ? `Refrigerant Charge Photo - ${systemName}`
    : "Refrigerant Charge Photo";

  function pickWith(ref: RefObject<HTMLInputElement | null>) {
    setError(null);
    setOk(null);
    if (!ref.current) return;
    ref.current.value = "";
    ref.current.click();
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setPendingFiles(files);
    event.target.value = "";
  }

  async function uploadOne(file: File) {
    const token = await createJobAttachmentUploadToken({
      jobId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      caption: defaultLabel,
      attachmentEvidenceContext: "refrigerant_charge_photo",
    });

    try {
      const { error: uploadError } = await supabase.storage
        .from(token.bucket)
        .uploadToSignedUrl(token.path, token.token, file, {
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) throw new Error(uploadError.message);
      return (token as { attachmentId?: string | null }).attachmentId ?? null;
    } catch (uploadError) {
      const attachmentId = (token as { attachmentId?: string | null }).attachmentId ?? null;
      if (attachmentId) {
        try {
          await discardInternalJobAttachmentUpload({ jobId, attachmentId });
        } catch (cleanupError) {
          console.error("discardInternalJobAttachmentUpload failed", cleanupError);
        }
      }
      throw uploadError;
    }
  }

  function uploadSelectedFiles() {
    if (!pendingFiles.length || isPending) return;
    setError(null);
    setOk(null);

    startTransition(async () => {
      const uploadedIds: string[] = [];

      try {
        for (const file of pendingFiles) {
          const attachmentId = await uploadOne(file);
          if (attachmentId) uploadedIds.push(attachmentId);
        }

        await finalizeInternalJobAttachmentUpload({
          jobId,
          caption: defaultLabel,
          note: "Refrigerant charge photo evidence",
          attachmentIds: uploadedIds,
          fileNames: pendingFiles.map((file) => file.name),
          attachmentEvidenceContext: "refrigerant_charge_photo",
        });

        setPendingFiles([]);
        setOk(`Uploaded ${uploadedIds.length} photo${uploadedIds.length === 1 ? "" : "s"}.`);
        router.refresh();
      } catch (uploadError) {
        for (const attachmentId of uploadedIds) {
          try {
            await discardInternalJobAttachmentUpload({ jobId, attachmentId });
          } catch (cleanupError) {
            console.error("discardInternalJobAttachmentUpload failed", cleanupError);
          }
        }
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
      <input
        ref={takePhotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={onPickFiles}
        className="hidden"
        disabled={isPending}
      />
      <input
        ref={uploadPhotoRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPickFiles}
        className="hidden"
        disabled={isPending}
      />

      <div className="font-medium text-slate-900">Refrigerant Charge Photo Evidence</div>
      <div className="mt-1 text-slate-600">
        Photos save to the job attachment library and stay tied to this evidence record.
      </div>

      {error ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          {ok}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => pickWith(takePhotoRef)}
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Take Photo
        </button>
        <button
          type="button"
          onClick={() => pickWith(uploadPhotoRef)}
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Upload Photo
        </button>
        <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600">
          {pendingFiles.length
            ? `${pendingFiles.length} selected`
            : "No photo selected"}
        </span>
      </div>

      {pendingFiles.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={uploadSelectedFiles}
            disabled={isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Uploading..." : "Save Photo Evidence"}
          </button>
          <button
            type="button"
            onClick={() => setPendingFiles([])}
            disabled={isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      ) : null}

      {evidenceAttachments.length ? (
        <div className="mt-3 space-y-2">
          {evidenceAttachments.slice(0, 3).map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
            >
              <div className="font-medium text-emerald-900">
                {attachment.caption || "Refrigerant Charge Photo"}
              </div>
              <div className="mt-1 break-all text-emerald-800">{attachment.fileName}</div>
              <div className="mt-1 text-emerald-700">
                Uploaded {formatUploadDate(attachment.uploadedAt)}
              </div>
              {attachment.signedUrl ? (
                <a
                  href={attachment.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  Open attachment
                </a>
              ) : null}
            </div>
          ))}

          {evidenceAttachments.length > 3 ? (
            <div className="text-slate-600">
              +{evidenceAttachments.length - 3} more refrigerant charge evidence file(s) in Attachments.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-600">
          No refrigerant charge photo attached yet.
        </div>
      )}
    </div>
  );
}
