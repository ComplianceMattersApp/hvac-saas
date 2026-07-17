import { describe, expect, it } from "vitest";
import { normalizeOpsWorkspaceHref } from "@/lib/ops/ops-workspace-href";

describe("normalizeOpsWorkspaceHref", () => {
  it("collapses repeated workspace fragments to one canonical anchor", () => {
    expect(
      normalizeOpsWorkspaceHref(
        "/ops?bucket=without_tech#ops-workspace#ops-workspace#ops-workspace",
      ),
    ).toBe("/ops?bucket=without_tech#ops-workspace");
  });

  it("does not alter links to other destinations", () => {
    expect(normalizeOpsWorkspaceHref("/ops/notifications?state=unread")).toBe(
      "/ops/notifications?state=unread",
    );
  });
});
