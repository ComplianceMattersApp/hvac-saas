import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/today/page.tsx"), "utf8");
const readModelSource = readFileSync(resolve(__dirname, "../today-read-model.ts"), "utf8");

describe("Today page hierarchy", () => {
  it("uses an independent desktop main column and right rail", () => {
    // Flexible main column plus a bounded-width right rail. The exact rem
    // bounds are a design decision that shifts; the two-column shape is not.
    expect(source).toMatch(/xl:grid-cols-\[minmax\(0,1fr\)_minmax\([\d.]+rem,[\d.]+rem\)\]/);
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

  it("renders Team Coverage in the desktop main column", () => {
    const desktopMain = source.slice(
      source.indexOf('<main className="min-w-0 space-y-5">'),
      source.indexOf("</main>"),
    );
    expect(desktopMain).toContain("<TeamCoverageSection");
  });

  it("stacks Team Coverage identity above location details", () => {
    const sectionStart = source.indexOf("function TeamCoverageSection");
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    const section = source.slice(sectionStart, source.indexOf("function RoleAwarePulseSection"));
    const namePosition = section.indexOf("{row.assigneeName}");
    const areaPosition = section.indexOf("{row.areaLabel}");
    expect(namePosition).toBeGreaterThanOrEqual(0);
    expect(areaPosition).toBeGreaterThan(namePosition);
  });
});
