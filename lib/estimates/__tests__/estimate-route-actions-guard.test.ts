import { beforeEach, describe, expect, it, vi } from "vitest";

const addEstimateLineItemMock = vi.fn();
const removeEstimateLineItemMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("@/lib/estimates/estimate-actions", () => ({
  addEstimateLineItem: (...args: unknown[]) => addEstimateLineItemMock(...args),
  removeEstimateLineItem: (...args: unknown[]) => removeEstimateLineItemMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

describe("estimate route action guards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("addLineItemAction returns unavailable when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { addLineItemAction } = await import("@/app/estimates/[id]/actions");

    const result = await addLineItemAction({
      estimateId: "est-1",
      itemName: "Line",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });

    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(addEstimateLineItemMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("removeLineItemFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "0";
    const { removeLineItemFromForm } = await import("@/app/estimates/[id]/actions");
    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("line_item_id", "line-1");

    await removeLineItemFromForm(fd);

    expect(removeEstimateLineItemMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("addLineItemAction delegates when feature flag enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    addEstimateLineItemMock.mockResolvedValue({
      success: true,
      lineItemId: "line-1",
      subtotal_cents: 100,
      total_cents: 100,
    });

    const { addLineItemAction } = await import("@/app/estimates/[id]/actions");
    const result = await addLineItemAction({
      estimateId: "est-1",
      itemName: "Line",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 100,
    });

    expect(result.success).toBe(true);
    expect(addEstimateLineItemMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });
});
