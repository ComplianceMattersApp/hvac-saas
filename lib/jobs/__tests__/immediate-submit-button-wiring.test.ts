import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../../components/ImmediateSubmitButton.tsx"),
  "utf8",
);

describe("ImmediateSubmitButton wiring", () => {
  it("defers the local submitted latch until after the native submit dispatch starts", () => {
    expect(source).toContain("window.setTimeout(() => {");
    expect(source).toContain("setSubmitted(true);");
    expect(source).toContain("}, 0);");
  });

  it("clears the local pending latch when no form pending state is observed", () => {
    expect(source).toContain("if (!submitted || pending || sawPending) return;");
    expect(source).toContain("setSubmitted(false);");
    expect(source).toContain("}, 1500);");
  });
});