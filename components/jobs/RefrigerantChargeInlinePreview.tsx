"use client";

import { useEffect, useState } from "react";

type PreviewKind = "subcool" | "superheat";
type Tone = "pass" | "fail" | "pending";

type PreviewState = {
  value: number | null;
  comparison: number | null;
  delta?: number | null;
  tone: Tone;
};

type Props = {
  formId: string;
  kind: PreviewKind;
};

const SUBCOOL_TOLERANCE_F = 3;
const SUPERHEAT_MAX_F = 25;

function readNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value: number | null) {
  if (value == null) return "-";
  return `${Number.isInteger(value) ? value : value.toFixed(1)} deg F`;
}

function chipClass(tone: Tone) {
  if (tone === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "fail") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function getPreviewState(form: HTMLFormElement, kind: PreviewKind): PreviewState {
  const formData = new FormData(form);

  if (kind === "subcool") {
    const condenserSat = readNumber(formData, "condenser_sat_temp_f");
    const liquidLineTemp = readNumber(formData, "liquid_line_temp_f");
    const targetSubcool = readNumber(formData, "target_subcool_f");
    const measured =
      condenserSat != null && liquidLineTemp != null ? condenserSat - liquidLineTemp : null;
    const delta = measured != null && targetSubcool != null ? measured - targetSubcool : null;
    const tone: Tone =
      measured == null || targetSubcool == null
        ? "pending"
        : Math.abs(measured - targetSubcool) <= SUBCOOL_TOLERANCE_F
          ? "pass"
          : "fail";

    return {
      value: measured,
      comparison: targetSubcool,
      delta,
      tone,
    };
  }

  const suctionTemp = readNumber(formData, "suction_line_temp_f");
  const evaporatorSat = readNumber(formData, "evaporator_sat_temp_f");
  const measured = suctionTemp != null && evaporatorSat != null ? suctionTemp - evaporatorSat : null;
  const tone: Tone = measured == null ? "pending" : measured < SUPERHEAT_MAX_F ? "pass" : "fail";

  return {
    value: measured,
    comparison: SUPERHEAT_MAX_F,
    tone,
  };
}

export default function RefrigerantChargeInlinePreview({ formId, kind }: Props) {
  const [preview, setPreview] = useState<PreviewState>({
    value: null,
    comparison: kind === "superheat" ? SUPERHEAT_MAX_F : null,
    delta: null,
    tone: "pending",
  });

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const update = () => setPreview(getPreviewState(form, kind));
    update();

    form.addEventListener("input", update);
    form.addEventListener("change", update);

    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [formId, kind]);

  const title = kind === "subcool" ? "Measured Subcool" : "Measured Superheat";
  const comparisonLabel =
    kind === "subcool"
      ? `Target ${formatValue(preview.comparison)}`
      : `Max allowed < ${formatValue(preview.comparison)}`;
  const statusLabel =
    preview.tone === "pending"
      ? "-"
      : kind === "subcool"
        ? preview.tone === "pass"
          ? "Subcool PASS"
          : "Subcool FAIL"
        : preview.tone === "pass"
          ? "Superheat PASS"
          : "Superheat FAIL";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-slate-600">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {comparisonLabel}
            {kind === "subcool" && preview.delta != null ? ` - Delta ${formatValue(preview.delta)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-950">{formatValue(preview.value)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${chipClass(preview.tone)}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
