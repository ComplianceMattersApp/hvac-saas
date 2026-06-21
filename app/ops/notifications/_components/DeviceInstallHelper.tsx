"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Share2, Smartphone } from "lucide-react";
import {
  resolveDeviceInstallState,
  type DeviceInstallState,
} from "@/lib/pwa/device-setup";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function getInitialInstallState(): DeviceInstallState {
  if (typeof window === "undefined") {
    return resolveDeviceInstallState({
      userAgent: "",
      vendor: "",
      maxTouchPoints: 0,
      displayModeStandalone: false,
      navigatorStandalone: false,
      hasBeforeInstallPrompt: false,
    });
  }

  return resolveDeviceInstallState({
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    maxTouchPoints: navigator.maxTouchPoints,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    hasBeforeInstallPrompt: false,
  });
}

export function DeviceInstallHelper() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<DeviceInstallState>(() => getInitialInstallState());
  const [message, setMessage] = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(display-mode: standalone)");

    function updateState(hasBeforeInstallPrompt: boolean, nextInstallEvent: BeforeInstallPromptEvent | null) {
      setInstallState(
        resolveDeviceInstallState({
          userAgent: navigator.userAgent,
          vendor: navigator.vendor,
          maxTouchPoints: navigator.maxTouchPoints,
          displayModeStandalone: mediaQuery.matches,
          navigatorStandalone: Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
          hasBeforeInstallPrompt,
        }),
      );
      setInstallEvent(nextInstallEvent);
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      updateState(true, event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setMessage("App installed on this device.");
      updateState(false, null);
    }

    function handleDisplayModeChange() {
      updateState(Boolean(installEvent), installEvent);
    }

    updateState(false, null);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, [installEvent]);

  const bodyCopy = useMemo(() => {
    if (installState.isInstalled) {
      return "This device already opens EveryStep FieldWorks like an app for faster access.";
    }

    if (installState.canPromptInstall) {
      return "Add this app to this device for faster access.";
    }

    if (installState.isIosSafari) {
      return "Tap Share, then Add to Home Screen.";
    }

    if (installState.showPhoneGuidance) {
      return "Open this page on your phone to add the app to your home screen.";
    }

    return "Use this device for alerts now, and add the app where your browser supports it.";
  }, [installState]);

  const buttonLabel = installState.isInstalled ? "App installed" : "Install app";

  async function handleInstall() {
    if (!installEvent) return;

    setIsPrompting(true);
    setMessage(null);

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        setMessage("Install prompt accepted.");
        setInstallEvent(null);
        setInstallState((current) => ({
          ...current,
          canPromptInstall: false,
        }));
      } else {
        setMessage("Install prompt dismissed.");
      }
    } catch {
      setMessage("Install prompt could not be opened.");
    } finally {
      setIsPrompting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
          {installState.isInstalled ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : installState.isIosSafari ? (
            <Share2 className="h-5 w-5" aria-hidden="true" />
          ) : installState.canPromptInstall ? (
            <Download className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-950">Install app</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{bodyCopy}</p>
          {installState.isIosSafari && !installState.isInstalled ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Use Safari on iPhone, tap Share, then choose Add to Home Screen.
            </p>
          ) : null}
          {message ? <p className="mt-2 text-xs leading-5 text-slate-500">{message}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {installState.canPromptInstall ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={isPrompting}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isPrompting ? "Opening..." : buttonLabel}
          </button>
        ) : null}
        {installState.isInstalled ? (
          <div className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            App installed
          </div>
        ) : null}
      </div>
    </div>
  );
}
