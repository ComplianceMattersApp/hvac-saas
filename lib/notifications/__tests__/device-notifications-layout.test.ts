import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readComponentSource() {
  return readFileSync(
    resolve(__dirname, "../../../app/ops/notifications/_components/DeviceNotificationsCard.tsx"),
    "utf-8",
  );
}

describe("DeviceNotificationsCard layout", () => {
  it("keeps install and notification setup as responsive equal-width cards", () => {
    const source = readComponentSource();

    expect(source).toContain("grid gap-3 lg:grid-cols-2");
    expect(source).toContain("<DeviceInstallHelper />");
  });

  it("stacks notification copy and action inside the card so the text column does not collapse", () => {
    const source = readComponentSource();

    expect(source).toContain('className="flex flex-col gap-4"');
    expect(source).not.toContain("md:flex-row md:items-start md:justify-between");
    expect(source).toContain("Enable alerts on this device");
    expect(source).toContain("w-full items-center justify-center");
    expect(source).toContain("sm:w-auto");
  });

  it("preserves the per-device enrollment footer copy", () => {
    const source = readComponentSource();

    expect(source).toContain("Device alerts are per browser/device.");
    expect(source).toContain("Enable alerts separately on your phone, tablet, and desktop.");
  });
});
