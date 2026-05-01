import { describe, expect, it } from "vitest";
import { isSupportConsoleEnabled } from "@/lib/support/support-console-exposure";

describe("support console exposure flag", () => {
  it("fails closed when ENABLE_SUPPORT_CONSOLE is missing", () => {
    expect(isSupportConsoleEnabled({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("enables when ENABLE_SUPPORT_CONSOLE uses a truthy token", () => {
    expect(
      isSupportConsoleEnabled({ NODE_ENV: "test", ENABLE_SUPPORT_CONSOLE: "true" } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isSupportConsoleEnabled({ NODE_ENV: "test", ENABLE_SUPPORT_CONSOLE: "1" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
