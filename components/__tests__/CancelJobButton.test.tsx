// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// The destructive cancel is a real server action wired as the form action.
// Stub it so we can assert whether the confirm guard lets it run.
const cancelJobFromForm = vi.fn();
vi.mock("@/lib/actions/job-actions", () => ({
  cancelJobFromForm: (...args: unknown[]) => cancelJobFromForm(...args),
}));

import CancelJobButton from "@/components/jobs/CancelJobButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("CancelJobButton", () => {
  it("carries the job id into the form for the server action", () => {
    render(<CancelJobButton jobId="job-42" />);
    const hidden = document.querySelector('input[name="job_id"]') as HTMLInputElement;
    expect(hidden).toBeInTheDocument();
    expect(hidden.value).toBe("job-42");
  });

  it("does NOT run the cancel action when the confirmation is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CancelJobButton jobId="job-42" />);

    fireEvent.click(screen.getByRole("button", { name: /Cancel Job/i }));

    expect(confirmSpy).toHaveBeenCalledWith("Cancel this job? This action cannot be undone.");
    // Give React a chance to (not) dispatch the action, then assert it stayed blocked.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cancelJobFromForm).not.toHaveBeenCalled();
  });

  it("runs the cancel action with the job id when the confirmation is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CancelJobButton jobId="job-42" />);

    fireEvent.click(screen.getByRole("button", { name: /Cancel Job/i }));

    await waitFor(() => expect(cancelJobFromForm).toHaveBeenCalledTimes(1));
    const submittedFormData = cancelJobFromForm.mock.calls[0]?.[0] as FormData | undefined;
    expect(submittedFormData).toBeInstanceOf(FormData);
    expect(submittedFormData?.get("job_id")).toBe("job-42");
  });
});
