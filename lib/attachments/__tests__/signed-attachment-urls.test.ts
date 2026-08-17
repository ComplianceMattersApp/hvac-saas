import { describe, expect, it, vi } from "vitest";

import {
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  signAttachmentRows,
} from "@/lib/attachments/signed-attachment-urls";

function makeClient(options?: {
  failFor?: Set<string>;
  bulkError?: unknown;
}) {
  const calls: Array<{ bucket: string; paths: string[]; expiresIn: number }> = [];

  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: vi.fn(async (paths: string[], expiresIn: number) => {
          calls.push({ bucket, paths, expiresIn });

          if (options?.bulkError) return { data: null, error: options.bulkError };

          return {
            data: paths.map((path) => (
              options?.failFor?.has(path)
                ? { path, signedUrl: null, error: "Object not found" }
                : { path, signedUrl: `https://signed.example/${bucket}/${path}`, error: null }
            )),
            error: null,
          };
        }),
      }),
    },
  };

  return { client, calls };
}

describe("signAttachmentRows", () => {
  it("signs every row in a single bulk request per bucket", async () => {
    const { client, calls } = makeClient();

    const rows = [
      { id: "a", bucket: "attachments", storage_path: "job/1/a.jpg", content_type: "image/jpeg" },
      { id: "b", bucket: "attachments", storage_path: "job/1/b.jpg", content_type: "image/jpeg" },
      { id: "c", bucket: "attachments", storage_path: "job/1/c.pdf", content_type: "application/pdf" },
    ];

    const result = await signAttachmentRows({ client, rows });

    expect(calls).toHaveLength(1);
    expect(calls[0].paths).toEqual(["job/1/a.jpg", "job/1/b.jpg", "job/1/c.pdf"]);
    expect(calls[0].expiresIn).toBe(ATTACHMENT_SIGNED_URL_TTL_SECONDS);
    expect(result.map((row) => row.signedUrl)).toEqual([
      "https://signed.example/attachments/job/1/a.jpg",
      "https://signed.example/attachments/job/1/b.jpg",
      "https://signed.example/attachments/job/1/c.pdf",
    ]);
  });

  it("preserves input order and every other field on the row", async () => {
    const { client } = makeClient();

    const result = await signAttachmentRows({
      client,
      rows: [
        { id: "b", bucket: "attachments", storage_path: "job/1/b.jpg", caption: "second" },
        { id: "a", bucket: "attachments", storage_path: "job/1/a.jpg", caption: "first" },
      ],
    });

    expect(result.map((row) => row.id)).toEqual(["b", "a"]);
    expect(result.map((row) => (row as { caption?: string }).caption)).toEqual(["second", "first"]);
  });

  it("normalizes leading slashes before signing", async () => {
    const { client, calls } = makeClient();

    const result = await signAttachmentRows({
      client,
      rows: [{ id: "a", bucket: "attachments", storage_path: "//job/1/a.jpg" }],
    });

    expect(calls[0].paths).toEqual(["job/1/a.jpg"]);
    expect(result[0].storage_path).toBe("job/1/a.jpg");
  });

  it("deduplicates repeated paths into one signing request", async () => {
    const { client, calls } = makeClient();

    const result = await signAttachmentRows({
      client,
      rows: [
        { id: "a", bucket: "attachments", storage_path: "job/1/same.jpg" },
        { id: "b", bucket: "attachments", storage_path: "job/1/same.jpg" },
      ],
    });

    expect(calls[0].paths).toEqual(["job/1/same.jpg"]);
    expect(result[0].signedUrl).toBe(result[1].signedUrl);
  });

  it("issues one request per bucket", async () => {
    const { client, calls } = makeClient();

    await signAttachmentRows({
      client,
      rows: [
        { id: "a", bucket: "attachments", storage_path: "job/1/a.jpg" },
        { id: "b", bucket: "other-bucket", storage_path: "job/1/b.jpg" },
      ],
    });

    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((call) => call.bucket))).toEqual(new Set(["attachments", "other-bucket"]));
  });

  it("keeps rows on the page when an individual object cannot be signed", async () => {
    const { client } = makeClient({ failFor: new Set(["job/1/missing.jpg"]) });
    const failures: string[] = [];

    const result = await signAttachmentRows({
      client,
      rows: [
        { id: "a", bucket: "attachments", storage_path: "job/1/a.jpg" },
        { id: "missing", bucket: "attachments", storage_path: "job/1/missing.jpg" },
      ],
      onFailure: (failure) => failures.push(String(failure.storagePath)),
    });

    expect(result).toHaveLength(2);
    expect(result[0].signedUrl).toBeTruthy();
    expect(result[1].signedUrl).toBeNull();
    expect(failures).toEqual(["job/1/missing.jpg"]);
  });

  it("degrades to null URLs rather than throwing when the bulk call fails", async () => {
    const { client } = makeClient({ bulkError: new Error("storage unavailable") });
    const failures: string[] = [];

    const result = await signAttachmentRows({
      client,
      rows: [{ id: "a", bucket: "attachments", storage_path: "job/1/a.jpg" }],
      onFailure: (failure) => failures.push(failure.error),
    });

    expect(result).toHaveLength(1);
    expect(result[0].signedUrl).toBeNull();
    expect(failures).toEqual(["storage unavailable"]);
  });

  it("reports rows that carry no bucket or storage path without signing them", async () => {
    const { client, calls } = makeClient();
    const failures: string[] = [];

    const result = await signAttachmentRows({
      client,
      rows: [{ id: "broken", bucket: "", storage_path: "" }],
      onFailure: (failure) => failures.push(failure.error),
    });

    expect(calls).toHaveLength(0);
    expect(result[0].signedUrl).toBeNull();
    expect(failures).toEqual(["missing_bucket_or_storage_path"]);
  });

  it("honours a caller-supplied TTL", async () => {
    const { client, calls } = makeClient();

    await signAttachmentRows({
      client,
      rows: [{ id: "a", bucket: "attachments", storage_path: "job/1/a.jpg" }],
      expiresInSeconds: 600,
    });

    expect(calls[0].expiresIn).toBe(600);
  });

  it("returns an empty list without calling storage when there are no rows", async () => {
    const { client, calls } = makeClient();

    expect(await signAttachmentRows({ client, rows: [] })).toEqual([]);
    expect(await signAttachmentRows({ client, rows: null })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
