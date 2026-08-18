import { describe, expect, it } from "vitest";

import {
  JOB_ATTACHMENT_ACCEPT_ATTRIBUTE,
  JOB_ATTACHMENT_MAX_FILE_NAME_LENGTH,
  JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  inferAttachmentContentType,
  isAllowedJobAttachmentContentType,
  normalizeAttachmentContentType,
  parseAttachmentFileExtension,
  partitionJobAttachmentFiles,
  safeAttachmentFileName,
  validateJobAttachmentMetadata,
} from "@/lib/attachments/attachment-upload-policy";

describe("attachment upload policy", () => {
  describe("safeAttachmentFileName", () => {
    it("replaces path separators so a name cannot escape its key prefix", () => {
      expect(safeAttachmentFileName("../../etc/passwd")).toBe("_.._etc_passwd");
      expect(safeAttachmentFileName("a/b\\c.jpg")).toBe("a_b_c.jpg");
    });

    it("falls back to a stable name when nothing usable remains", () => {
      expect(safeAttachmentFileName("")).toBe("attachment");
      expect(safeAttachmentFileName("   ")).toBe("attachment");
      expect(safeAttachmentFileName("...")).toBe("attachment");
    });

    it("bounds the length while preserving the extension", () => {
      const long = `${"a".repeat(400)}.jpg`;
      const result = safeAttachmentFileName(long);

      expect(result.length).toBeLessThanOrEqual(JOB_ATTACHMENT_MAX_FILE_NAME_LENGTH);
      expect(result.endsWith(".jpg")).toBe(true);
    });

    it("leaves ordinary names untouched", () => {
      expect(safeAttachmentFileName("Return air (before).jpg")).toBe("Return air (before).jpg");
    });
  });

  describe("normalizeAttachmentContentType", () => {
    it("lowercases and drops parameters", () => {
      expect(normalizeAttachmentContentType(" IMAGE/JPEG; charset=binary ")).toBe("image/jpeg");
    });

    it("treats missing values as empty", () => {
      expect(normalizeAttachmentContentType(null)).toBe("");
      expect(normalizeAttachmentContentType(undefined)).toBe("");
    });
  });

  describe("parseAttachmentFileExtension", () => {
    it("reads the trailing extension in lower case", () => {
      expect(parseAttachmentFileExtension("Gauge.JPG")).toBe("jpg");
      expect(parseAttachmentFileExtension("archive.tar.gz")).toBe("gz");
    });

    it("returns empty when there is no usable extension", () => {
      expect(parseAttachmentFileExtension("README")).toBe("");
      expect(parseAttachmentFileExtension(".hidden")).toBe("");
      expect(parseAttachmentFileExtension("trailing.")).toBe("");
    });
  });

  describe("validateJobAttachmentMetadata", () => {
    it("accepts the ordinary job photo and paperwork cases", () => {
      expect(
        validateJobAttachmentMetadata({
          fileName: "gauge.jpg",
          contentType: "image/jpeg",
          fileSize: 2_000_000,
        }),
      ).toBeNull();

      expect(
        validateJobAttachmentMetadata({
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          fileSize: 500_000,
        }),
      ).toBeNull();
    });

    it("rejects active-content types outright", () => {
      for (const [fileName, contentType] of [
        ["payload.html", "text/html"],
        ["logo.svg", "image/svg+xml"],
        ["tool.exe", "application/x-msdownload"],
      ]) {
        expect(
          validateJobAttachmentMetadata({ fileName, contentType, fileSize: 1024 }),
        ).not.toBeNull();
      }
    });

    it("rejects a mismatch between the declared type and the extension", () => {
      // A file claiming to be a photo but landing in storage as .html.
      expect(
        validateJobAttachmentMetadata({
          fileName: "payload.html",
          contentType: "image/jpeg",
          fileSize: 1024,
        }),
      ).toBe("The file extension does not match the file type.");
    });

    it("rejects files over the size limit", () => {
      expect(
        validateJobAttachmentMetadata({
          fileName: "huge.jpg",
          contentType: "image/jpeg",
          fileSize: JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES + 1,
        }),
      ).toContain("size limit");
    });

    it("rejects empty, missing, and non-numeric sizes", () => {
      expect(
        validateJobAttachmentMetadata({ fileName: "a.jpg", contentType: "image/jpeg", fileSize: 0 }),
      ).toBe("File is empty or invalid.");
      expect(
        validateJobAttachmentMetadata({
          fileName: "a.jpg",
          contentType: "image/jpeg",
          fileSize: "not-a-number",
        }),
      ).toBe("File is empty or invalid.");
      expect(
        validateJobAttachmentMetadata({
          fileName: "a.jpg",
          contentType: "image/jpeg",
          fileSize: -5,
        }),
      ).toBe("File is empty or invalid.");
    });

    it("requires a file name", () => {
      expect(
        validateJobAttachmentMetadata({ fileName: "  ", contentType: "image/jpeg", fileSize: 10 }),
      ).toBe("File name is required.");
    });
  });

  describe("inferAttachmentContentType", () => {
    it("keeps a usable type the browser supplied", () => {
      expect(
        inferAttachmentContentType({ fileName: "gauge.jpg", declaredContentType: "image/jpeg" }),
      ).toBe("image/jpeg");
    });

    it("recovers the type from the extension when the browser does not know it", () => {
      // iOS/Android pickers routinely report "" or octet-stream for HEIC.
      expect(inferAttachmentContentType({ fileName: "IMG_0001.heic", declaredContentType: "" })).toBe(
        "image/heic",
      );
      expect(
        inferAttachmentContentType({
          fileName: "scan.pdf",
          declaredContentType: "application/octet-stream",
        }),
      ).toBe("application/pdf");
    });

    it("does not invent a type for unsupported extensions", () => {
      expect(inferAttachmentContentType({ fileName: "tool.exe", declaredContentType: "" })).toBe("");
    });
  });

  it("exposes an accept attribute covering both MIME types and extensions", () => {
    expect(JOB_ATTACHMENT_ACCEPT_ATTRIBUTE).toContain("image/jpeg");
    expect(JOB_ATTACHMENT_ACCEPT_ATTRIBUTE).toContain(".pdf");
    expect(JOB_ATTACHMENT_ACCEPT_ATTRIBUTE).not.toContain("svg");
  });

  it("reports allowed content types", () => {
    expect(isAllowedJobAttachmentContentType("image/png")).toBe(true);
    expect(isAllowedJobAttachmentContentType("image/svg+xml")).toBe(false);
  });

  describe("partitionJobAttachmentFiles", () => {
    function fakeFile(name: string, type: string, size: number) {
      return { name, type, size } as unknown as File;
    }

    it("keeps supported files and explains each rejection by name", () => {
      const { accepted, rejected } = partitionJobAttachmentFiles([
        fakeFile("gauge.jpg", "image/jpeg", 1_000_000),
        fakeFile("payload.html", "text/html", 200),
        fakeFile("huge.png", "image/png", JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES + 1),
      ]);

      expect(accepted.map((file) => file.name)).toEqual(["gauge.jpg"]);
      expect(rejected).toHaveLength(2);
      expect(rejected[0]).toContain("payload.html");
      expect(rejected[1]).toContain("huge.png");
    });

    it("accepts a HEIC photo the browser could not type", () => {
      const { accepted, rejected } = partitionJobAttachmentFiles([
        fakeFile("IMG_0001.heic", "", 3_000_000),
      ]);

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(0);
    });
  });
});
