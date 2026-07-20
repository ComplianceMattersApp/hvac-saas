import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESTIMATE_PHOTO_ALLOWED_TYPES,
  ESTIMATE_PHOTO_MAX_BYTES,
  ESTIMATE_PHOTO_MAX_COUNT,
} from "../estimate-photos";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260720150000_estimate_photos.sql"),
  "utf8",
);
const actions = readFileSync(resolve(__dirname, "../../actions/estimate-photo-actions.ts"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/estimates/[id]/page.tsx"), "utf8");
const proposal = readFileSync(resolve(process.cwd(), "app/proposals/[token]/page.tsx"), "utf8");
const print = readFileSync(resolve(process.cwd(), "app/estimates/[id]/print/page.tsx"), "utf8");

describe("estimate photo foundation", () => {
  it("limits uploads to supported field-photo formats and sizes", () => {
    expect(ESTIMATE_PHOTO_MAX_COUNT).toBe(12);
    expect(ESTIMATE_PHOTO_MAX_BYTES).toBe(12 * 1024 * 1024);
    expect([...ESTIMATE_PHOTO_ALLOWED_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]);
  });

  it("locks photo rows to an authenticated internal account and parent estimate", () => {
    expect(migration).toContain("ALTER TABLE public.estimate_photos ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("actor.account_owner_user_id = estimate_photos.account_owner_user_id");
    expect(migration).toContain("estimate.id = estimate_photos.estimate_id");
    expect(migration).toContain("estimate.account_owner_user_id = estimate_photos.account_owner_user_id");
    expect(actions).toContain('.eq("account_owner_user_id", internalUser.account_owner_user_id)');
    expect(actions).toContain("createSignedUploadUrl");
    expect(actions).toContain("Photos can only be changed while the estimate is a draft.");
    expect(actions).not.toContain("getPublicUrl");
  });

  it("renders photos internally and only customer-visible photos on proposal outputs", () => {
    expect(detail).toContain("<EstimatePhotos");
    expect(proposal).toContain("proposal.photos.map");
    expect(print).toContain("estimatePhotos.map");
    expect(readFileSync(resolve(process.cwd(), "lib/estimates/estimate-proposal-public-read.ts"), "utf8"))
      .toContain("customerVisibleOnly: true");
  });
});
