"use client";

import { useEffect, useState } from "react";

/**
 * Slim offline notice for the test-entry page.
 *
 * Says the one thing a rater in a crawlspace needs to know: keep working, the
 * typed readings are already on the device, and Save is what sends them — this
 * app does not queue submissions, so it must not imply that it does.
 *
 * Renders nothing while online, and nothing during SSR (navigator is not
 * available there, and assuming "offline" would flash a false warning).
 */
export function FieldConnectivityBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="mb-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm leading-5 text-slate-800"
    >
      <span className="font-semibold">No connection.</span>{" "}
      Keep working — your typed readings are saved on this device. Save when signal returns.
    </div>
  );
}

export default FieldConnectivityBanner;
