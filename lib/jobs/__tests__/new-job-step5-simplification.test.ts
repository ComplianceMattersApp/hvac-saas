import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const formSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"),
  "utf-8",
);

const builderSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/VisitScopeBuilder.tsx"),
  "utf-8",
);

describe("New job Step 5 simplification wiring", () => {
  it("uses plain-language Step 5 heading", () => {
    expect(formSource).toContain("Work To Perform &amp; Job Scope");
    expect(formSource).not.toContain("Visit Reason &amp; Work Items");
  });

  it("keeps service scope-required validation in place", () => {
    expect(formSource).toContain("hasStructuredVisitScopeItemsJson");
    expect(formSource).toContain("modeSafeJobType === \"service\"");
  });

  it("updates intake progress label to Job scope", () => {
    expect(formSource).toContain('label="Job scope"');
  });

  it("shows immediate add confirmation and current scope preview near entry", () => {
    expect(builderSource).toContain("Added to job scope.");
    expect(builderSource).toContain("Current Job Scope");
  });

  it("keeps advanced metadata collapsed by default under Details", () => {
    expect(builderSource).toContain("<details");
    expect(builderSource).toContain("Details");
    expect(builderSource).toContain("Metadata:");
  });

  it("uses softened Pricebook wording", () => {
    expect(builderSource).toContain("Use Pricebook defaults");
    expect(builderSource).toContain("Default from Pricebook");
  });
});
