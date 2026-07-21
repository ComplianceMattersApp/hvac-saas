import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(resolve(process.cwd(), "app/ops/page.tsx"), "utf8");
const withoutTechPageSource = readFileSync(
  resolve(process.cwd(), "app/ops/queues/without-tech/page.tsx"),
  "utf8",
);
const filteredPreviewSource = readFileSync(
  resolve(process.cwd(), "app/ops/_components/OpsFilteredPreviewClient.tsx"),
  "utf8",
);

describe("uncapped operations queues", () => {
  it("does not cap main workbench job reads or desktop/mobile card rendering", () => {
    const loader = opsPageSource.match(
      /async function loadWorkspacePreviewRows[\s\S]*?const workspacePreviewEntries/,
    )?.[0] ?? "";

    expect(loader).not.toContain("queuePreviewLimit");
    expect(loader).not.toContain(".limit(");
    expect(filteredPreviewSource).toContain("filteredJobs.map((job)");
    expect(filteredPreviewSource).not.toContain("filteredJobs.slice(");
  });

  it("does not cap Needs Assignment source jobs or its rendered snapshot", () => {
    expect(withoutTechPageSource).not.toContain(".limit(");
    expect(withoutTechPageSource).toContain("previewLimit: scheduledJobs.length");
    expect(opsPageSource).toContain("previewLimit: Math.max(scheduledOpenRows.length, 1)");
  });

  it("does not cap main workbench assignment and closeout source reads", () => {
    const countLoader = opsPageSource.match(
      /let scheduledOpenRowsQ[\s\S]*?const \[/,
    )?.[0] ?? "";
    const closeoutLoader = opsPageSource.match(
      /async function loadCloseoutWorkspaceRows[\s\S]*?async function loadWorkspacePreviewRows/,
    )?.[0] ?? "";

    expect(countLoader).not.toContain(".limit(");
    expect(closeoutLoader).not.toContain(".limit(");
  });
});
