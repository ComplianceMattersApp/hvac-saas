export type DeviceInstallEnvironment = {
  userAgent: string;
  vendor?: string | null;
  maxTouchPoints?: number;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
  hasBeforeInstallPrompt: boolean;
};

export type DeviceInstallState = {
  isInstalled: boolean;
  canPromptInstall: boolean;
  isIosSafari: boolean;
  isDesktop: boolean;
  supportsInstallHelp: boolean;
  showPhoneGuidance: boolean;
};

export function resolveDeviceInstallState(
  environment: DeviceInstallEnvironment,
): DeviceInstallState {
  const userAgent = String(environment.userAgent ?? "").toLowerCase();
  const vendor = String(environment.vendor ?? "").toLowerCase();
  const maxTouchPoints = Number(environment.maxTouchPoints ?? 0);

  const isIosDevice =
    /iphone|ipad|ipod/.test(userAgent) ||
    (userAgent.includes("macintosh") && maxTouchPoints > 1);
  const isAndroid = userAgent.includes("android");
  const isMobile = isIosDevice || isAndroid;
  const isDesktop = !isMobile;
  const isSafari =
    vendor.includes("apple") && !/crios|fxios|edgios|chrome|android/.test(userAgent);
  const isIosSafari = isIosDevice && isSafari;
  const isInstalled = Boolean(
    environment.displayModeStandalone || environment.navigatorStandalone,
  );
  const canPromptInstall = Boolean(environment.hasBeforeInstallPrompt && !isInstalled);
  const supportsInstallHelp = isIosSafari || canPromptInstall || isDesktop || isAndroid;

  return {
    isInstalled,
    canPromptInstall,
    isIosSafari,
    isDesktop,
    supportsInstallHelp,
    showPhoneGuidance: !isInstalled && !canPromptInstall && isDesktop,
  };
}