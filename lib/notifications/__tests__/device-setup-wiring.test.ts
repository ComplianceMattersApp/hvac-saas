import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

const deviceCardSource = readFileSync(
  resolve(root, "app/ops/notifications/_components/DeviceNotificationsCard.tsx"),
  "utf8",
);

const installHelperSource = readFileSync(
  resolve(root, "app/ops/notifications/_components/DeviceInstallHelper.tsx"),
  "utf8",
);

const notificationsPageClientSource = readFileSync(
  resolve(root, "app/ops/notifications/_components/NotificationsPageClient.tsx"),
  "utf8",
);

const accountPageSource = readFileSync(
  resolve(root, "app/account/page.tsx"),
  "utf8",
);

describe("device setup wiring", () => {
  it("labels the shared card as device setup and keeps notification setup visible", () => {
    expect(deviceCardSource).toContain("Device setup");
    expect(deviceCardSource).toContain("Set up this device for faster access and job alerts.");
    expect(deviceCardSource).toContain("Turn on job alerts and updates for this device.");
    expect(deviceCardSource).toContain("Enable alerts on this device");
  });

  it("includes install helper copy for prompt, iPhone, desktop, and installed states", () => {
    expect(installHelperSource).toContain("Install app");
    expect(installHelperSource).toContain("Tap Share, then Add to Home Screen.");
    expect(installHelperSource).toContain("Open this page on your phone to add the app to your home screen.");
    expect(installHelperSource).toContain("App installed");
  });

  it("keeps the shared device setup card mounted on notifications and account surfaces", () => {
    expect(notificationsPageClientSource).toContain("<DeviceNotificationsCard");
    expect(accountPageSource).toContain("<DeviceNotificationsCard");
  });
});