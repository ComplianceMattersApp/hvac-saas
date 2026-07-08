"use client";

import { useState } from "react";

type RefrigerantEvidenceImageProps = {
  src: string | null;
  alt: string;
  variant?: "refrigerant" | "equipmentLabel";
};

export default function RefrigerantEvidenceImage({
  src,
  alt,
  variant = "refrigerant",
}: RefrigerantEvidenceImageProps) {
  const [failed, setFailed] = useState(false);
  const isEquipmentLabel = variant === "equipmentLabel";
  const imageClass =
    isEquipmentLabel
      ? "block h-72 w-full rounded-md border border-slate-200 bg-white object-contain transition-transform duration-200 group-hover:scale-150 group-focus-visible:scale-150 print:h-52 print:rounded-none print:border-slate-400 print:transition-none print:group-hover:scale-100 print:group-focus-visible:scale-100"
      : "block max-h-[28rem] w-full rounded-md border border-slate-200 bg-white object-contain transition-transform duration-200 group-hover:scale-125 group-focus-visible:scale-125 print:max-h-[7.5in] print:rounded-none print:border-slate-400 print:transition-none print:group-hover:scale-100 print:group-focus-visible:scale-100";
  const unavailableMessage = isEquipmentLabel
    ? "Equipment label photo is on file but could not be displayed in this report view."
    : "Refrigerant evidence photo is on file but could not be displayed in this report view.";

  if (!src || failed) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs font-medium text-slate-600 print:min-h-24">
        {unavailableMessage}
      </div>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      title="Open full-size image"
      className="group block overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 print:pointer-events-none"
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={imageClass}
        onError={() => setFailed(true)}
      />
      <span className="sr-only">Open full-size image</span>
    </a>
  );
}
