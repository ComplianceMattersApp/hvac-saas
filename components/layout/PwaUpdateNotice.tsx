"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { getOrRegisterServiceWorkerRegistration } from "@/lib/pwa/service-worker";

type UpdateState = "checking" | "idle" | "available" | "refreshing" | "unsupported" | "failed";

const SERVICE_WORKER_SCRIPT_URL = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";

function supportsUpdatePrompt(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

function postSkipWaiting(registration: ServiceWorkerRegistration | null) {
  if (!registration?.waiting) return false;

  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export default function PwaUpdateNotice() {
  const [state, setState] = useState<UpdateState>("checking");
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const refreshRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function markAvailable(worker: ServiceWorker | null) {
      waitingWorkerRef.current = worker;
      if (!cancelled) {
        setState("available");
      }
    }

    function handleControllerChange() {
      if (!refreshRequestedRef.current) return;
      window.location.reload();
    }

    async function bootstrap() {
      if (!supportsUpdatePrompt()) {
        setState("unsupported");
        return;
      }

      try {
        const registration =
          (await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE)) ??
          (await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, { scope: SERVICE_WORKER_SCOPE }));

        if (cancelled) return;

        const installedWorker = registration.waiting ?? registration.installing;
        if (installedWorker) {
          if (installedWorker.state === "installed" && navigator.serviceWorker.controller) {
            markAvailable(installedWorker);
          } else {
            installedWorker.addEventListener("statechange", () => {
              if (cancelled) return;
              if (installedWorker.state === "installed" && navigator.serviceWorker.controller) {
                markAvailable(installedWorker);
              }
            });
          }
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (cancelled) return;
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              markAvailable(worker);
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

        await registration.update();

        if (!registration.waiting && !registration.installing && !navigator.serviceWorker.controller) {
          setState("idle");
        } else if (!registration.waiting) {
          setState((current) => (current === "available" ? current : "idle"));
        }
      } catch {
        if (!cancelled) {
          setState("failed");
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  async function handleRefresh() {
    const registration = await getOrRegisterServiceWorkerRegistration();
    const waitingWorker = registration?.waiting ?? waitingWorkerRef.current;

    if (!waitingWorker) {
      setState("failed");
      return;
    }

    refreshRequestedRef.current = true;
    setState("refreshing");

    if (!postSkipWaiting(registration ?? null)) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  }

  if (state !== "available" && state !== "refreshing") {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 print:hidden">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-slate-950/95 px-4 py-3 text-white shadow-[0_18px_50px_-28px_rgba(15,23,42,0.75)] backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-white">Update available</p>
          <p className="text-xs leading-5 text-slate-300">Refresh to load the latest app version and avoid stale screens.</p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={state === "refreshing"}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={state === "refreshing" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" />
          {state === "refreshing" ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
