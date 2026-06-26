"use client";

import { useState } from "react";

type RefrigerantEvidenceImageProps = {
  src: string | null;
  alt: string;
};

export default function RefrigerantEvidenceImage({ src, alt }: RefrigerantEvidenceImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs font-medium text-slate-600 print:min-h-24">
        Refrigerant evidence photo is on file but could not be displayed in this report view.
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="block max-h-[28rem] w-full rounded-md border border-slate-200 bg-white object-contain print:max-h-[7.5in] print:rounded-none print:border-slate-400"
      onError={() => setFailed(true)}
    />
  );
}
