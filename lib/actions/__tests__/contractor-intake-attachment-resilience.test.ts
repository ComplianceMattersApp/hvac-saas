import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

type FixtureOptions = {
  existingAttachmentCount?: number;
  attachmentInsertError?: Error | null;
  signedUrlError?: Error | null;
};

function buildFixture(options?: FixtureOptions) {
  const existingAttachmentCount = options?.existingAttachmentCount ?? 0;
  const attachmentInsertError = options?.attachmentInsertError ?? null;
  const signedUrlError = options?.signedUrlError ?? null;

  const calls = {
    proposalDeleteCalls: 0,
    attachmentInsertPayloads: [] as Array<Array<Record<string, unknown>>>,
    storageRemoveCalls: [] as Array<string[]>,
    signedUrlCalls: [] as string[],
  };

  const baseClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "contractor-user-1",
            email: "contractor@example.com",
          },
        },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "contractor_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { contractor_id: "ctr-1" },
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected base table: ${table}`);
    },
  };

  const adminClient = {
    from(table: string) {
      if (table === "contractor_intake_submissions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "proposal-1",
                    contractor_id: "ctr-1",
                    review_status: "pending",
                  },
                  error: null,
                })),
              })),
            })),
          })),
          delete: vi.fn(() => {
            calls.proposalDeleteCalls += 1;
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: null, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "attachments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                count: existingAttachmentCount,
                error: null,
              })),
            })),
          })),
          insert: vi.fn(async (payload: Array<Record<string, unknown>>) => {
            calls.attachmentInsertPayloads.push(payload);
            return {
              data: attachmentInsertError ? null : payload,
              error: attachmentInsertError,
            };
          }),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn(async (path: string) => ({
          data: {
            token: "signed-token",
            path,
          },
          error: null,
        })),
        createSignedUrl: vi.fn(async (path: string) => {
          calls.signedUrlCalls.push(path);
          return {
            data: signedUrlError ? null : { signedUrl: `https://example.test/${path}` },
            error: signedUrlError,
          };
        }),
        remove: vi.fn(async (paths: string[]) => {
          calls.storageRemoveCalls.push(paths);
          return {
            data: null,
            error: null,
          };
        }),
      })),
    },
  };

  return {
    baseClient,
    adminClient,
    calls,
  };
}

describe("contractor intake attachment resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects oversized files before upload token issuance", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createContractorProposalAttachmentUploadToken } = await import("@/lib/actions/job-actions");

    await expect(
      createContractorProposalAttachmentUploadToken({
        submissionId: "proposal-1",
        fileName: "too-large.pdf",
        contentType: "application/pdf",
        fileSize: 11 * 1024 * 1024,
      }),
    ).rejects.toThrow("File exceeds the 10MB size limit.");
  });

  it("issues signed upload token for valid contractor proposal attachment", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createContractorProposalAttachmentUploadToken } = await import("@/lib/actions/job-actions");

    const token = await createContractorProposalAttachmentUploadToken({
      submissionId: "proposal-1",
      fileName: "return-visit-photo.jpg",
      contentType: "image/jpeg",
      fileSize: 512_000,
    });

    expect(token.path).toContain("contractor-intake/proposal-1/");
    expect(token.token).toBe("signed-token");
    expect(token.fileName).toContain("return-visit-photo.jpg");
  });

  it("attempts storage cleanup when attachment row insert fails and does not remove proposal", async () => {
    const fixture = buildFixture({
      attachmentInsertError: new Error("attachment insert failed"),
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { finalizeContractorProposalAttachments } = await import("@/lib/actions/job-actions");

    await expect(
      finalizeContractorProposalAttachments({
        submissionId: "proposal-1",
        uploads: [
          {
            attachmentId: "att-1",
            path: "contractor-intake/proposal-1/att-1-proof.pdf",
            fileName: "proof.pdf",
            contentType: "application/pdf",
            fileSize: 4096,
          },
        ],
      }),
    ).rejects.toThrow("Files uploaded but could not be attached to this proposal. Please try again.");

    expect(fixture.calls.storageRemoveCalls).toEqual([
      ["contractor-intake/proposal-1/att-1-proof.pdf"],
    ]);
    expect(fixture.calls.proposalDeleteCalls).toBe(0);
  });

  it("rejects finalize when uploaded storage object cannot be verified", async () => {
    const fixture = buildFixture({
      signedUrlError: new Error("object not found"),
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { finalizeContractorProposalAttachments } = await import("@/lib/actions/job-actions");

    await expect(
      finalizeContractorProposalAttachments({
        submissionId: "proposal-1",
        uploads: [
          {
            attachmentId: "att-1",
            path: "contractor-intake/proposal-1/att-1-proof.pdf",
            fileName: "proof.pdf",
            contentType: "application/pdf",
            fileSize: 4096,
          },
        ],
      }),
    ).rejects.toThrow("Uploaded files could not be verified. Please try again.");

    expect(fixture.calls.signedUrlCalls).toEqual([
      "contractor-intake/proposal-1/att-1-proof.pdf",
    ]);
    expect(fixture.calls.attachmentInsertPayloads).toHaveLength(0);
    expect(fixture.calls.proposalDeleteCalls).toBe(0);
  });
});
