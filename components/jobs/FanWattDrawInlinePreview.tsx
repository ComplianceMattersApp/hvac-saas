"use client";

import { useEffect, useState } from "react";
import { computeFanWattDrawResult, formatFanEfficacy } from "@/lib/ecc/fan-watt-draw";

type Tone = "pass" | "fail" | "pending";

type PreviewState = {
  actualWatts: number | null;
  actualAirflow: number | null;
  requiredEfficacy: number | null;
  actualEfficacy: number | null;
  complianceStatement: string;
  tone: Tone;
};

type Props = {
  formId: string;
};

function readNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWholeNumber(value: number | null, unit: string) {
  if (value == null) return "-";
  return `${Number.isInteger(value) ? value : value.toFixed(0)} ${unit}`;
}

function chipClass(tone: Tone) {
  if (tone === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "fail") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function getPreviewState(form: HTMLFormElement): PreviewState {
  const formData = new FormData(form);
  const actualWatts = readNumber(formData, "actual_tested_watts");
  const actualAirflow = readNumber(formData, "actual_tested_airflow_cfm");
  const requiredEfficacy = readNumber(formData, "required_fan_efficacy_w_per_cfm");
  const result = computeFanWattDrawResult({
    actualTestedWatts: actualWatts,
    actualTestedAirflowCfm: actualAirflow,
    requiredFanEfficacyWPerCfm: requiredEfficacy,
    registersFullyOpenAttested: formData.get("registers_fully_open_attested") === "on",
    fanMaxSpeedAttested: formData.get("fan_max_speed_attested") === "on",
    photoTakenAttested: formData.get("photo_taken_attested") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  const actualEfficacy = result.actual_fan_efficacy_w_per_cfm;
  const savedRequiredEfficacy = result.required_fan_efficacy_w_per_cfm;
  const tone: Tone =
    actualEfficacy == null || savedRequiredEfficacy == null
      ? "pending"
      : actualEfficacy <= savedRequiredEfficacy
        ? "pass"
        : "fail";

  return {
    actualWatts,
    actualAirflow,
    requiredEfficacy: savedRequiredEfficacy,
    actualEfficacy,
    complianceStatement: result.compliance_statement,
    tone,
  };
}

export default function FanWattDrawInlinePreview({ formId }: Props) {
  const [preview, setPreview] = useState<PreviewState>({
    actualWatts: null,
    actualAirflow: null,
    requiredEfficacy: null,
    actualEfficacy: null,
    complianceStatement: "Insufficient data for fan efficacy determination",
    tone: "pending",
  });

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const update = () => setPreview(getPreviewState(form));
    update();

    form.addEventListener("input", update);
    form.addEventListener("change", update);

    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [formId]);

  const statusLabel =
    preview.tone === "pending"
      ? "-"
      : preview.tone === "pass"
        ? "Fan efficacy PASS"
        : "Fan efficacy FAIL";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-slate-600">Actual Fan Efficacy</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {formatWholeNumber(preview.actualWatts, "W")} / {formatWholeNumber(preview.actualAirflow, "CFM")} - Required {formatFanEfficacy(preview.requiredEfficacy)} W/CFM
          </div>
          <div className="mt-1 text-xs text-slate-600">{preview.complianceStatement}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-950">
            {formatFanEfficacy(preview.actualEfficacy)} W/CFM
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${chipClass(preview.tone)}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
