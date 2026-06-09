"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type AirflowExceptionOption = {
  value: string;
  label: string;
};

type Props = {
  children: ReactNode;
  exceptionOptions: AirflowExceptionOption[];
  formId: string;
  initialExceptionReason: string;
  initialExceptionValue: string;
  initialMeasuredCfm: number | string | null;
  initialNotes: string | null;
  initialResultText: string;
  initialStatusLabel: string;
  projectType?: string | null;
  runId: string;
};

type Preview = {
  requiredTotalCfm: number | null;
  measuredTotalCfm: number | null;
  statusText: string;
  tone: "pass" | "fail" | "exception" | "pending";
};

function toNumber(value: FormDataEntryValue | string | number | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number | null, decimals = 0) {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

function defaultCfmPerTon(projectType?: string | null) {
  return String(projectType ?? "").trim().toLowerCase() === "all_new" ? 350 : 300;
}

function cfmPerTonFromForm(formData: FormData, projectType?: string | null) {
  const target = toNumber(formData.get("cfm_per_ton_target"));
  return target != null && target > 0 ? target : defaultCfmPerTon(projectType);
}

function computePreview(formData: FormData, projectType?: string | null, exceptionLabel?: string | null): Preview {
  const measuredTotalCfm = toNumber(formData.get("measured_total_cfm"));
  const tonnage = toNumber(formData.get("tonnage"));
  const cfmPerTon = cfmPerTonFromForm(formData, projectType);
  const requiredTotalCfm = tonnage != null ? tonnage * cfmPerTon : null;

  if (exceptionLabel && measuredTotalCfm == null) {
    return {
      requiredTotalCfm,
      measuredTotalCfm,
      statusText: `${exceptionLabel} exception recorded`,
      tone: "exception",
    };
  }

  if (measuredTotalCfm != null && requiredTotalCfm != null) {
    const passes = measuredTotalCfm >= requiredTotalCfm;
    return {
      requiredTotalCfm,
      measuredTotalCfm,
      statusText: `${passes ? "Pass" : "Fail"} - measured ${formatNumber(measuredTotalCfm)} / required ${formatNumber(requiredTotalCfm)} CFM`,
      tone: passes ? "pass" : "fail",
    };
  }

  return {
    requiredTotalCfm,
    measuredTotalCfm,
    statusText: "",
    tone: "pending",
  };
}

function toneClasses(tone: Preview["tone"]) {
  if (tone === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "fail") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "exception") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function AirflowEntryFields({
  children,
  exceptionOptions,
  formId,
  initialExceptionReason,
  initialExceptionValue,
  initialMeasuredCfm,
  initialNotes,
  initialResultText,
  initialStatusLabel,
  projectType,
  runId,
}: Props) {
  const [exceptionValue, setExceptionValue] = useState(initialExceptionValue);
  const [exceptionReason, setExceptionReason] = useState(initialExceptionReason);
  const [measuredInput, setMeasuredInput] = useState(initialMeasuredCfm == null ? "" : String(initialMeasuredCfm));
  const [previewVersion, setPreviewVersion] = useState(0);
  const selectedException = useMemo(
    () => exceptionOptions.find((option) => option.value === exceptionValue) ?? null,
    [exceptionOptions, exceptionValue],
  );
  const [preview, setPreview] = useState<Preview>({
    requiredTotalCfm: null,
    measuredTotalCfm: null,
    statusText: initialResultText,
    tone: initialExceptionValue ? "exception" : "pending",
  });

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const scheduleUpdate = () => {
      window.requestAnimationFrame(() => setPreviewVersion((version) => version + 1));
    };

    form.addEventListener("input", scheduleUpdate);
    form.addEventListener("change", scheduleUpdate);
    scheduleUpdate();

    return () => {
      form.removeEventListener("input", scheduleUpdate);
      form.removeEventListener("change", scheduleUpdate);
    };
  }, [formId]);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    setPreview(computePreview(new FormData(form), projectType, selectedException?.label ?? null));
  }, [formId, projectType, selectedException?.label, measuredInput, previewVersion]);

  const exceptionActive = Boolean(selectedException);
  const statusLabel =
    exceptionActive && !measuredInput.trim()
      ? "Exception"
      : preview.tone === "pass"
      ? "Pass"
      : preview.tone === "fail"
      ? "Fail"
      : initialStatusLabel;

  return (
    <>
      <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.2)] sm:col-span-2 sm:p-4">
        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">Exception</div>
          <p className="mt-1 text-sm text-slate-600">Use only when airflow testing is field-limited or cannot be completed normally.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor={`af-exception-${runId}`}>
              Exception type
            </label>
            <select
              id={`af-exception-${runId}`}
              name="airflow_exception"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 sm:rounded-md sm:py-2"
              value={exceptionValue}
              onChange={(event) => {
                setExceptionValue(event.target.value);
                if (!event.target.value) setExceptionReason("");
              }}
            >
              <option value="">No exception</option>
              {exceptionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {exceptionActive ? (
            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor={`af-exception-reason-${runId}`}>
                Exception reason
              </label>
              <input
                id={`af-exception-reason-${runId}`}
                name="airflow_exception_reason"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 sm:rounded-md sm:py-2"
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
                placeholder="Required when an exception is selected"
                autoComplete="off"
                required
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {children}

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.2)] sm:col-span-2 sm:p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Results</div>
              <p className="mt-1 text-sm text-slate-600">Enter measured total airflow when no exception applies.</p>
            </div>
            {statusLabel ? (
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses(preview.tone)}`}>
                {statusLabel}
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.7fr)] sm:items-start sm:gap-3">
            <div className="grid gap-2">
              <label className="flex items-center justify-between gap-2 text-sm font-medium" htmlFor={`af-meas-${runId}`}>
                <span>Measured Total Airflow</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  CFM
                </span>
              </label>
              <input
                id={`af-meas-${runId}`}
                name="measured_total_cfm"
                type="number"
                step="1"
                required={!exceptionActive}
                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-3xl font-semibold tracking-tight placeholder:text-slate-400 sm:rounded-md sm:py-2 sm:text-xl sm:font-semibold sm:tracking-tight"
                defaultValue={measuredInput}
                onInput={(event) => setMeasuredInput(event.currentTarget.value)}
                placeholder="Enter CFM"
              />
            </div>

            <div className="grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 sm:gap-2 sm:py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-600">Measured</span>
                <span className="font-semibold text-slate-950">{formatNumber(preview.measuredTotalCfm)} CFM</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-600">Required</span>
                <span className="font-semibold text-slate-950">{formatNumber(preview.requiredTotalCfm)} CFM</span>
              </div>
              {preview.statusText ? (
                <div className={`rounded-xl border px-3 py-2 text-sm font-semibold sm:rounded-md sm:px-2.5 sm:text-xs ${toneClasses(preview.tone)}`}>
                  {preview.statusText}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-1">
            <label className="text-sm font-medium" htmlFor={`af-notes-${runId}`}>
              Notes (optional)
            </label>
            <input
              id={`af-notes-${runId}`}
              name="notes"
              className="w-full rounded-md border px-3 py-2"
              defaultValue={initialNotes ?? ""}
            />
          </div>
        </section>
      </div>
    </>
  );
}
