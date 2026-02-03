"use client";

import { useState } from "react";
import { createJobFromForm } from "@/lib/actions";

export default function NewJobPage() {
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  function onQuickWindowChange(value: string) {
    if (!value) return;
    const [start, end] = value.split("-");
    if (start) setWindowStart(start);
    if (end) setWindowEnd(end);
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">New Job</h1>

      <form action={createJobFromForm} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Job Title</label>
          <input
            type="text"
            name="title"
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {/* Window Section */}
        <div className="rounded-lg border p-3 space-y-3">
          {/* Quick Window */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Quick Window (optional)
            </label>
            <select
              name="quick_window"
              defaultValue=""
              onChange={(e) => onQuickWindowChange(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select a window…</option>
              <option value="08:00-10:00">8:00 AM – 10:00 AM</option>
              <option value="10:00-12:00">10:00 AM – 12:00 PM</option>
              <option value="12:00-14:00">12:00 PM – 2:00 PM</option>
              <option value="14:00-16:00">2:00 PM – 4:00 PM</option>
              <option value="16:00-18:00">4:00 PM – 6:00 PM</option>
            </select>
            <p className="text-xs text-gray-300 mt-1">
              Selecting a window auto-fills the times. You can still edit them.
            </p>
          </div>

          {/* Window Start */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Window Start (optional)
            </label>
            <input
              type="time"
              name="window_start"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          {/* Window End */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Window End (optional)
            </label>
            <input
              type="time"
              name="window_end"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input
              type="text"
              name="city"
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Scheduled Date
            </label>
            <input
              type="date"
              name="scheduled_date"
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Customer Phone (optional)</label>
          <input
            type="tel"
            name="customer_phone"
            className="w-full border rounded px-3 py-2"
            placeholder="e.g. 209-555-1234"
          />
        </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Customer First Name (optional)
            </label>
            <input
              type="text"
              name="customer_first_name"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Customer Last Name (optional)
            </label>
            <input
              type="text"
              name="customer_last_name"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Customer Email (optional)
          </label>
          <input
            type="email"
            name="customer_email"
            className="w-full border rounded px-3 py-2"
            placeholder="e.g. customer@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Job Notes (optional)
          </label>
          <textarea
            name="job_notes"
            rows={4}
            className="w-full border rounded px-3 py-2"
            placeholder="Any notes for this job…"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">
            Permit Number
          </label>
          <input
            type="text"
            name="permit_number"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {/* Workflow-first: status is always Open at creation */}
        <input type="hidden" name="status" value="open" />

        <div className="pt-4">
          <button
            type="submit"
            className="px-4 py-2 rounded bg-blue-600 text-white"
          >
            Create Job
          </button>
        </div>
      </form>
    </div>
  );
}