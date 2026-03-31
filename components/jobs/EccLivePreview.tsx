"use client";

import { useEffect, useState, type ReactNode } from "react";

type PreviewMode = "duct_leakage" | "airflow" | "refrigerant_charge";

type Props = {
  mode: PreviewMode;
  formId: string;
  projectType?: string | null;
};

type Tone = "pass" | "fail" | "blocked" | "pending";

function toNumber(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNum(value: number | null, unit?: string) {
  if (value == null) return "-";
  const rendered = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${rendered} ${unit}` : rendered;
}

function statusClasses(tone: Tone) {
  if (tone === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "fail") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "blocked") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function normalizeProjectType(projectType?: string | null) {
  return String(projectType ?? "").trim().toLowerCase();
}

function leakPercentAllowed(projectType?: string | null) {
  const normalized = normalizeProjectType(projectType);
  if (
    normalized === "all_new" ||
    normalized === "allnew" ||
    normalized === "new" ||
    normalized === "new_construction" ||
    normalized === "new_prescriptive"
  ) {
    return 0.05;
  }
  if (normalized === "alteration") {
    return 0.1;
  }
  return null;
}

export default function EccLivePreview({ mode, formId, projectType }: Props) {
  const [content, setContent] = useState<ReactNode>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) {
      setContent(null);
      return;
    }

    const update = () => {
      const fd = new FormData(form);

      if (mode === "duct_leakage") {
        const tonnage = toNumber(fd.get("tonnage"));
        const measured = toNumber(fd.get("measured_duct_leakage_cfm"));
        const method = String(fd.get("airflow_method") ?? "").trim().toLowerCase() === "heating" ? "heating" : "cooling";
        const heatingOutputBtu = toNumber(fd.get("heating_output_btu"));
        const heatingInputBtu = toNumber(fd.get("heating_input_btu"));
        const heatingEfficiencyPercent = toNumber(fd.get("heating_efficiency_percent"));
        const percent = leakPercentAllowed(projectType);

        const derivedHeatingOutputBtu =
          heatingOutputBtu != null
            ? heatingOutputBtu
            : heatingInputBtu != null &&
              heatingEfficiencyPercent != null &&
              heatingEfficiencyPercent > 0 &&
              heatingEfficiencyPercent <= 100
            ? heatingInputBtu * (heatingEfficiencyPercent / 100)
            : null;

        const heatingOutputKbtu =
          method === "heating" && derivedHeatingOutputBtu != null
            ? derivedHeatingOutputBtu / 1000
            : null;

        const baseAirflow =
          method === "heating"
            ? heatingOutputKbtu != null
              ? heatingOutputKbtu * 21.7
              : null
            : tonnage != null
            ? tonnage * 400
            : null;

        const maxLeakage = baseAirflow != null && percent != null ? baseAirflow * percent : null;

        let tone: Tone = "pending";
        let label = "Pending inputs";

        if (measured != null && maxLeakage != null) {
          if (measured <= maxLeakage) {
            tone = "pass";
            label = "Preview PASS";
          } else {
            tone = "fail";
            label = "Preview FAIL";
          }
        }

        setContent(
          <div className="min-h-[96px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-900">Live Preview (unsaved)</div>
              <div className={`min-w-[120px] rounded-full border px-2 py-0.5 text-center text-xs font-medium ${statusClasses(tone)}`}>
                {label}
              </div>
            </div>
            <div>Method: {method === "heating" ? "Heat-only" : "Cooling"}</div>
            <div>Nominal Airflow: {formatNum(baseAirflow, "CFM")}</div>
            <div>
              Max Allowed: {formatNum(maxLeakage, "CFM")}
              {percent != null && baseAirflow != null ? ` (${(percent * 100).toFixed(0)}% of nominal airflow)` : ""}
            </div>
            <div>Measured: {formatNum(measured, "CFM")}</div>
          </div>
        );
        return;
      }

      if (mode === "airflow") {
        const tonnage = toNumber(fd.get("tonnage"));
        const measured = toNumber(fd.get("measured_total_cfm"));
        const cfmPerTon = normalizeProjectType(projectType) === "all_new" ? 350 : 300;
        const required = tonnage != null ? tonnage * cfmPerTon : null;
        const overridePass = String(fd.get("airflow_override_pass") ?? "").trim() === "true";

        let tone: Tone = "pending";
        let label = "Pending inputs";

        if (measured != null && required != null) {
          if (measured >= required) {
            tone = "pass";
            label = "Preview PASS";
          } else {
            tone = "fail";
            label = "Preview FAIL";
          }
        }

        setContent(
          <div className="min-h-[96px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-900">Live Preview (unsaved)</div>
              <div className={`min-w-[120px] rounded-full border px-2 py-0.5 text-center text-xs font-medium ${statusClasses(tone)}`}>
                {label}
              </div>
            </div>
            <div>Required Total Airflow: {formatNum(required, "CFM")}</div>
            <div>Measured Total Airflow: {formatNum(measured, "CFM")}</div>
            {overridePass ? (
              <div className="text-xs text-amber-700">Override pass is selected and will be applied only when saved.</div>
            ) : null}
          </div>
        );
        return;
      }

      const lowestReturn = toNumber(fd.get("lowest_return_air_db_f"));
      const outdoor = toNumber(fd.get("outdoor_temp_f"));
      const liquidTemp = toNumber(fd.get("liquid_line_temp_f"));
      const liquidPressure = toNumber(fd.get("liquid_line_pressure_psig"));
      const condenserSat = toNumber(fd.get("condenser_sat_temp_f"));
      const targetSubcool = toNumber(fd.get("target_subcool_f"));
      const suctionTemp = toNumber(fd.get("suction_line_temp_f"));
      const suctionPressure = toNumber(fd.get("suction_line_pressure_psig"));
      const evapSat = toNumber(fd.get("evaporator_sat_temp_f"));
      const filterDrierInstalled = fd.get("filter_drier_installed") === "on";
      const exemptPackageUnit = fd.get("rc_exempt_package_unit") === "on";
      const exemptConditions = fd.get("rc_exempt_conditions") === "on";
      const overrideDetails = String(fd.get("rc_override_details") ?? "").trim();

      const isChargeExempt = exemptPackageUnit || exemptConditions;
      const exemptionReason = exemptPackageUnit
        ? "Charge verification exempt: package unit"
        : exemptConditions
        ? "Charge verification override: conditions not met"
        : "";

      const measuredSubcool = condenserSat != null && liquidTemp != null ? condenserSat - liquidTemp : null;
      const measuredSuperheat = suctionTemp != null && evapSat != null ? suctionTemp - evapSat : null;
      const subcoolDelta =
        measuredSubcool != null && targetSubcool != null ? measuredSubcool - targetSubcool : null;

      const blocked: string[] = [];
      const failures: string[] = [];

      if (lowestReturn != null && lowestReturn < 70) blocked.push("Indoor temp below 70F");
      if (outdoor != null && outdoor < 55) blocked.push("Outdoor temp below 55F");
      if (!filterDrierInstalled) failures.push("Filter drier not confirmed");
      if (measuredSuperheat != null && measuredSuperheat >= 25) failures.push("Superheat >= 25F");
      if (
        measuredSubcool != null &&
        targetSubcool != null &&
        Math.abs(measuredSubcool - targetSubcool) > 2
      ) {
        failures.push("Subcool out of +/-2F tolerance");
      }

      const hasCoreCompute =
        measuredSubcool != null && measuredSuperheat != null && targetSubcool != null;

      let overallTone: Tone = "pending";
      let overallLabel = "Pending inputs";

      if (isChargeExempt) {
        overallTone = "pass";
        overallLabel = "Preview EXEMPT PASS";
      } else if (blocked.length > 0) {
        overallTone = "blocked";
        overallLabel = "Preview BLOCKED";
      } else if (failures.length > 0) {
        overallTone = "fail";
        overallLabel = "Preview FAIL";
      } else if (hasCoreCompute) {
        overallTone = "pass";
        overallLabel = "Preview PASS";
      }

      const subcoolTone: Tone =
        isChargeExempt
          ? "pass"
          : measuredSubcool == null || targetSubcool == null
          ? "pending"
          : Math.abs(measuredSubcool - targetSubcool) <= 2
          ? "pass"
          : "fail";
      const superheatTone: Tone =
        isChargeExempt
          ? "pass"
          : measuredSuperheat == null
          ? "pending"
          : measuredSuperheat < 25
          ? "pass"
          : "fail";

      setContent(
        <div className="min-h-[168px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-slate-900">Live Preview (unsaved)</div>
            <div className={`min-w-[120px] rounded-full border px-2 py-0.5 text-center text-xs font-medium ${statusClasses(overallTone)}`}>
              {overallLabel}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div>Measured Subcool: {formatNum(measuredSubcool, "F")}</div>
              <div>Target Subcool: {formatNum(targetSubcool, "F")}</div>
              <div>Subcool Delta: {formatNum(subcoolDelta, "F")}</div>
              <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(subcoolTone)}`}>
                {isChargeExempt
                  ? "Subcool bypassed (exempt)"
                  : subcoolTone === "pending"
                  ? "Subcool pending"
                  : subcoolTone === "pass"
                  ? "Subcool PASS"
                  : "Subcool FAIL"}
              </div>
            </div>
            <div>
              <div>Measured Superheat: {formatNum(measuredSuperheat, "F")}</div>
              <div>Liquid Line Pressure: {formatNum(liquidPressure, "psig")}</div>
              <div>Suction Line Pressure: {formatNum(suctionPressure, "psig")}</div>
              <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(superheatTone)}`}>
                {isChargeExempt
                  ? "Superheat bypassed (exempt)"
                  : superheatTone === "pending"
                  ? "Superheat pending"
                  : superheatTone === "pass"
                  ? "Superheat PASS"
                  : "Superheat FAIL"}
              </div>
            </div>
          </div>
          {isChargeExempt ? (
            <div className="mt-1 text-xs text-emerald-700">
              {exemptionReason}
              {overrideDetails ? ` (${overrideDetails})` : ""}
            </div>
          ) : null}
          {!isChargeExempt && blocked.length > 0 ? (
            <div className="mt-1 text-xs text-amber-700">{blocked.join("; ")}</div>
          ) : null}
        </div>
      );
    };

    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);

    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [formId, mode, projectType]);

  return content;
}
