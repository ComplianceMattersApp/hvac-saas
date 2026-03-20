"use client";

import { useRouter } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import { useEffect, useMemo, useState, useTransition } from "react";

import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";

type UnscheduledJob = {
  id: string;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  job_address?: string | null;
  city?: string | null;
  phone?: string | null;
  job_type?: string | null;
  title?: string | null;
  contractor_name?: string | null;
};

type SchedulePayload = {
  jobId: string;
  scheduledDate: string;
  windowStart: string;
  windowEnd: string;
};

type Props = {
  jobs: UnscheduledJob[];
  onSchedule: (payload: SchedulePayload) => Promise<{ ok: boolean; message?: string }>;
};

type FeedbackState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type LogCallOutcomeFormProps = {
  jobId: string;
  onClose: () => void;
  feedback: FeedbackState;
  onSubmit: (formData: FormData, jobId: string) => Promise<void>;
  isPending: boolean;
};

export default function UnscheduledLane({ jobs, onSchedule }: Props) {
  const router = useRouter();

  const [items, setItems] = useState<UnscheduledJob[]>(jobs);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  const [openLogJobId, setOpenLogJobId] = useState<string | null>(null);
  const [logFeedback, setLogFeedback] = useState<FeedbackState>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(jobs);
  }, [jobs]);

  const sortedItems = useMemo(() => items, [items]);

  function openLog(jobId: string) {
    setOpenLogJobId(jobId);
    setLogFeedback(null);
  }

  function closeLog() {
    setOpenLogJobId(null);
    setLogFeedback(null);
  }

  async function handleLogSubmit(formData: FormData, jobId: string) {
    setLogFeedback(null);

    try {
      await logCustomerContactAttemptFromForm(formData);
      setLogFeedback({ type: "success", message: "Call outcome logged." });
      setOpenLogJobId(null);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not log outcome.";
      setLogFeedback({ type: "error", message });
    }
  }

  function openSchedule(jobId: string) {
    setOpenJobId(jobId);
    setFeedback(null);
    setScheduledDate("");
    setWindowStart("");
    setWindowEnd("");
  }

  function closeSchedule() {
    setOpenJobId(null);
    setFeedback(null);
  }

  async function handleScheduleSubmit(event: React.FormEvent<HTMLFormElement>, jobId: string) {
    event.preventDefault();
    setFeedback(null);

    if (!scheduledDate || !windowStart || !windowEnd) {
      setFeedback({ type: "error", message: "Could not save changes." });
      return;
    }

    startTransition(async () => {
      try {
        const result = await onSchedule({
          jobId,
          scheduledDate,
          windowStart,
          windowEnd,
        });

        if (!result.ok) {
          setFeedback({
            type: "error",
            message: result.message || "Could not save changes.",
          });
          return;
        }

        setItems((prev) => prev.filter((j) => j.id !== jobId));
        setFeedback({ type: "success", message: "Schedule updated." });
        setOpenJobId(null);
        router.refresh();
      } catch {
        setFeedback({ type: "error", message: "Could not save changes." });
      }
    });
  }

  return (
    <aside className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Unscheduled Jobs</h2>
        <p className="text-xs text-gray-500">Call, schedule, and move on.</p>
      </div>

      {feedback ? (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "bg-green-50 text-green-800"
              : feedback.type === "error"
                ? "bg-red-50 text-red-800"
                : "bg-gray-50 text-gray-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="space-y-3">
        {sortedItems.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-sm text-gray-500">
            No unscheduled jobs.
          </div>
        ) : (
          sortedItems.map((job) => {
            const customerName =
              [job.customer_first_name, job.customer_last_name].filter(Boolean).join(" ") ||
              "Unnamed customer";

            const address = [job.job_address, job.city].filter(Boolean).join(", ");
            const label = job.title || job.job_type || "Job";

            return (
              <div key={job.id} className="rounded-lg border p-3">
                <div className="mb-2">
                  <div className="text-sm font-medium text-gray-900">{customerName}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                  {address ? <div className="mt-1 text-xs text-gray-600">{address}</div> : null}
                  {job.contractor_name ? (
                    <div className="mt-1 text-xs text-gray-500">
                      Contractor: {job.contractor_name}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {job.phone ? (
                    <a
                      href={`tel:${job.phone}`}
                      className="rounded-md border px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Call
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => openLog(job.id)}
                    className="rounded-md border px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Log Call Outcome
                  </button>

                  <button
                    type="button"
                    onClick={() => openSchedule(job.id)}
                    className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-black"
                  >
                    Schedule
                  </button>
                </div>

                {openLogJobId === job.id ? (
                  <LogCallOutcomeForm
                    jobId={job.id}
                    onClose={closeLog}
                    feedback={logFeedback}
                    onSubmit={handleLogSubmit}
                    isPending={isPending}
                  />
                ) : null}

                {openJobId === job.id ? (
                  <form
                    className="mt-3 space-y-2 border-t pt-3"
                    onSubmit={(e) => handleScheduleSubmit(e, job.id)}
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">Date</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Start
                        </label>
                        <input
                          type="time"
                          value={windowStart}
                          onChange={(e) => setWindowStart(e.target.value)}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          End
                        </label>
                        <input
                          type="time"
                          value={windowEnd}
                          onChange={(e) => setWindowEnd(e.target.value)}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <SubmitButton
                        className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white"
                        loadingText="Scheduling..."
                      >
                        Save Schedule
                      </SubmitButton>

                      <button
                        type="button"
                        onClick={closeSchedule}
                        disabled={isPending}
                        className="rounded-md border px-3 py-2 text-xs font-medium text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function LogCallOutcomeForm({
  jobId,
  onClose,
  feedback,
  onSubmit,
  isPending,
}: LogCallOutcomeFormProps) {
  return (
    <form
      className="mt-3 space-y-2 border-t pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        await onSubmit(formData, jobId);
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Method</label>
          <select
            name="method"
            className="w-full rounded-md border px-3 py-2 text-sm"
            required
            defaultValue="call"
          >
            <option value="call">Call</option>
            <option value="text">Text</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Result</label>
          <select
            name="result"
            className="w-full rounded-md border px-3 py-2 text-sm"
            required
            defaultValue="no_answer"
          >
            <option value="no_answer">No Answer</option>
            <option value="spoke">Spoke</option>
            <option value="sent">Sent</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton
          className="rounded-md bg-blue-700 px-3 py-2 text-xs font-medium text-white"
          loadingText="Logging..."
          disabled={isPending}
        >
          Log Outcome
        </SubmitButton>

        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-md border px-3 py-2 text-xs font-medium text-gray-700"
        >
          Cancel
        </button>
      </div>

      {feedback ? (
        <div
          className={`mt-2 rounded-md px-3 py-2 text-xs ${
            feedback.type === "success"
              ? "bg-green-50 text-green-800"
              : feedback.type === "error"
                ? "bg-red-50 text-red-800"
                : "bg-gray-50 text-gray-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}
    </form>
  );
}