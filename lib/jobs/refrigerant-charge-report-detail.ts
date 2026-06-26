function normalizedReportValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hasMeaningfulDisplayValue(value: unknown) {
  const normalized = normalizedReportValue(value);
  return Boolean(
      normalized &&
      normalized !== "-" &&
      normalized !== "\u2014" &&
      normalized !== "unknown" &&
      normalized !== "insufficient data for compliance determination" &&
      normalized !== "insufficient data for ecc superheat requirement",
  );
}

function includesMessage(values: unknown, needle: string) {
  if (!Array.isArray(values)) return false;
  return values.some((value) => normalizedReportValue(value).includes(needle.toLowerCase()));
}

export function hasMeaningfulRefrigerantChargeDetail(run: any) {
  if (!run) return false;

  const data = run?.data ?? {};
  const computed = run?.computed ?? {};

  if (
    hasMeaningfulDisplayValue(data.charge_exempt_reason) ||
    data.charge_exempt === true ||
    includesMessage(computed?.blocked, "indoor temp below") ||
    includesMessage(computed?.blocked, "outdoor temp below") ||
    includesMessage(computed?.failures, "subcool") ||
    includesMessage(computed?.failures, "superheat")
  ) {
    return true;
  }

  return [
    data.lowest_return_air_db_f,
    data.condenser_air_entering_db_f,
    data.outdoor_temp_f,
    data.liquid_line_temp_f,
    data.liquid_line_pressure_psig,
    data.condenser_sat_temp_f,
    data.target_subcool_f,
    data.suction_line_temp_f,
    data.suction_line_pressure_psig,
    data.evaporator_sat_temp_f,
    computed.measured_subcool_f,
    computed.measured_superheat_f,
  ].some(hasMeaningfulDisplayValue);
}
