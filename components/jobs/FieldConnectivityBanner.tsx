"use client";

import { useEffect, useState } from "react";

import { draftStorageWorks } from "@/lib/field-drafts/form-draft-storage";

/**
 * Connectivity and draft-safety notice for the test-entry page.
 *
 * Two states, and the difference matters more than it looks:
 *
 *  - Draft storage works, no connection: keep working, the typed readings are
 *    on the device, Save is still what sends them. This app does not queue
 *    submissions, so the copy must not imply that it does.
 *  - Draft storage does NOT work (private mode, locked-down WebView, full
 *    store): the safety net a tech would otherwise rely on is absent. Saying
 *    "your readings are saved on this device" then would be a lie that gets
 *    readings lost, so this warns instead — online or off.
 *
 * Renders nothing during SSR, and nothing when online with working storage.
 */
export function FieldConnectivityBanner() {
  const [offline, setOffline] = useState(false);
  // null until probed, so SSR and the first paint assert nothing either way.
  const [storageOk, setStorageOk] = useState<boolean | null>(null);

  useEffect(() => {
    // One real round-trip write: the failure modes here are silent, and an
    // assumption would be exactly the wrong thing to make about a safety net.
    setStorageOk(draftStorageWorks());

    const sync = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (storageOk === false) {
    return (
      <div
        role="alert"
        className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm leading-5 text-rose-900"
      >
        <span className="font-semibold">Readings can&rsquo;t be saved on this device.</span>{" "}
        Save before leaving this page — anything typed here will be lost if the page reloads or the
        app is switched.
        {offline ? " There is also no connection right now." : ""}
      </div>
    );
  }

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
