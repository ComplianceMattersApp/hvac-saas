import { describe, expect, it } from "vitest";

import {
  JOB_ATTACHMENT_MAX_PAGE_SIZE,
  JOB_ATTACHMENT_PAGE_SIZE,
  resolveAttachmentPageRange,
} from "@/lib/attachments/job-attachment-pagination";

describe("resolveAttachmentPageRange", () => {
  it("defaults to the first page when nothing is supplied", () => {
    expect(resolveAttachmentPageRange({})).toEqual({
      offset: 0,
      limit: JOB_ATTACHMENT_PAGE_SIZE,
      to: JOB_ATTACHMENT_PAGE_SIZE - 1,
    });
  });

  it("produces an inclusive upper bound for PostgREST range()", () => {
    const range = resolveAttachmentPageRange({ offset: 24, limit: 24 });

    expect(range.offset).toBe(24);
    expect(range.to).toBe(47);
    // 24..47 inclusive is exactly 24 rows -- an off-by-one here would either
    // skip a row between pages or repeat one.
    expect(range.to - range.offset + 1).toBe(24);
  });

  it("caps the page size so a crafted request cannot ask for the table", () => {
    const range = resolveAttachmentPageRange({ limit: 100_000 });

    expect(range.limit).toBe(JOB_ATTACHMENT_MAX_PAGE_SIZE);
    expect(range.to).toBe(JOB_ATTACHMENT_MAX_PAGE_SIZE - 1);
  });

  it.each([
    ["negative", -5],
    ["not a number", "banana"],
    ["null", null],
    ["undefined", undefined],
    ["infinite", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("falls back to offset 0 when the offset is %s", (_label, offset) => {
    expect(resolveAttachmentPageRange({ offset }).offset).toBe(0);
  });

  it.each([
    ["negative", -5],
    ["zero", 0],
    ["not a number", "banana"],
    ["null", null],
    ["infinite", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("falls back to the default page size when the limit is %s", (_label, limit) => {
    expect(resolveAttachmentPageRange({ limit }).limit).toBe(JOB_ATTACHMENT_PAGE_SIZE);
  });

  it("floors fractional input rather than handing a decimal to range()", () => {
    const range = resolveAttachmentPageRange({ offset: 24.9, limit: 10.7 });

    expect(range.offset).toBe(24);
    expect(range.limit).toBe(10);
    expect(range.to).toBe(33);
  });

  it("walks consecutive pages without gaps or overlap", () => {
    const first = resolveAttachmentPageRange({ offset: 0 });
    const second = resolveAttachmentPageRange({ offset: first.to + 1 });

    expect(second.offset).toBe(first.to + 1);
    expect(second.offset).toBe(JOB_ATTACHMENT_PAGE_SIZE);
  });
});
