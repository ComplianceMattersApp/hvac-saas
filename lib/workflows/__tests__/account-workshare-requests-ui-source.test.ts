import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const jobDetailPath = path.join(process.cwd(), "app", "jobs", "[id]", "page.tsx");

describe("account workshare request job detail UI source", () => {
  it("adds sender-side Send ECC/HERS Request UI behind active sender-side rater connections", () => {
    const source = fs.readFileSync(jobDetailPath, "utf8");

    expect(source).toContain("Send ECC/HERS Request");
    expect(source).toContain("Send this job&apos;s ECC/HERS request to a connected rater account. This shares a safe request snapshot only. The rater will review it in a later step.");
    expect(source).toContain("Rater account");
    expect(source).toContain("Requested ECC/HERS scope");
    expect(source).toContain("Notes for rater");
    expect(source).toContain("Send request");
    expect(source).toContain("ECC/HERS request sent to the connected rater.");
    expect(source).toContain("statuses: [\"active\"]");
    expect(source).toContain("row.sender_account_id === internalUser.account_owner_user_id");
    expect(source).toContain("hasActiveRaterWorkshareConnection");
  });

  it("does not imply receiver workflow exists yet", () => {
    const source = fs.readFileSync(jobDetailPath, "utf8");
    const section = source.slice(
      source.indexOf("id=\"account-workshare-requests\""),
      source.indexOf("{/* Visit scope workspace */}"),
    );

    expect(section).not.toContain("accepted");
    expect(section).not.toContain("scheduled");
    expect(section).not.toContain("receiver job");
    expect(section).not.toContain("test started");
    expect(section).not.toContain("paperwork");
  });
});
