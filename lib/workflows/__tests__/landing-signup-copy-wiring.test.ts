import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("landing and signup copy wiring", () => {
  const PRIVATE_LOOKING_COPY_GUARDS = [
    "Test Customer 123",
    "permit #",
    "invoice #",
    "sandbox",
    "example.com",
    "123 Main St",
    "(555)",
  ];

  it("renders guided trial login copy with compact preview block", () => {
    const loginPage = readWorkspaceFile("app/login/page.tsx");

    expect(loginPage).toContain("Log in to run field work, scheduling, closeout, and follow-up from one organized place.");
    expect(loginPage).toContain("Start a 30-day guided setup. No payment details needed.");
    expect(loginPage).toContain("Start Service Trial");
    expect(loginPage).toContain("Start ECC / Compliance Trial");
    expect(loginPage).toContain("For service calls, dispatch, work orders, and follow-up.");
    expect(loginPage).toContain("For ECC jobs, tests, corrections, and closeout.");
    expect(loginPage).toContain("Trial paths start with a 30-day guided setup and no payment details.");
    expect(loginPage).toContain("Already invited by your company? Contact your administrator if you need access.");
    expect(loginPage).not.toContain("14-day");
    expect(loginPage).not.toContain("14 day");
    for (const disallowed of PRIVATE_LOOKING_COPY_GUARDS) {
      expect(loginPage).not.toContain(disallowed);
    }
  });

  it("renders generic signup preview copy for /signup", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Success Guide preview");
    expect(signupContent).toContain("Start here");
    expect(signupContent).toContain("Create first job");
    expect(signupContent).toContain("Use Today/Ops each morning");
    expect(signupContent).toContain("Try real jobs for 30 days");
    expect(signupContent).toContain("No payment details are needed to get started. You can review billing options after setup.");
    expect(signupContent).not.toContain("14-day");
    expect(signupContent).not.toContain("14 day");
  });

  it("renders Service signup preview strip copy for /signup/service", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your Service Trial");
    expect(signupContent).toContain("Service preview");
    expect(signupContent).toContain("Success Guide");
    expect(signupContent).toContain("Maple Street Install");
    expect(signupContent).toContain("Tech notes added");
    expect(signupContent).toContain("Permit pending");
    expect(signupContent).toContain("Invoice ready");
  });

  it("renders ECC signup preview strip copy for /signup/ecc", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your ECC / Compliance Testing Trial");
    expect(signupContent).toContain("ECC preview");
    expect(signupContent).toContain("Success Guide");
    expect(signupContent).toContain("Duct test scheduled");
    expect(signupContent).toContain("Correction needed");
    expect(signupContent).toContain("Test result tracked");
    expect(signupContent).toContain("Closeout pending");
  });

  it("keeps trial and no-payment reassurance while avoiding stale or private-looking copy", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your Service Trial");
    expect(signupContent).toContain("Start Your ECC / Compliance Testing Trial");
    expect(signupContent).toContain("No payment details are needed to get started. You can review billing options after setup.");
    expect(signupContent).toContain("Try real jobs for 30 days");
    expect(signupContent).toContain("What happens next");
    expect(signupContent).not.toContain("14-day");
    expect(signupContent).not.toContain("14 day");
    for (const disallowed of PRIVATE_LOOKING_COPY_GUARDS) {
      expect(signupContent).not.toContain(disallowed);
    }
  });
});
