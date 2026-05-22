import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobTestsPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job tests page wiring", () => {
  it("exposes Asbestos as a manual override option and keeps override reason free-form", () => {
    expect(jobTestsPageSource).toContain('<option value="pass">Smoke Test</option>');
    expect(jobTestsPageSource).toContain('<option value="fail">Asbestos</option>');
    expect(jobTestsPageSource).toContain('autoComplete="off"');
    expect(jobTestsPageSource).not.toContain('<datalist id={`ovr-reason-list-${runDL.id}`}>');
  });
});

describe("job detail field operations board layout", () => {
  it("keeps the service location chip over the image area", () => {
    expect(jobPageSource).toContain('className="bg-slate-100 p-3"');
    expect(jobPageSource).toContain('Service Location');
    expect(jobPageSource).not.toContain('bg-slate-100 p-3 pt-10');
  });

  it("labels account, access, and billing context clearly", () => {
    expect(jobPageSource).toContain("Responsible Account");
    expect(jobPageSource).toContain("Site / Access Contact");
    expect(jobPageSource).toContain("Billing / Paperwork Recipient");
    expect(jobPageSource).toContain("Account phone");
    expect(jobPageSource).toContain("Access phone");
    expect(jobPageSource).toContain("Billing email");
  });

  it("includes explicit fallback copy for access and billing defaults", () => {
    expect(jobPageSource).toContain("Same as responsible account");
    expect(jobPageSource).toContain("No separate site/access contact saved");
    expect(jobPageSource).toContain("Defaults to responsible account");
  });

  it("includes location-linked contacts in site/access resolution priority", () => {
    expect(jobPageSource).toContain('linkedEntityType: "location"');
    expect(jobPageSource).toContain('["job", 0]');
    expect(jobPageSource).toContain('["location", 1]');
    expect(jobPageSource).toContain('["customer", 2]');
  });
});
