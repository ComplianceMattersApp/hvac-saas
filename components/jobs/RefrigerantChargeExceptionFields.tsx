"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  children?: ReactNode;
  initialExceptionReason?: string | null;
  initialExceptionValue?: string | null;
  initialPhotoResult?: string | null;
  runId: string;
};

const exceptionOptions = [
  { value: "package_unit", label: "Package unit" },
  { value: "conditions_not_met", label: "Conditions not met / weather" },
];

export default function RefrigerantChargeExceptionFields({
  children,
  initialExceptionReason,
  initialExceptionValue,
  initialPhotoResult,
  runId,
}: Props) {
  const initialMethod = initialExceptionValue === "photo_taken"
    ? "photo_taken"
    : initialExceptionValue
      ? "exception"
      : "";
  const [documentationMethod, setDocumentationMethod] = useState(initialMethod);
  const [exceptionValue, setExceptionValue] = useState(
    initialMethod === "exception" ? initialExceptionValue ?? "" : "",
  );

  const reasonRequired =
    documentationMethod === "exception" &&
    (exceptionValue === "package_unit" || exceptionValue === "conditions_not_met");
  const showEvidence = documentationMethod === "photo_taken";
  const showNumericFields = documentationMethod === "";

  useEffect(() => {
    const numericSection = document.getElementById(`rc-numeric-section-${runId}`);
    if (!numericSection) return;
    numericSection.hidden = !showNumericFields;
    numericSection.setAttribute("aria-hidden", showNumericFields ? "false" : "true");
  }, [runId, showNumericFields]);

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.2)] sm:p-4">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">Documentation Method</div>
        <p className="mt-1 text-sm text-slate-600">Choose how this refrigerant charge record will be documented.</p>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`rc-documentation-method-${runId}`}>
            Method
          </label>
          <select
            id={`rc-documentation-method-${runId}`}
            name="rc_documentation_method"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 sm:rounded-md sm:py-2"
            value={documentationMethod}
            onChange={(event) => {
              const nextMethod = event.target.value;
              setDocumentationMethod(nextMethod);
              if (nextMethod !== "exception") setExceptionValue("");
            }}
          >
            <option value="">Enter readings</option>
            <option value="photo_taken">Photo evidence</option>
            <option value="exception">Exception / Not applicable</option>
          </select>
        </div>

        {documentationMethod === "exception" ? (
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
              required
            >
              <option value="">Select exception</option>
              {exceptionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {documentationMethod === "exception" && exceptionValue === "package_unit" ? (
          <input type="hidden" name="rc_exempt_package_unit" value="on" />
        ) : null}
        {documentationMethod === "exception" && exceptionValue === "conditions_not_met" ? (
          <input type="hidden" name="rc_exempt_conditions" value="on" />
        ) : null}
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

        {showEvidence ? (
          <>
            <div className="grid gap-2 rounded-xl border border-blue-100 bg-white/85 px-3 py-3">
              <div className="text-sm font-semibold text-slate-900">Photo evidence result</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { value: "pass", label: "Pass" },
                  { value: "fail", label: "Fail" },
                  { value: "needs_review", label: "Needs Review" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                  >
                    <input
                      type="radio"
                      name="rc_photo_result"
                      value={option.value}
                      defaultChecked={initialPhotoResult === option.value}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {children}
          </>
        ) : null}
      </div>
    </section>
  );
}
