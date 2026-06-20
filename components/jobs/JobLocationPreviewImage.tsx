"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

type JobLocationPreviewImageProps = {
  imageUrl: string | null;
  imageAlt: string;
  addressDisplay: string;
  mapsSearchUrl: string;
  showAddressOverlay?: boolean;
};

export default function JobLocationPreviewImage({
  imageUrl,
  imageAlt,
  addressDisplay,
  mapsSearchUrl,
  showAddressOverlay,
}: JobLocationPreviewImageProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const canShowImage = Boolean(imageUrl) && !imageFailed;

  return (
    <a
      href={mapsSearchUrl}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm transition hover:border-slate-300"
      aria-label={`Open ${addressDisplay} in Google Maps`}
    >
      {canShowImage ? (
        <img
          src={imageUrl ?? ""}
          alt=""
          aria-label={imageAlt}
          className="h-40 w-full object-cover transition duration-200 group-hover:scale-[1.01] sm:h-52 lg:h-56 xl:h-60"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-40 w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm font-medium text-slate-600 sm:h-52 lg:h-56 xl:h-60">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-semibold text-slate-800">Map preview unavailable</span>
          {!showAddressOverlay ? (
            <span className="max-w-md text-xs leading-5 text-slate-600">{addressDisplay}</span>
          ) : null}
        </div>
      )}

      {showAddressOverlay && addressDisplay ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2.5 sm:p-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-slate-950/52 px-3 py-2 text-base font-semibold leading-6 text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.75)] backdrop-blur-sm sm:px-3.5 sm:py-2.5 sm:text-lg lg:text-[1.15rem]">
            <MapPin className="h-4 w-4 shrink-0 text-white/90 sm:h-5 sm:w-5" aria-hidden="true" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{addressDisplay}</span>
          </div>
        </div>
      ) : null}
    </a>
  );
}
