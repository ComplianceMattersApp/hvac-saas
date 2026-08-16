import { describe, expect, it, vi } from "vitest";

import { startOpsServerTimer } from "@/lib/ops/ops-server-timing";

describe("Operations server timing", () => {
  it("records monotonic elapsed time when diagnostics are enabled", () => {
    const timestamps = [100.4, 126.1];
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const finish = startOpsServerTimer(true, () => timestamps.shift() ?? 0);

    finish("ops:test");

    expect(log).toHaveBeenCalledWith("[ops:test] 26ms");
    log.mockRestore();
  });

  it("does no clock work and emits no log when diagnostics are disabled", () => {
    const now = vi.fn(() => 100);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const finish = startOpsServerTimer(false, now);

    finish("ops:test");

    expect(now).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
