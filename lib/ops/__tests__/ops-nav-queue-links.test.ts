import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPS_NAV_QUEUE_LINKS } from "../ops-nav-queue-links";

const mobileShellSource = readFileSync(
  resolve(__dirname, "../../../components/layout/MobileShellMenu.tsx"),
  "utf8",
);

describe("Operations shell queue navigation", () => {
  it("keeps the desktop Operations dropdown aligned to the eight workspace queues", () => {
    expect(OPS_NAV_QUEUE_LINKS.map((item) => item.label)).toEqual([
      "Needs Scheduling",
      "Field Work",
      "Contractor Intake",
      "Waiting / Pending Info",
      "Exceptions",
      "Closeout & Review",
      "Follow Ups",
      "Permits",
    ]);

    expect(OPS_NAV_QUEUE_LINKS.map((item) => item.bucket)).toEqual([
      "pending",
      "field_work",
      "contractor_intake",
      "waiting",
      "exceptions",
      "closeout",
      "follow_ups",
      "permits",
    ]);
  });

  it("keeps mobile shell navigation uncluttered by omitting queue subcategory links", () => {
    expect(mobileShellSource).toContain('href="/ops"');
    expect(mobileShellSource).toContain("Operations");
    expect(mobileShellSource).not.toContain("OPS_NAV_QUEUE_LINKS");
    expect(mobileShellSource).not.toContain("bucket=field_work");
    expect(mobileShellSource).not.toContain("bucket=follow_ups");
  });
});
