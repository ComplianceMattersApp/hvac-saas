import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/today/page.tsx"), "utf8");

describe("Today page hierarchy", () => {
  it("uses an independent desktop main column and right rail", () => {
    expect(source).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]");
    expect(source).toContain('<main className="min-w-0 space-y-5">');
    expect(source).toContain('<aside className="space-y-5" aria-label="Today summaries">');
    expect(source).not.toContain("rounded-[28px]");
  });

  it("keeps the intended mobile DOM sequence", () => {
    const singleColumn = source.slice(
      source.indexOf('<div className="space-y-4 xl:hidden">'),
      source.indexOf("{/* WIDE DESKTOP MAIN COLUMN"),
    );
    const positions = [
      "<NextBestActionCard",
      "<PriorityChipsSection",
      "<TeamCoverageSection",
      "<RoleAwarePulseSection",
      "<TodayWorkSection",
    ].map((token) => singleColumn.indexOf(token));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("renders compact queue rows with the fixed six-queue workflow", () => {
    for (const key of [
      "need_scheduling",
      "field_work",
      "waiting",
      "exceptions",
      "follow_ups",
      "closeout",
    ]) {
      expect(source).toContain(`"${key}"`);
    }
    expect(source).toContain("Operations snapshot");
    expect(source).toContain("min-h-11");
    expect(source).not.toContain("min-h-16");
  });

  it("expands Team Coverage in the desktop main column", () => {
    expect(source).toContain("wide");
    expect(source).toContain("sm:grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.6fr)_auto_auto]");
  });
});
