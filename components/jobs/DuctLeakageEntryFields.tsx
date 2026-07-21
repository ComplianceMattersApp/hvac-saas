"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type DuctExceptionOption = {
  value: string;
  label: string;
};

type Props = {
  children: ReactNode;
  exceptionOptions: DuctExceptionOption[];
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
  totalLeakagePercent: number | null;
  maxLeakageCfm: number | null;
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

function formatNumber(value: number | null, decimals = 1) {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

function defaultLeakagePercent(projectType?: string | null) {
  const normalized = String(projectType ?? "").trim().toLowerCase();
  if (
    normalized === "all_new" ||
    normalized === "allnew" ||
    normalized === "new" ||
    normalized === "new_construction" ||
    normalized === "new_prescriptive"
  ) {
    return 0.05;
  }
  if (normalized === "alteration") return 0.1;
  return null;
}

function leakagePercentFromForm(formData: FormData, projectType?: string | null) {
  const target = toNumber(formData.get("leakage_percent_target"));
  if (target != null && target > 0 && target <= 100) return target / 100;
  return defaultLeakagePercent(projectType);
}

function computePreview(formData: FormData, projectType?: string | null, exceptionLabel?: string | null): Preview {
  const measured = toNumber(formData.get("measured_duct_leakage_cfm"));
  const tonnage = toNumber(formData.get("tonnage"));
  const heatingOutputBtu = toNumber(formData.get("heating_output_btu"));
  const heatingInputBtu = toNumber(formData.get("heating_input_btu"));
  const heatingEfficiencyPercent = toNumber(formData.get("heating_efficiency_percent"));
  const method = String(formData.get("airflow_method") ?? "").trim().toLowerCase() === "heating" ? "heating" : "cooling";
  const allowedPercent = leakagePercentFromForm(formData, projectType);

  const derivedHeatingOutputBtu =
    heatingOutputBtu != null
      ? heatingOutputBtu
      : heatingInputBtu != null &&
        heatingEfficiencyPercent != null &&
        heatingEfficiencyPercent > 0 &&
        heatingEfficiencyPercent <= 100
      ? heatingInputBtu * (heatingEfficiencyPercent / 100)
      : null;

  const heatingOutputKbtu = method === "heating" && derivedHeatingOutputBtu != null ? derivedHeatingOutputBtu / 1000 : null;
  const nominalAirflowCfm =
    method === "heating"
      ? heatingOutputKbtu != null
        ? heatingOutputKbtu * 21.7
        : null
      : tonnage != null
      ? tonnage * 400
      : null;

  const maxLeakageCfm = nominalAirflowCfm != null && allowedPercent != null ? nominalAirflowCfm * allowedPercent : null;
  const totalLeakagePercent =
    measured != null && nominalAirflowCfm != null && nominalAirflowCfm > 0 ? (measured / nominalAirflowCfm) * 100 : null;

  if (exceptionLabel && measured == null) {
    return {
      totalLeakagePercent,
      maxLeakageCfm,
      statusText: `${exceptionLabel} exception recorded`,
      tone: "exception",
    };
  }

  if (measured != null && maxLeakageCfm != null) {
    const passes = measured <= maxLeakageCfm;
    return {
      totalLeakagePercent,
      maxLeakageCfm,
      statusText: `${passes ? "Pass" : "Fail"} - measured ${formatNumber(measured, 0)} / max ${formatNumber(maxLeakageCfm, 1)} CFM`,
      tone: passes ? "pass" : "fail",
    };
  }

  return {
    totalLeakagePercent,
    maxLeakageCfm,
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

export default function DuctLeakageEntryFields({
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
    totalLeakagePercent: null,
    maxLeakageCfm: null,
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
  const asbestosExempt = selectedException?.value === "asbestos";
  const statusLabel =
    exceptionActive
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
          <p className="mt-1 text-sm text-slate-600">Use only when duct leakage testing is exempt or cannot be performed.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor={`dl-exception-${runId}`}>
              Exception type
            </label>
            <select
              id={`dl-exception-${runId}`}
              name="duct_exception"
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
              <label className="text-sm font-medium" htmlFor={`ovr-reason-${runId}`}>
                Exception reason
              </label>
              <input
                id={`ovr-reason-${runId}`}
                name="override_reason"
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

        {asbestosExempt ? (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 sm:col-span-2 sm:p-4">
            <div className="font-semibold">Duct leakage test exempt</div>
            <p className="mt-1">
              Asbestos prevents duct leakage testing under Title 24. Record the exception reason and complete the test without entering results.
            </p>
          </section>
        ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.2)] sm:col-span-2 sm:p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Results</div>
              <p className="mt-1 text-sm text-slate-600">
                Enter the measured duct leakage result when available. Exception details remain recorded for this test.
              </p>
            </div>
            {statusLabel ? (
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses(preview.tone)}`}>
                {statusLabel}
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.7fr)] sm:items-start sm:gap-3">
            <div className="grid gap-2">
              <label className="flex items-center justify-between gap-2 text-sm font-medium" htmlFor={`dl-meas-${runId}`}>
                <span>Measured Duct Leakage</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  CFM
                </span>
              </label>
              <input
                id={`dl-meas-${runId}`}
                name="measured_duct_leakage_cfm"
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
                <span className="font-medium text-slate-600">Total Leakage %</span>
                <span className="font-semibold text-slate-950">{formatNumber(preview.totalLeakagePercent, 1)}%</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-600">Max Allowed</span>
                <span className="font-semibold text-slate-950">{formatNumber(preview.maxLeakageCfm, 1)} CFM</span>
              </div>
              {preview.statusText ? (
                <div className={`rounded-xl border px-3 py-2 text-sm font-semibold sm:rounded-md sm:px-2.5 sm:text-xs ${toneClasses(preview.tone)}`}>
                  {preview.statusText}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-1">
            <label className="text-sm font-medium" htmlFor={`dl-notes-${runId}`}>
              Notes (optional)
            </label>
            <input
              id={`dl-notes-${runId}`}
              name="notes"
              className="w-full rounded-md border px-3 py-2"
              defaultValue={initialNotes ?? ""}
            />
          </div>
        </section>
        )}
      </div>
    </>
  );
}
