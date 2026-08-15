import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Deep links into job detail must land on an anchor that actually renders.
 *
 * The classic desktop layout owned `id="next-service-action"`, and when that
 * layout became reachable only via `?legacy=1` the anchor went with it — while
 * six production call sites kept redirecting to `#next-service-action`. Those
 * redirects scrolled nowhere for every user until the layout was retired and
 * the links were repointed at `#followup`, the anchor Desktop V2 renders.
 *
 * This guards the general case: every fragment a production source sends to
 * `/jobs/<id>` must exist as an id on the desktop surface that renders it.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, "../../../", rel), "utf8");

const desktopV2Source = read("app/jobs/[id]/v2/page.tsx");

const DEEP_LINK_SOURCES = [
  "app/ops/page.tsx",
  "app/ops/queues/waiting/page.tsx",
  "lib/actions/job-ops-actions.ts",
  "lib/actions/job-actions.ts",
];

/** Fragments used in any `/jobs/...#fragment` link within a source file. */
function jobDetailFragments(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/\/jobs\/[^`"'\s]*#([a-z0-9-]+)/gi)) {
    found.add(match[1]);
  }
  return [...found];
}

describe("job detail deep link anchors", () => {
  it("renders every fragment that production code links to", () => {
    const unresolved: string[] = [];

    for (const rel of DEEP_LINK_SOURCES) {
      for (const fragment of jobDetailFragments(read(rel))) {
        if (!desktopV2Source.includes(`id="${fragment}"`)) {
          unresolved.push(`${rel} -> #${fragment}`);
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("no longer points anything at the retired next-service-action anchor", () => {
    for (const rel of DEEP_LINK_SOURCES) {
      expect(read(rel)).not.toContain("#next-service-action");
    }
    expect(desktopV2Source).not.toContain('id="next-service-action"');
  });

  it("keeps the follow-up section anchored and reachable from the section nav", () => {
    expect(desktopV2Source).toContain('id="followup"');
    expect(desktopV2Source).toContain('{ id: "followup", label: "Follow-Up & Chain" }');
  });
});
