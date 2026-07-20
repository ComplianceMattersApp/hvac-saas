"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createEstimatePhotoUploadToken,
  discardEstimatePhotoUpload,
  finalizeEstimatePhotoUpload,
  updateEstimatePhoto,
} from "@/lib/actions/estimate-photo-actions";
import type { EstimatePhoto } from "@/lib/estimates/estimate-photos";

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";

export default function EstimatePhotos({ estimateId, initialPhotos, editable }: { estimateId: string; initialPhotos: EstimatePhoto[]; editable: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [customerVisible, setCustomerVisible] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function uploadFiles(files: File[]) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      let uploaded = 0;
      try {
        for (const file of files) {
          let photoId: string | null = null;
          try {
            const token = await createEstimatePhotoUploadToken({
              estimateId,
              fileName: file.name || `estimate-photo-${Date.now()}.jpg`,
              contentType: file.type || "image/jpeg",
              fileSize: file.size,
              caption,
              customerVisible,
            });
            photoId = token.photoId;
            const { error: uploadError } = await supabase.storage
              .from(token.bucket)
              .uploadToSignedUrl(token.path, token.token, file, { contentType: file.type || "image/jpeg" });
            if (uploadError) throw uploadError;
            uploaded += 1;
          } catch (uploadError) {
            if (photoId) await discardEstimatePhotoUpload({ estimateId, photoId }).catch(() => undefined);
            throw uploadError;
          }
        }
        await finalizeEstimatePhotoUpload({ estimateId });
        setCaption("");
        setMessage(`${uploaded} photo${uploaded === 1 ? "" : "s"} added.`);
        router.refresh();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Could not upload the photo.");
      }
    });
  }

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) void uploadFiles(files);
  }

  function savePhoto(photo: EstimatePhoto, formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateEstimatePhoto({
          estimateId,
          photoId: photo.id,
          caption: String(formData.get("caption") ?? ""),
          customerVisible: formData.get("customer_visible") === "on",
        });
        setMessage("Photo details updated.");
        router.refresh();
      } catch {
        setError("Could not update the photo.");
      }
    });
  }

  function removePhoto(photo: EstimatePhoto) {
    if (!window.confirm("Remove this photo from the estimate?")) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await discardEstimatePhotoUpload({ estimateId, photoId: photo.id });
        setMessage("Photo removed.");
        router.refresh();
      } catch {
        setError("Could not remove the photo.");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/85 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] print:hidden">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Estimate Photos</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Take jobsite photos or choose them from your phone. Customer-visible photos appear on the proposal.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{initialPhotos.length}/12</span>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={selectFiles} disabled={isPending} />
        <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="hidden" onChange={selectFiles} disabled={isPending} />

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div> : null}

        {editable ? <><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input value={caption} onChange={(event) => setCaption(event.target.value)} className={inputClass} maxLength={160} placeholder="Optional caption, such as Existing condenser" disabled={isPending} />
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={customerVisible} onChange={(event) => setCustomerVisible(event.target.checked)} disabled={isPending} />
            Show on proposal
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={isPending || initialPhotos.length >= 12} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50">
            <Camera className="h-4 w-4" /> {isPending ? "Uploading..." : "Take Photo"}
          </button>
          <button type="button" onClick={() => libraryRef.current?.click()} disabled={isPending || initialPhotos.length >= 12} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
            <ImagePlus className="h-4 w-4" /> Choose Photos
          </button>
        </div></> : <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Photos are read-only after the estimate leaves draft status.</p>}

        {initialPhotos.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initialPhotos.map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
                <a href={photo.signedUrl} target="_blank" rel="noreferrer"><img src={photo.signedUrl} alt={photo.caption || photo.fileName} className="h-44 w-full bg-slate-100 object-cover" /></a>
                {editable ? <form action={(formData) => savePhoto(photo, formData)} className="space-y-2 p-3">
                  <input name="caption" defaultValue={photo.caption ?? ""} maxLength={160} className={inputClass} placeholder="Photo caption" />
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input name="customer_visible" type="checkbox" defaultChecked={photo.customerVisible} /> Show on customer proposal</label>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button type="submit" disabled={isPending} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">Save</button>
                    <button type="button" onClick={() => removePhoto(photo)} disabled={isPending} aria-label="Remove photo" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </form> : <div className="p-3"><div className="text-sm text-slate-700">{photo.caption || photo.fileName}</div><div className="mt-1 text-xs font-medium text-slate-500">{photo.customerVisible ? "Shown on customer proposal" : "Internal only"}</div></div>}
              </article>
            ))}
          </div>
        ) : <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No estimate photos yet.</div>}
      </div>
    </section>
  );
}
