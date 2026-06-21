import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const layoutSource = readFileSync(
  resolve(__dirname, "../../../app/layout.tsx"),
  "utf-8",
);

const mobileShellSource = readFileSync(
  resolve(__dirname, "../../../components/layout/MobileShellMenu.tsx"),
  "utf-8",
);

describe("Operational notification awareness visibility by product mode", () => {
  it("keeps the global notifications route wired in the shell", () => {
    expect(layoutSource).toContain('href="/ops/notifications"');
    expect(mobileShellSource).toContain('href="/ops/notifications"');
  });

  it("hides desktop shell operational notification awareness in hvac_service mode", () => {
    expect(layoutSource).toContain('const showOperationalNotificationAwareness = !isInternalUser || productMode !== "hvac_service";');
    expect(layoutSource).toContain("isInternalUser && showOperationalNotificationAwareness");
  });

  it("hides mobile shell operational notification awareness in hvac_service mode", () => {
    expect(mobileShellSource).toContain("showOperationalNotificationAwareness: boolean;");
    expect(mobileShellSource).toContain("isInternalUser && showOperationalNotificationAwareness");
  });
});
