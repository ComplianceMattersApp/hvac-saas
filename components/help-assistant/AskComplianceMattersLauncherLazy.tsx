"use client";

import dynamic from "next/dynamic";

// The launcher statically imports the full help-knowledge content
// (help-assistant-answer, training-room content, setup-coach knowledge), so
// loading it eagerly would ship all of that in the shared layout bundle on
// every page. This wrapper splits it into its own chunk fetched after
// hydration; the floating button appears once the chunk loads.
export const AskComplianceMattersLauncher = dynamic(
  () =>
    import("./AskComplianceMattersLauncher").then(
      (mod) => mod.AskComplianceMattersLauncher,
    ),
  { ssr: false },
);
