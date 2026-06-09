"use client";

import { useState, type ReactNode } from "react";

type Props = {
  children?: ReactNode;
  initialExceptionReason?: string | null;
  initialExceptionValue?: string | null;
  runId: string;
};

const exceptionOptions = [
  { value: "package_unit", label: "Package unit" },
  { value: "conditions_not_met", label: "Conditions not met / weather" },
  { value: "photo_taken", label: "Photo Taken" },
];

export default function RefrigerantChargeExceptionFields({
  children,
  initialExceptionReason,
  initialExceptionValue,
  runId,
}: Props) {
  const [exceptionValue, setExceptionValue] = useState(initialExceptionValue ?? "");

  const reasonRequired = exceptionValue === "package_unit" || exceptionValue === "conditions_not_met";
  const showEvidence = exceptionValue === "photo_taken";

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.2)] sm:p-4">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">Exception</div>
        <p className="mt-1 text-sm text-slate-600">Use only when charge verification cannot be completed normally.</p>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`rc-exception-${runId}`}>
            Exception type
          </label>
          <select
            id={`rc-exception-${runId}`}
            name="rc_exception"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 sm:rounded-md sm:py-2"
            value={exceptionValue}
            onChange={(event) => setExceptionValue(event.target.value)}
          >
            <option value="">No exception</option>
            {exceptionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {exceptionValue === "package_unit" ? <input type="hidden" name="rc_exempt_package_unit" value="on" /> : null}
        {exceptionValue === "conditions_not_met" ? <input type="hidden" name="rc_exempt_conditions" value="on" /> : null}
        {showEvidence ? <input type="hidden" name="rc_photo_taken" value="on" /> : null}

        {reasonRequired ? (
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor={`rc-exception-reason-${runId}`}>
              Exception reason
            </label>
            <input
              id={`rc-exception-reason-${runId}`}
              name="rc_override_details"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 sm:rounded-md sm:py-2"
              defaultValue={initialExceptionReason ?? ""}
              placeholder="Required when an exception is selected"
              autoComplete="off"
              required
            />
          </div>
        ) : null}

        {showEvidence ? children : null}
      </div>
    </section>
  );
}
