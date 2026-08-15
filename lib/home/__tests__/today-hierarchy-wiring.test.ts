import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/today/page.tsx"), "utf8");
const readModelSource = readFileSync(resolve(__dirname, "../today-read-model.ts"), "utf8");

describe("Today page hierarchy", () => {
  it("uses an independent desktop main column and right rail", () => {
    // Asserts the shape — a fluid main column beside a bounded right rail —
    // without pinning the rail's exact rem values, which are tuned by width passes.
    expect(source).toMatch(/xl:grid-cols-\[minmax\(0,1fr\)_minmax\([^\]]+\)\]/);
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

  it("renders every queue supplied by the expanded Operations snapshot", () => {
    for (const key of [
      "need_scheduling",
      "field_work",
      "without_tech",
      "contractor_intake",
      "waiting",
      "exceptions",
      "follow_ups",
      "closeout",
      "permits",
      "updates",
    ]) {
      expect(readModelSource).toContain(`key: "${key}"`);
    }
    expect(source).toContain("chips.map((chip)");
    expect(source).toContain("Operations snapshot");
    expect(source).toContain("min-h-11");
    expect(source).not.toContain("min-h-16");
  });

  it("renders Team Coverage in both the mobile stream and the desktop main column", () => {
    const mobileColumn = source.slice(
      source.indexOf('<div className="space-y-4 xl:hidden">'),
      source.indexOf("{/* WIDE DESKTOP MAIN COLUMN"),
    );
    const desktopColumn = source.slice(source.indexOf("{/* WIDE DESKTOP MAIN COLUMN"));

    expect(mobileColumn).toContain("<TeamCoverageSection");
    expect(desktopColumn).toContain("<TeamCoverageSection");
  });

  it("keeps Team Coverage identity and location readable without overflow", () => {
    // The section adapts to either column via flex + min-w-0 + truncate rather
    // than a `wide` prop switching grid templates, so assert that contract:
    // the identity block may shrink and ellipsize, the job count never does.
    const section = source.slice(
      source.indexOf("function TeamCoverageSection("),
      source.indexOf("function RoleAwarePulseSection("),
    );

    expect(section).toContain("min-w-0");
    expect(section).toContain("truncate");
    expect(section).toContain("shrink-0");
  });
});
