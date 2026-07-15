"use client";

import { useRef } from "react";

export default function CustomerEmailFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  function resizeFrame() {
    const frame = frameRef.current;
    const document = frame?.contentDocument;
    if (!frame || !document) return;
    const height = Math.max(document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0, 640);
    frame.style.height = `${height}px`;
  }

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={resizeFrame}
      className="block min-h-[640px] w-full border-0 bg-white"
    />
  );
}
