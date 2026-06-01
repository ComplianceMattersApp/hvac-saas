import { describe, expect, it } from "vitest";
import { resolveDeviceInstallState } from "@/lib/pwa/device-setup";

describe("device setup install state", () => {
  it("treats standalone mode as already installed", () => {
    const state = resolveDeviceInstallState({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      vendor: "Google Inc.",
      maxTouchPoints: 5,
      displayModeStandalone: true,
      navigatorStandalone: false,
      hasBeforeInstallPrompt: true,
    });

    expect(state.isInstalled).toBe(true);
    expect(state.canPromptInstall).toBe(false);
  });

  it("keeps the install prompt available for chromium browsers when supported", () => {
    const state = resolveDeviceInstallState({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36",
      vendor: "Google Inc.",
      maxTouchPoints: 5,
      displayModeStandalone: false,
      navigatorStandalone: false,
      hasBeforeInstallPrompt: true,
    });

    expect(state.canPromptInstall).toBe(true);
    expect(state.isIosSafari).toBe(false);
    expect(state.showPhoneGuidance).toBe(false);
  });

  it("detects iPhone Safari for manual add-to-home-screen guidance", () => {
    const state = resolveDeviceInstallState({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      vendor: "Apple Computer, Inc.",
      maxTouchPoints: 5,
      displayModeStandalone: false,
      navigatorStandalone: false,
      hasBeforeInstallPrompt: false,
    });

    expect(state.isIosSafari).toBe(true);
    expect(state.canPromptInstall).toBe(false);
    expect(state.showPhoneGuidance).toBe(false);
  });

  it("shows phone guidance on unsupported desktop browsers", () => {
    const state = resolveDeviceInstallState({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Firefox/126.0",
      vendor: "Mozilla Foundation",
      maxTouchPoints: 0,
      displayModeStandalone: false,
      navigatorStandalone: false,
      hasBeforeInstallPrompt: false,
    });

    expect(state.isDesktop).toBe(true);
    expect(state.showPhoneGuidance).toBe(true);
  });
});