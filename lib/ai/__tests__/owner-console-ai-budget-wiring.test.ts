import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "app/ops/owner-console/page.tsx"), "utf8");
const panel = readFileSync(join(process.cwd(), "app/ops/owner-console/AiUsageBudgetPanel.tsx"), "utf8");
const action = readFileSync(join(process.cwd(), "lib/actions/ai-budget-actions.ts"), "utf8");

describe("Platform Owner AI budget controls", () => {
  it("renders only inside the already allowlisted Platform Owner console", () => {
    expect(page).toContain("await requirePlatformOwnerOrFailClosed()");
    expect(page).toContain("<AiUsageBudgetPanel");
    expect(page).toContain("loadAiBudgetSnapshot({ admin })");
  });

  it("rechecks the platform-owner allowlist before mutation", () => {
    expect(action).toContain("isPlatformOwnerActor");
    expect(action).toContain("notFound()");
    expect(action).toContain('.eq("singleton_key", "global")');
  });

  it("exposes a hard-cap field and global kill switch without provider calls", () => {
    expect(panel).toContain('name="monthly_limit_dollars"');
    expect(panel).toContain('name="is_enabled"');
    expect(panel).toContain("Provider requests must reserve against this global ceiling");
    expect(`${page}\n${panel}\n${action}`).not.toContain("api.openai.com");
  });
});
