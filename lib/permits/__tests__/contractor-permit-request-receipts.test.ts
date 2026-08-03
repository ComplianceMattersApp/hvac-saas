import { describe, expect, it, vi } from "vitest";
import {
  buildPermitRequestReferenceCode,
  listContractorPermitRequestReceipts,
} from "../contractor-permit-request-receipts";

type PermitRow = Record<string, unknown>;

function buildAdmin(options?: {
  permitRows?: PermitRow[];
  permitError?: unknown;
  attachmentRows?: Array<{ entity_id: string }>;
  attachmentError?: unknown;
}) {
  const calls = {
    permitFilters: [] as Array<[string, unknown]>,
    attachmentFilters: [] as Array<[string, unknown]>,
    limits: [] as number[],
  };

  const admin = {
    from(table: string) {
      if (table === "permit_requests") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((column: string, value: unknown) => {
            calls.permitFilters.push([column, value]);
            return chain;
          }),
          order: vi.fn(() => chain),
          limit: vi.fn(async (count: number) => {
            calls.limits.push(count);
            return {
              data: options?.permitError ? null : (options?.permitRows ?? []),
              error: options?.permitError ?? null,
            };
          }),
        };
        return chain;
      }

      if (table === "attachments") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((column: string, value: unknown) => {
            calls.attachmentFilters.push([column, value]);
            return chain;
          }),
          in: vi.fn(async (column: string, values: unknown) => {
            calls.attachmentFilters.push([column, values]);
            return {
              data: options?.attachmentError ? null : (options?.attachmentRows ?? []),
              error: options?.attachmentError ?? null,
            };
          }),
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, calls };
}

const scope = {
  contractorId: "ctr-1",
  accountOwnerUserId: "owner-1",
};

describe("contractor permit request receipts", () => {
  it("builds a stable, quotable reference code from the request id", () => {
    expect(buildPermitRequestReferenceCode("ffe521b9-1c1a-4378-9995-ad5cdcb90939")).toBe(
      "PR-FFE521B9",
    );
    expect(buildPermitRequestReferenceCode("")).toBe("");
  });

  it("returns the contractor's own requests with status labels and file counts", async () => {
    const { admin, calls } = buildAdmin({
      permitRows: [
        {
          id: "req-1",
          created_at: "2026-07-31T20:48:59.166485+00:00",
          status: "permit_request",
          post_permit_route: null,
          contractor_note: "  Two new residential units  ",
        },
        {
          id: "req-2",
          created_at: "2026-07-22T02:56:03.882749+00:00",
          status: "permit_created",
          post_permit_route: "ready_for_testing",
          contractor_note: null,
        },
      ],
      attachmentRows: [
        { entity_id: "req-1" },
        { entity_id: "req-1" },
        { entity_id: "req-1" },
      ],
    });

    const receipts = await listContractorPermitRequestReceipts({ admin, ...scope });

    expect(receipts).toEqual([
      {
        id: "req-1",
        referenceCode: "PR-REQ1",
        createdAt: "2026-07-31T20:48:59.166485+00:00",
        status: "permit_request",
        statusLabel: "Submitted",
        note: "Two new residential units",
        attachmentCount: 3,
      },
      {
        id: "req-2",
        referenceCode: "PR-REQ2",
        createdAt: "2026-07-22T02:56:03.882749+00:00",
        status: "permit_created",
        statusLabel: "Ready for Testing",
        note: null,
        attachmentCount: 0,
      },
    ]);

    expect(calls.permitFilters).toEqual([
      ["account_owner_user_id", "owner-1"],
      ["contractor_id", "ctr-1"],
    ]);
    expect(calls.limits).toEqual([10]);
  });

  it("scopes the read to the contractor and account owner", async () => {
    const { admin, calls } = buildAdmin({ permitRows: [] });

    await listContractorPermitRequestReceipts({ admin, ...scope });

    expect(calls.permitFilters).toContainEqual(["contractor_id", "ctr-1"]);
    expect(calls.permitFilters).toContainEqual(["account_owner_user_id", "owner-1"]);
  });

  it("returns an empty list when the permit schema is unavailable", async () => {
    const { admin } = buildAdmin({
      permitError: {
        code: "PGRST205",
        message: "Could not find the table 'public.permit_requests' in the schema cache",
      },
    });

    await expect(listContractorPermitRequestReceipts({ admin, ...scope })).resolves.toEqual([]);
  });

  it("rethrows unexpected read failures instead of hiding submissions", async () => {
    const { admin } = buildAdmin({
      permitError: { code: "57014", message: "canceling statement due to statement timeout" },
    });

    await expect(listContractorPermitRequestReceipts({ admin, ...scope })).rejects.toMatchObject({
      code: "57014",
    });
  });

  it("still lists requests when the attachment count read fails", async () => {
    const { admin } = buildAdmin({
      permitRows: [
        {
          id: "req-1",
          created_at: "2026-07-31T20:48:59.166485+00:00",
          status: "permit_request",
          post_permit_route: null,
          contractor_note: null,
        },
      ],
      attachmentError: { code: "42501", message: "permission denied" },
    });

    const receipts = await listContractorPermitRequestReceipts({ admin, ...scope });

    expect(receipts).toHaveLength(1);
    expect(receipts[0].attachmentCount).toBe(0);
  });

  it("skips rows with an unrecognized status", async () => {
    const { admin } = buildAdmin({
      permitRows: [
        {
          id: "req-1",
          created_at: "2026-07-31T20:48:59.166485+00:00",
          status: "some_future_status",
          post_permit_route: null,
          contractor_note: null,
        },
      ],
    });

    await expect(listContractorPermitRequestReceipts({ admin, ...scope })).resolves.toEqual([]);
  });
});
