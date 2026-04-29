import { describe, expect, it } from "vitest";
import {
  buildDragPayload,
  computeDropStartMinutes,
  computeDropWindow,
  extractDraggedJobPayloadFromDataTransfer,
} from "@/components/calendar/calendar-dnd";

function makeTransfer(seed: Record<string, string>): DataTransfer {
  return {
    dropEffect: "move",
    effectAllowed: "all",
    files: [] as any,
    items: [] as any,
    types: Object.keys(seed),
    clearData: () => undefined,
    getData: (format: string) => seed[format] ?? "",
    setData: () => undefined,
    setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

describe("calendar drag/drop mapping", () => {
  it("extracts explicit JSON payload with existing window", () => {
    const payload = buildDragPayload({ jobId: "job-1", windowStart: "08:00", windowEnd: "10:00" });
    const transfer = makeTransfer({ "application/x-cm-job": JSON.stringify(payload) });

    const extracted = extractDraggedJobPayloadFromDataTransfer(transfer);

    expect(extracted).toEqual(payload);
  });

  it("falls back to URI payload for unscheduled queue links", () => {
    const transfer = makeTransfer({ "text/uri-list": "http://localhost:3000/calendar?view=week&date=2026-04-29&job=job-2" });

    const extracted = extractDraggedJobPayloadFromDataTransfer(transfer);

    expect(extracted).toEqual({ jobId: "job-2", windowStart: null, windowEnd: null });
  });

  it("maps pointer position to snapped start minute and preserves existing duration", () => {
    const start = computeDropStartMinutes({
      clientY: 300,
      top: 100,
      height: 600,
      gridStartMinutes: 360,
      gridEndMinutes: 1080,
      snapMinutes: 30,
    });

    const window = computeDropWindow({
      payload: { jobId: "job-3", windowStart: "09:00", windowEnd: "11:00" },
      startMinutes: start,
      gridEndMinutes: 1080,
    });

    expect(start % 30).toBe(0);
    expect(window.windowStart).toBe("10:00");
    expect(window.windowEnd).toBe("12:00");
  });

  it("uses default duration for unscheduled jobs when no existing window exists", () => {
    const window = computeDropWindow({
      payload: { jobId: "job-4", windowStart: null, windowEnd: null },
      startMinutes: 15 * 60,
      gridEndMinutes: 18 * 60,
    });

    expect(window).toEqual({ windowStart: "15:00", windowEnd: "17:00" });
  });
});
