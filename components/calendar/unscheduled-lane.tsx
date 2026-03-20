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

type FeedbackType = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export default function UnscheduledLane({ jobs, onSchedule }: Props) {
  const router = useRouter();

  const [items, setItems] = useState<UnscheduledJob[]>(jobs);
  useEffect(() => setItems(jobs), [jobs]);

  const sortedItems = useMemo(() => items, [items]);

  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [openLogJobId, setOpenLogJobId] = useState<string | null>(null);

  const [scheduledDate, setScheduledDate] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  const [feedback, setFeedback] = useState<FeedbackType>(null);
  const [logFeedback, setLogFeedback] = useState<FeedbackType>(null);

  const [isPending, startTransition] = useTransition();

  function openSchedule(jobId: string) {
    setOpenJobId(jobId);
  }

  function closeSchedule() {
    setOpenJobId(null);
  }

  function openLog(jobId: string) {
    setOpenLogJobId(jobId);
    setLogFeedback(null);
  }

  function closeLog() {
    setOpenLogJobId(null);
  }

  async function handleLogSubmit(formData: FormData, jobId: string) {
    try {
      await logCustomerContactAttemptFromForm(formData);
      setLogFeedback({ type: "success", message: "Call outcome logged." });
      router.refresh();
    } catch {
      setLogFeedback({ type: "error", message: "Could not log outcome." });
    }
  }

  async function handleScheduleSubmit(e: React.FormEvent, jobId: string) {
    e.preventDefault();

    startTransition(async () => {
      const result = await onSchedule({
        jobId,
        scheduledDate,
        windowStart,
        windowEnd,
      });

      if (result.ok) {
        setItems((prev) => prev.filter((j) => j.id !== jobId));
        setOpenJobId(null);
        router.refresh();
      } else {
        setFeedback({ type: "error", message: result.message || "Failed to schedule" });
      }
    });
  }

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-6 shadow-md">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Unscheduled Jobs</h2>
        <p className="text-sm text-gray-500">Call, schedule, and move on.</p>
      </div>

      {feedback && (
        <div className={`mb-4 rounded-md px-4 py-3 text-sm ${
          feedback.type === "success"
            ? "bg-green-50 text-green-800"
            : feedback.type === "error"
            ? "bg-red-50 text-red-800"
            : "bg-gray-50 text-gray-700"
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="space-y-4">
        {sortedItems.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed px-6 py-8 text-gray-400">
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
              <div key={job.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <div className="text-base font-bold text-gray-900">{customerName}</div>
                  <div className="text-xs text-gray-400">{label}</div>
                  {address && <div className="mt-1 text-xs text-gray-500">{address}</div>}
                  {job.contractor_name && (
                    <div className="mt-1 text-xs text-gray-400">
                      Contractor: {job.contractor_name}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  {job.phone && (
                    <a
                      href={`tel:${job.phone}`}
                      className="rounded-md border px-4 py-2 text-xs hover:bg-gray-100"
                    >
                      Call
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => openLog(job.id)}
                    className="rounded-md border border-blue-200 px-4 py-2 text-xs text-blue-700 hover:bg-blue-50"
                  >
                    Log Call
                  </button>

                  <button
                    type="button"
                    onClick={() => openSchedule(job.id)}
                    className="rounded-md bg-gray-900 px-4 py-2 text-xs text-white"
                  >
                    Schedule
                  </button>
                </div>

                {openLogJobId === job.id && (
                  <LogCallOutcomeForm
                    jobId={job.id}
                    onClose={closeLog}
                    feedback={logFeedback}
                    onSubmit={handleLogSubmit}
                    isPending={isPending}
                  />
                )}

                {openJobId === job.id && (
                  <form className="mt-4 space-y-3 border-t pt-4" onSubmit={(e) => handleScheduleSubmit(e, job.id)}>
                    <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="w-full border px-3 py-2 rounded-md" />

                    <div className="grid grid-cols-2 gap-3">
                      <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="border px-3 py-2 rounded-md" />
                      <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="border px-3 py-2 rounded-md" />
                    </div>

                    <div className="flex gap-3">
                      <SubmitButton className="bg-gray-900 text-white px-4 py-2 rounded-md">
                        Save
                      </SubmitButton>

                      <button type="button" onClick={closeSchedule} className="border px-4 py-2 rounded-md">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function LogCallOutcomeForm({ jobId, onClose, feedback, onSubmit, isPending }: any) {
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
        <select name="method" className="border px-2 py-1 rounded" defaultValue="call">
          <option value="call">Call</option>
          <option value="text">Text</option>
        </select>

        <select name="result" className="border px-2 py-1 rounded" defaultValue="no_answer">
          <option value="no_answer">No Answer</option>
          <option value="spoke">Spoke</option>
          <option value="sent">Sent</option>
        </select>
      </div>

      <div className="flex gap-2">
        <SubmitButton className="bg-blue-700 text-white px-3 py-2 rounded-md">
          Log
        </SubmitButton>

        <button type="button" onClick={onClose} className="border px-3 py-2 rounded-md">
          Cancel
        </button>
      </div>

      {feedback && (
        <div className="text-xs mt-2">{feedback.message}</div>
      )}
    </form>
  );
}
