import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

type PermitRow = {
  id: string;
  account_owner_user_id: string;
};

type AttachmentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string | null;
};

function makeFixture(options?: {
  permitRows?: PermitRow[];
  attachmentRows?: AttachmentRow[];
  schemaUnavailable?: boolean;
  internalUser?: boolean;
}) {
  const calls = {
    signedUrlPaths: [] as string[],
  };

  const permitRows = options?.permitRows ?? [
    { id: "permit-1", account_owner_user_id: "owner-1" },
  ];
  const attachmentRows = options?.attachmentRows ?? [
    {
      id: "att-1",
      entity_type: "permit_request",
      entity_id: "permit-1",
      bucket: "attachments",
      storage_path: "permit-requests/staged/ctr-1/att-1-contract.pdf",
      file_name: "contract.pdf",
      content_type: "application/pdf",
      file_size: 4096,
      caption: null,
      created_at: "2026-06-16T12:00:00.000Z",
    },
  ];

  function makeQuery(table: string) {
    let rows: any[] = table === "permit_requests" ? permitRows.slice() : attachmentRows.slice();
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: string) => {
        rows = rows.filter((row) => String(row[column] ?? "") === String(value));
        return query;
      }),
      in: vi.fn((column: string, values: string[]) => {
        rows = rows.filter((row) => values.includes(String(row[column] ?? "")));
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({
        data: options?.schemaUnavailable ? null : rows,
        error: options?.schemaUnavailable
          ? {
              code: "PGRST205",
              message: "Could not find the table 'public.permit_requests' in the schema cache",
            }
          : null,
      })),
    };

    query.then = (resolve: (value: unknown) => void) => {
      resolve({
        data: options?.schemaUnavailable ? null : rows,
        error: options?.schemaUnavailable
          ? {
              code: "PGRST205",
              message: "Could not find the table 'public.attachments' in the schema cache",
            }
          : null,
      });
    };

    return query;
  }

  const admin = {
    from(table: string) {
      if (table === "permit_requests" || table === "attachments") return makeQuery(table);
      throw new Error(`Unexpected admin table: ${table}`);
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async (path: string) => {
          calls.signedUrlPaths.push(path);
          return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
        }),
      })),
    },
  };

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: options?.internalUser === false ? "contractor-user-1" : "internal-user-1" } },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: options?.internalUser === false
                  ? null
                  : {
                      user_id: "internal-user-1",
                      role: "office",
                      is_active: true,
                      account_owner_user_id: "owner-1",
                      created_by: null,
                    },
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected base table: ${table}`);
    },
  };

  return {
    admin,
    supabase,
    calls,
  };
}

describe("permit request attachment read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("lists signed permit_request attachments for account-owned permit requests", async () => {
    const fixture = makeFixture();

    const { listInternalPermitRequestAttachmentsForAccount } = await import("../permit-request-attachments-read-model");

    const result = await listInternalPermitRequestAttachmentsForAccount({
      accountOwnerUserId: "owner-1",
      permitRequestIds: ["permit-1"],
      admin: fixture.admin,
      expiresInSeconds: 60,
    });

    expect(result.schemaAvailable).toBe(true);
    expect(result.attachmentsByPermitRequestId["permit-1"]).toEqual([
      expect.objectContaining({
        id: "att-1",
        permitRequestId: "permit-1",
        fileName: "contract.pdf",
        contentType: "application/pdf",
        signedUrl: "https://signed.example/permit-requests/staged/ctr-1/att-1-contract.pdf",
      }),
    ]);
    expect(fixture.calls.signedUrlPaths).toEqual(["permit-requests/staged/ctr-1/att-1-contract.pdf"]);
  });

  it("filters to permit_request entity type and account-owned permit request ids", async () => {
    const fixture = makeFixture({
      permitRows: [
        { id: "permit-1", account_owner_user_id: "owner-1" },
        { id: "permit-2", account_owner_user_id: "owner-2" },
      ],
      attachmentRows: [
        {
          id: "att-1",
          entity_type: "permit_request",
          entity_id: "permit-1",
          bucket: "attachments",
          storage_path: "permit-requests/staged/ctr-1/att-1-contract.pdf",
          file_name: "contract.pdf",
          content_type: "application/pdf",
          file_size: 4096,
          caption: null,
          created_at: "2026-06-16T12:00:00.000Z",
        },
        {
          id: "att-2",
          entity_type: "job",
          entity_id: "permit-1",
          bucket: "attachments",
          storage_path: "jobs/permit-1/att-2.pdf",
          file_name: "wrong-entity.pdf",
          content_type: "application/pdf",
          file_size: 100,
          caption: null,
          created_at: "2026-06-16T12:00:00.000Z",
        },
        {
          id: "att-3",
          entity_type: "permit_request",
          entity_id: "permit-2",
          bucket: "attachments",
          storage_path: "permit-requests/staged/ctr-2/att-3.pdf",
          file_name: "other-account.pdf",
          content_type: "application/pdf",
          file_size: 100,
          caption: null,
          created_at: "2026-06-16T12:00:00.000Z",
        },
      ],
    });

    const { listInternalPermitRequestAttachmentsForAccount } = await import("../permit-request-attachments-read-model");

    const result = await listInternalPermitRequestAttachmentsForAccount({
      accountOwnerUserId: "owner-1",
      permitRequestIds: ["permit-1", "permit-2"],
      admin: fixture.admin,
    });

    expect(Object.keys(result.attachmentsByPermitRequestId)).toEqual(["permit-1"]);
    expect(result.attachmentsByPermitRequestId["permit-1"].map((attachment) => attachment.id)).toEqual(["att-1"]);
  });

  it("fails closed when permit or attachment schema is unavailable", async () => {
    const fixture = makeFixture({ schemaUnavailable: true });

    const { listInternalPermitRequestAttachmentsForAccount } = await import("../permit-request-attachments-read-model");

    await expect(
      listInternalPermitRequestAttachmentsForAccount({
        accountOwnerUserId: "owner-1",
        permitRequestIds: ["permit-1"],
        admin: fixture.admin,
      }),
    ).resolves.toEqual({ schemaAvailable: false, attachmentsByPermitRequestId: {} });
  });

  it("requires an active internal user for the current-user helper", async () => {
    const fixture = makeFixture({ internalUser: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { listCurrentInternalPermitRequestAttachments } = await import("../permit-request-attachments-read-model");

    await expect(
      listCurrentInternalPermitRequestAttachments({
        permitRequestIds: ["permit-1"],
      }),
    ).rejects.toThrow("Active internal user required.");
  });
});
