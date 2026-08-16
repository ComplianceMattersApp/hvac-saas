import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { buildOpsTeamClockStatusRows } from "@/lib/ops/ops-workspace-bootstrap-loader";

const bootstrapLoaderSource = readFileSync(
  resolve(__dirname, "../ops-workspace-bootstrap-loader.ts"),
  "utf8",
);
const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf8",
);

describe("Operations workspace bootstrap loader", () => {
  it("builds stable clocked-in and lunch presentation rows", () => {
    const rows = buildOpsTeamClockStatusRows({
      accountTimeZone: "UTC",
      displayMap: {
        "user-clocked-in": "JANE DOE",
        "user-on-lunch": "alex smith",
      },
      nowMs: new Date("2026-08-16T12:35:00.000Z").getTime(),
      rows: [
        {
          accountOwnerUserId: "account-1",
          clockInAt: "2026-08-16T10:00:00.000Z",
          clockOutAt: null,
          entryId: "entry-1",
          internalUserId: "user-clocked-in",
          lunchStartAt: null,
          status: "open",
        },
        {
          accountOwnerUserId: "account-1",
          clockInAt: "2026-08-16T09:00:00.000Z",
          clockOutAt: null,
          entryId: "entry-2",
          internalUserId: "user-on-lunch",
          lunchStartAt: "2026-08-16T11:00:00.000Z",
          status: "on_lunch",
        },
      ],
    });

    expect(rows).toEqual([
      {
        displayName: "Jane Doe",
        elapsed: "2h 35m",
        internalUserId: "user-clocked-in",
        sinceAt: expect.stringContaining("10:00 AM"),
        statusLabel: "Clocked In",
      },
      {
        displayName: "Alex Smith",
        elapsed: "3h 35m",
        internalUserId: "user-on-lunch",
        sinceAt: expect.stringContaining("11:00 AM"),
        statusLabel: "On Lunch",
      },
    ]);
  });

  it("uses safe fallbacks for missing identity and invalid clock input", () => {
    const [row] = buildOpsTeamClockStatusRows({
      accountTimeZone: "America/Los_Angeles",
      displayMap: {},
      nowMs: new Date("2026-08-16T12:35:00.000Z").getTime(),
      rows: [
        {
          accountOwnerUserId: "account-1",
          clockInAt: "not-a-date",
          clockOutAt: null,
          entryId: "entry-1",
          internalUserId: "unknown-user",
          lunchStartAt: null,
          status: "open",
        },
      ],
    });

    expect(row).toMatchObject({
      displayName: "Unknown User",
      elapsed: "0m",
      sinceAt: "-",
    });
  });

  it("keeps bootstrap orchestration behind one typed page dependency", () => {
    expect(opsPageSource).toContain("loadOpsWorkspaceBootstrap");
    expect(bootstrapLoaderSource.match(/Promise\.all\(/g)).toHaveLength(2);

    for (const directReader of [
      "getCachedAccountTimeZone",
      "getCachedBillingMode",
      "getCachedProductMode",
      "listSenderWorkshareConnectionsForReceiver",
      "countReturnedWorkshareRequestsForSender",
      "listTeamClockStatusPreview",
      "listFieldPaymentCollectionReportsForReconciliation",
    ]) {
      expect(bootstrapLoaderSource).toContain(directReader);
      expect(opsPageSource).not.toContain(directReader);
    }
  });
});
