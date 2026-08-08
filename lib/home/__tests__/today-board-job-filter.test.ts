import { describe, expect, it } from "vitest";
import { isTodayBoardJob } from "@/lib/home/today-read-model";

const TODAY = "2026-08-08";

const job = (
  status: string | null,
  opsStatus: string | null,
  scheduledDate: string | null = TODAY,
) => ({ status, opsStatus, scheduledDate });

describe("isTodayBoardJob", () => {
  it("drops a job left en route that was later closed", () => {
    // The query has no date bound on on_the_way/in_process, so this row sat on the
    // office board forever.
    expect(isTodayBoardJob(job("on_the_way", "closed", "2026-05-01"), TODAY)).toBe(false);
  });

  it("drops cancelled and archived jobs", () => {
    expect(isTodayBoardJob(job("cancelled", "scheduled"), TODAY)).toBe(false);
    expect(isTodayBoardJob(job("on_the_way", "archived"), TODAY)).toBe(false);
  });

  it("drops a blocked job scheduled for another day", () => {
    expect(isTodayBoardJob(job("on_the_way", "on_hold", "2026-06-02"), TODAY)).toBe(false);
    expect(isTodayBoardJob(job("in_process", "pending_info", null), TODAY)).toBe(false);
  });

  it("keeps a blocked job that is scheduled for today, since someone must deal with it", () => {
    expect(isTodayBoardJob(job("on_the_way", "on_hold", TODAY), TODAY)).toBe(true);
    expect(isTodayBoardJob(job("scheduled", "pending_info", TODAY), TODAY)).toBe(true);
  });

  it("keeps genuinely live field work regardless of its scheduled date", () => {
    expect(isTodayBoardJob(job("on_the_way", "scheduled", "2026-08-07"), TODAY)).toBe(true);
    expect(isTodayBoardJob(job("in_process", "scheduled", "2026-08-07"), TODAY)).toBe(true);
  });

  it("keeps ordinary scheduled work", () => {
    expect(isTodayBoardJob(job("scheduled", "scheduled", TODAY), TODAY)).toBe(true);
    expect(isTodayBoardJob(job(null, null, null), TODAY)).toBe(true);
  });
});
