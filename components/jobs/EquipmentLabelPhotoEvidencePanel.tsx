"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobAttachmentUploadToken,
  discardInternalJobAttachmentUpload,
  finalizeInternalJobAttachmentUpload,
} from "@/lib/actions/attachment-actions";
import { buildEquipmentLabelPhotoCaption } from "@/lib/jobs/refrigerant-charge-evidence";

type EvidenceAttachment = {
  id: string;
  fileName: string;
  uploadedAt: string;
  caption: string | null;
  signedUrl: string | null;
};

type Props = {
  jobId: string;
  equipmentId: string;
  systemId?: string | null;
  systemName?: string | null;
  equipmentLabel?: string | null;
  evidenceAttachments?: EvidenceAttachment[];
  variant?: "panel" | "action";
  onSavedChange?: (saved: boolean) => void;
  saveWithParentForm?: boolean;
};

function formatUploadDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "(date unavailable)";
  return parsed.toLocaleString();
}

export default function EquipmentLabelPhotoEvidencePanel({
  jobId,
  equipmentId,
  systemId,
  systemName,
  equipmentLabel,
  evidenceAttachments = [],
  variant = "panel",
  onSavedChange,
  saveWithParentForm = false,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const takePhotoRef = useRef<HTMLInputElement | null>(null);
  const uploadPhotoRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bypassNextSubmitRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultLabel = [
    "Equipment Label Photo",
    systemName ? `- ${systemName}` : "",
    equipmentLabel ? `- ${equipmentLabel}` : "",
  ].filter(Boolean).join(" ");
  const savedCount = evidenceAttachments.length;
  const isActionVariant = variant === "action";
  const secondaryButtonClass = `${isActionVariant ? "flex-1 sm:flex-none" : ""} inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50`;

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
    const caption = buildEquipmentLabelPhotoCaption({
      equipmentId,
      systemId,
      caption: defaultLabel,
    });
    const token = await createJobAttachmentUploadToken({
      jobId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      caption: caption ?? defaultLabel,
      attachmentEvidenceContext: "equipment_label_photo",
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

  async function saveSelectedFiles(refreshAfterSave = true) {
    if (!pendingFiles.length) return true;
    setError(null);
    setOk(null);
    const uploadedIds: string[] = [];

    try {
      for (const file of pendingFiles) {
        const attachmentId = await uploadOne(file);
        if (attachmentId) uploadedIds.push(attachmentId);
      }

      await finalizeInternalJobAttachmentUpload({
        jobId,
        caption: defaultLabel,
        note: "Equipment label photo evidence",
        attachmentIds: uploadedIds,
        fileNames: pendingFiles.map((file) => file.name),
        attachmentEvidenceContext: "equipment_label_photo",
      });

      setPendingFiles([]);
      setOk("Label photo captured.");
      onSavedChange?.(true);
      if (refreshAfterSave) router.refresh();
      return true;
    } catch (uploadError) {
      for (const attachmentId of uploadedIds) {
        try {
          await discardInternalJobAttachmentUpload({ jobId, attachmentId });
        } catch (cleanupError) {
          console.error("discardInternalJobAttachmentUpload failed", cleanupError);
        }
      }
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      return false;
    }
  }

  function uploadSelectedFiles() {
    if (!pendingFiles.length || isPending) return;
    startTransition(async () => {
      await saveSelectedFiles();
    });
  }

  useEffect(() => {
    if (!saveWithParentForm) return;
    const form = rootRef.current?.closest("form");
    if (!form) return;

    const handleSubmit = async (event: SubmitEvent) => {
      if (bypassNextSubmitRef.current) {
        bypassNextSubmitRef.current = false;
        return;
      }
      if (!pendingFiles.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (uploadInFlightRef.current) return;
      uploadInFlightRef.current = true;
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const saved = await saveSelectedFiles(false).finally(() => {
        uploadInFlightRef.current = false;
      });
      if (!saved) return;
      bypassNextSubmitRef.current = true;
      form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [pendingFiles, saveWithParentForm]);

  return (
    <div ref={rootRef} className={isActionVariant ? "min-w-0 text-xs text-slate-700" : "border-t border-slate-200 pt-3 text-xs text-slate-700"}>
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

      {isActionVariant ? null : (
        <>
          <div className="font-medium text-slate-900">Equipment Label Photo</div>
          {savedCount ? (
            <div className="mt-1 font-medium text-emerald-700">
              Label photo captured
            </div>
          ) : (
            <div className="mt-1 text-slate-600">
              Take or upload the nameplate label as supporting evidence.
            </div>
          )}
        </>
      )}

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

      <div className={`${isActionVariant ? "flex" : "mt-3 flex"} flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={() => pickWith(takePhotoRef)}
          disabled={isPending}
          className={secondaryButtonClass}
        >
          Take Label Photo
        </button>
        <button
          type="button"
          onClick={() => pickWith(uploadPhotoRef)}
          disabled={isPending}
          className={secondaryButtonClass}
        >
          Upload Label Photo
        </button>
        <span className={`${isActionVariant && !pendingFiles.length && !savedCount ? "sr-only" : "inline-flex"} min-h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600`}>
          {pendingFiles.length ? `${pendingFiles.length} selected` : savedCount ? `${savedCount} saved` : "No photo selected"}
        </span>
      </div>

      {pendingFiles.length && !saveWithParentForm ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={uploadSelectedFiles}
            disabled={isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Uploading..." : "Save Label Photo"}
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

      {pendingFiles.length && saveWithParentForm ? (
        <div className="mt-2 text-xs font-medium text-blue-700">Photo will save when you complete this step.</div>
      ) : null}

      {evidenceAttachments.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {evidenceAttachments.slice(0, 2).map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.signedUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden border-l-2 border-emerald-200 bg-white pl-2"
            >
              {attachment.signedUrl ? (
                <img
                  src={attachment.signedUrl}
                  alt={attachment.caption || "Equipment label photo"}
                  className="h-24 w-full rounded-md object-cover"
                />
              ) : null}
              <div className="py-1.5">
                <div className="truncate font-medium text-emerald-900">
                  {attachment.caption || "Equipment label photo"}
                </div>
                <div className="mt-0.5 truncate text-emerald-700">
                  Uploaded {formatUploadDate(attachment.uploadedAt)}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
