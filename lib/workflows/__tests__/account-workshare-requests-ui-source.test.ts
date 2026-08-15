import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const jobDetailPath = path.join(process.cwd(), "app", "jobs", "[id]", "page.tsx");

describe("account workshare request job detail UI source", () => {
  it("adds sender-side Send ECC/HERS Request UI behind active sender-side rater connections", () => {
    const source = fs.readFileSync(jobDetailPath, "utf8");

    expect(source).toContain("statuses: [\"active\"]");
    expect(source).toContain("row.sender_account_id === internalUser.account_owner_user_id");
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
