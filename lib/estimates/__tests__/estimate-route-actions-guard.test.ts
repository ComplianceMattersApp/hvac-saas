import { beforeEach, describe, expect, it, vi } from "vitest";

const addEstimateLineItemMock = vi.fn();
const removeEstimateLineItemMock = vi.fn();
const updateEstimateLineItemMock = vi.fn();
const addEstimateOptionLineItemMock = vi.fn();
const removeEstimateOptionLineItemMock = vi.fn();
const updateEstimateOptionLineItemMock = vi.fn();
const transitionEstimateStatusMock = vi.fn();
const createDefaultEstimateOptionsMock = vi.fn();
const updateEstimateOptionMetadataMock = vi.fn();
const convertApprovedEstimateToJobMock = vi.fn();
const saveManualEstimateLineToPricebookMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/estimates/estimate-actions", () => ({
  addEstimateLineItem: (...args: unknown[]) => addEstimateLineItemMock(...args),
  removeEstimateLineItem: (...args: unknown[]) => removeEstimateLineItemMock(...args),
  updateEstimateLineItem: (...args: unknown[]) => updateEstimateLineItemMock(...args),
  addEstimateOptionLineItem: (...args: unknown[]) => addEstimateOptionLineItemMock(...args),
  removeEstimateOptionLineItem: (...args: unknown[]) =>
    removeEstimateOptionLineItemMock(...args),
  updateEstimateOptionLineItem: (...args: unknown[]) =>
    updateEstimateOptionLineItemMock(...args),
  transitionEstimateStatus: (...args: unknown[]) => transitionEstimateStatusMock(...args),
  createDefaultEstimateOptions: (...args: unknown[]) => createDefaultEstimateOptionsMock(...args),
  updateEstimateOptionMetadata: (...args: unknown[]) => updateEstimateOptionMetadataMock(...args),
  convertApprovedEstimateToJob: (...args: unknown[]) =>
    convertApprovedEstimateToJobMock(...args),
  saveManualEstimateLineToPricebook: (...args: unknown[]) =>
    saveManualEstimateLineToPricebookMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

describe("estimate route action guards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("addLineItemAction returns unavailable for pricebook-backed add when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { addLineItemAction } = await import("@/app/estimates/[id]/actions");

    const result = await addLineItemAction({
      estimateId: "est-1",
      sourcePricebookItemId: "pb-1",
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

  it("updateLineItemFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { updateLineItemFromForm } = await import("@/app/estimates/[id]/actions");
    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("line_item_id", "line-1");
    fd.set("item_name", "Updated");
    fd.set("item_type", "service");
    fd.set("quantity", "1");
    fd.set("unit_price", "10");

    const result = await updateLineItemFromForm(fd);
    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(updateEstimateLineItemMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updateLineItemFromForm delegates and revalidates when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    updateEstimateLineItemMock.mockResolvedValue({
      success: true,
      lineItemId: "line-1",
      subtotal_cents: 2500,
      total_cents: 2500,
    });

    const { updateLineItemFromForm } = await import("@/app/estimates/[id]/actions");
    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("line_item_id", "line-1");
    fd.set("item_name", "Updated");
    fd.set("item_type", "service");
    fd.set("quantity", "2");
    fd.set("unit_price", "12.50");

    const result = await updateLineItemFromForm(fd);
    expect(result.success).toBe(true);
    expect(updateEstimateLineItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateId: "est-1",
        lineItemId: "line-1",
        itemName: "Updated",
        itemType: "service",
        quantity: 2,
        unitPriceCents: 1250,
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
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

  it("addLineItemAction passes sourcePricebookItemId through when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "yes";
    addEstimateLineItemMock.mockResolvedValue({
      success: true,
      lineItemId: "line-2",
      subtotal_cents: 2200,
      total_cents: 2200,
    });

    const { addLineItemAction } = await import("@/app/estimates/[id]/actions");
    await addLineItemAction({
      estimateId: "est-1",
      sourcePricebookItemId: "pb-1",
      quantity: 2,
      unitPriceCents: 1100,
    });

    expect(addEstimateLineItemMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      sourcePricebookItemId: "pb-1",
      quantity: 2,
      unitPriceCents: 1100,
    });
  });

  it("transitionEstimateStatusFromForm returns unavailable when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { transitionEstimateStatusFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("next_status", "sent");

    await transitionEstimateStatusFromForm(fd);

    expect(transitionEstimateStatusMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("transitionEstimateStatusFromForm delegates and revalidates when feature flag enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    transitionEstimateStatusMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      previousStatus: "draft",
      nextStatus: "sent",
    });

    const { transitionEstimateStatusFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("next_status", "sent");

    await transitionEstimateStatusFromForm(fd);
    expect(transitionEstimateStatusMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      nextStatus: "sent",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("updateEstimateOptionMetadataAction short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { updateEstimateOptionMetadataAction } = await import("@/app/estimates/[id]/actions");

    const result = await updateEstimateOptionMetadataAction({
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      label: "Repair Only",
      summary: "Summary",
    });

    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(updateEstimateOptionMetadataMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updateEstimateOptionMetadataAction delegates and revalidates when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    updateEstimateOptionMetadataMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      label: "Repair Only",
      summary: "Summary",
    });

    const { updateEstimateOptionMetadataAction } = await import("@/app/estimates/[id]/actions");
    const result = await updateEstimateOptionMetadataAction({
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      label: "Repair Only",
      summary: "Summary",
    });

    expect(result.success).toBe(true);
    expect(updateEstimateOptionMetadataMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      label: "Repair Only",
      summary: "Summary",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("addEstimateOptionLineItemFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { addEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("item_name", "Repair Labor");
    fd.set("item_type", "service");
    fd.set("quantity", "1");
    fd.set("unit_price", "100");

    const result = await addEstimateOptionLineItemFromForm(fd);

    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(addEstimateOptionLineItemMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("addEstimateOptionLineItemFromForm delegates and revalidates when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    addEstimateOptionLineItemMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      lineItemId: "opt-line-1",
      subtotal_cents: 10000,
      total_cents: 10000,
    });

    const { addEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("item_name", "Repair Labor");
    fd.set("item_type", "service");
    fd.set("quantity", "2");
    fd.set("unit_price", "12.34");

    const result = await addEstimateOptionLineItemFromForm(fd);

    expect(result.success).toBe(true);
    expect(addEstimateOptionLineItemMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      sourcePricebookItemId: null,
      itemName: "Repair Labor",
      itemType: "service",
      quantity: 2,
      unitPriceCents: 1234,
      description: null,
      category: null,
      unitLabel: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("addEstimateOptionLineItemFromForm passes sourcePricebookItemId through when present", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    addEstimateOptionLineItemMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      lineItemId: "opt-line-2",
      subtotal_cents: 2000,
      total_cents: 2000,
    });

    const { addEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("source_pricebook_item_id", "pb-1");
    fd.set("item_name", "");
    fd.set("item_type", "");
    fd.set("quantity", "1");
    fd.set("unit_price", "20");

    await addEstimateOptionLineItemFromForm(fd);

    expect(addEstimateOptionLineItemMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      sourcePricebookItemId: "pb-1",
      itemName: "",
      itemType: "",
      quantity: 1,
      unitPriceCents: 2000,
      description: null,
      category: null,
      unitLabel: null,
    });
  });

  it("addEstimateOptionLineItemFromForm does not revalidate on failure", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    addEstimateOptionLineItemMock.mockResolvedValue({
      success: false,
      error: "Option package not found on this estimate.",
    });

    const { addEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("item_name", "Repair Labor");
    fd.set("item_type", "service");
    fd.set("quantity", "1");
    fd.set("unit_price", "10");

    const result = await addEstimateOptionLineItemFromForm(fd);

    expect(result).toEqual({
      success: false,
      error: "Option package not found on this estimate.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("saveManualEstimateLineToPricebookFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { saveManualEstimateLineToPricebookFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("line_scope", "flat");
    fd.set("line_item_id", "line-1");

    const result = await saveManualEstimateLineToPricebookFromForm(fd);

    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(saveManualEstimateLineToPricebookMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("saveManualEstimateLineToPricebookFromForm delegates and revalidates on success", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    saveManualEstimateLineToPricebookMock.mockResolvedValue({
      success: true,
      created: true,
      duplicate: false,
      pricebookItemId: "pb-1",
    });

    const { saveManualEstimateLineToPricebookFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("line_scope", "option");
    fd.set("line_item_id", "line-1");
    fd.set("estimate_option_id", "opt-1");

    const result = await saveManualEstimateLineToPricebookFromForm(fd);

    expect(result).toEqual({
      success: true,
      created: true,
      duplicate: false,
      pricebookItemId: "pb-1",
    });
    expect(saveManualEstimateLineToPricebookMock).toHaveBeenCalledWith({
      lineScope: "option",
      estimateId: "est-1",
      lineItemId: "line-1",
      estimateOptionId: "opt-1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("removeEstimateOptionLineItemFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { removeEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("line_item_id", "opt-line-1");

    const result = await removeEstimateOptionLineItemFromForm(fd);

    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(removeEstimateOptionLineItemMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("removeEstimateOptionLineItemFromForm delegates and revalidates when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    removeEstimateOptionLineItemMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      lineItemId: "opt-line-1",
      subtotal_cents: 8000,
      total_cents: 8000,
    });

    const { removeEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("line_item_id", "opt-line-1");

    const result = await removeEstimateOptionLineItemFromForm(fd);

    expect(result.success).toBe(true);
    expect(removeEstimateOptionLineItemMock).toHaveBeenCalledWith({
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      lineItemId: "opt-line-1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("updateEstimateOptionLineItemFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { updateEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("line_item_id", "opt-line-1");
    fd.set("item_name", "Updated");
    fd.set("item_type", "service");
    fd.set("quantity", "1");
    fd.set("unit_price", "10");

    const result = await updateEstimateOptionLineItemFromForm(fd);
    expect(result).toEqual({
      success: false,
      error: "Estimates are currently unavailable.",
    });
    expect(updateEstimateOptionLineItemMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updateEstimateOptionLineItemFromForm delegates and revalidates when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    updateEstimateOptionLineItemMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      estimateOptionId: "opt-1",
      lineItemId: "opt-line-1",
      subtotal_cents: 5000,
      total_cents: 5000,
    });

    const { updateEstimateOptionLineItemFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");
    fd.set("estimate_option_id", "opt-1");
    fd.set("line_item_id", "opt-line-1");
    fd.set("item_name", "Updated");
    fd.set("item_type", "service");
    fd.set("quantity", "2");
    fd.set("unit_price", "25.00");

    const result = await updateEstimateOptionLineItemFromForm(fd);
    expect(result.success).toBe(true);
    expect(updateEstimateOptionLineItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateId: "est-1",
        estimateOptionId: "opt-1",
        lineItemId: "opt-line-1",
        itemName: "Updated",
        itemType: "service",
        quantity: 2,
        unitPriceCents: 2500,
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
  });

  it("convertEstimateToJobFromForm short-circuits when feature flag disabled", async () => {
    process.env.ENABLE_ESTIMATES = "false";
    const { convertEstimateToJobFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");

    await convertEstimateToJobFromForm(fd);

    expect(convertApprovedEstimateToJobMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("convertEstimateToJobFromForm delegates, revalidates, and redirects to job when enabled", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    convertApprovedEstimateToJobMock.mockResolvedValue({
      success: true,
      estimateId: "est-1",
      jobId: "job-1",
      previousStatus: "approved",
      nextStatus: "converted",
    });

    const { convertEstimateToJobFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");

    const result = await convertEstimateToJobFromForm(fd);

    expect(result?.success).toBe(true);
    expect(convertApprovedEstimateToJobMock).toHaveBeenCalledWith({ estimateId: "est-1" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/estimates/est-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs");
    expect(redirectMock).toHaveBeenCalledWith("/jobs/job-1");
  });

  it("convertEstimateToJobFromForm preserves failure result without redirect", async () => {
    process.env.ENABLE_ESTIMATES = "true";
    convertApprovedEstimateToJobMock.mockResolvedValue({
      success: false,
      error: "Estimate already converted.",
      existingJobId: "job-existing",
    });

    const { convertEstimateToJobFromForm } = await import("@/app/estimates/[id]/actions");

    const fd = new FormData();
    fd.set("estimate_id", "est-1");

    const result = await convertEstimateToJobFromForm(fd);

    expect(result).toEqual({
      success: false,
      error: "Estimate already converted.",
      existingJobId: "job-existing",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
