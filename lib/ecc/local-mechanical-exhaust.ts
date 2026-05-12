function readText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function readNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildLocalMechanicalExhaustPayload(formData: FormData) {
  const buildingType = readText(formData, "building_type");
  const totalKitchenFloorArea = readNumber(formData, "total_kitchen_floor_area");
  const kitchenAverageCeilingHeight = readNumber(formData, "kitchen_average_ceiling_height");
  const kitchenType = readText(formData, "kitchen_type");
  const systemName = readText(formData, "system_name");
  const manufacturerName = readText(formData, "manufacturer_name");
  const systemType = readText(formData, "system_type");
  const hviAhamModelNumber = readText(formData, "hvi_aham_model_number");
  const hviAhamRatedAirflowCfm = readNumber(formData, "hvi_aham_rated_airflow_cfm");
  const hviAhamSoundRating = readText(formData, "hvi_aham_sound_rating");
  const minimumAirflowCfm = readNumber(formData, "minimum_airflow_cfm");
  const operationSchedule = readText(formData, "operation_schedule");
  const notes = readText(formData, "notes");

  const failures: string[] = [];
  let airflowComplianceStatement: string | null = null;

  if (hviAhamRatedAirflowCfm != null && minimumAirflowCfm != null) {
    if (hviAhamRatedAirflowCfm >= minimumAirflowCfm) {
      airflowComplianceStatement = "Rated airflow meets or exceeds minimum airflow.";
    } else {
      airflowComplianceStatement = "Rated airflow is below the documented minimum airflow.";
      failures.push("rated_airflow_below_minimum");
    }
  }

  return {
    data: {
      building_type: buildingType,
      total_kitchen_floor_area: totalKitchenFloorArea,
      kitchen_average_ceiling_height: kitchenAverageCeilingHeight,
      kitchen_type: kitchenType,
      system_name: systemName,
      manufacturer_name: manufacturerName,
      system_type: systemType,
      hvi_aham_model_number: hviAhamModelNumber,
      hvi_aham_rated_airflow_cfm: hviAhamRatedAirflowCfm,
      hvi_aham_sound_rating: hviAhamSoundRating,
      minimum_airflow_cfm: minimumAirflowCfm,
      operation_schedule: operationSchedule,
      notes,
    },
    computed: {
      airflow_compliance_statement: airflowComplianceStatement,
      failures,
    },
    computedPass: null,
  };
}

export function ensureLocalMechanicalExhaustCompletionFields(formData: FormData) {
  const systemName = readText(formData, "system_name");
  const manufacturerName = readText(formData, "manufacturer_name");
  const systemType = readText(formData, "system_type");
  const hviAhamModelNumber = readText(formData, "hvi_aham_model_number");
  const hviAhamRatedAirflowCfm = readNumber(formData, "hvi_aham_rated_airflow_cfm");
  const minimumAirflowCfm = readNumber(formData, "minimum_airflow_cfm");

  if (!systemName) {
    throw new Error("Enter system name or location before completing this test.");
  }
  if (!manufacturerName) {
    throw new Error("Enter manufacturer name before completing this test.");
  }
  if (!systemType) {
    throw new Error("Enter system type before completing this test.");
  }
  if (!hviAhamModelNumber) {
    throw new Error("Enter HVI/AHAM listed model number before completing this test.");
  }
  if (hviAhamRatedAirflowCfm == null) {
    throw new Error("Enter HVI/AHAM rated airflow before completing this test.");
  }
  if (minimumAirflowCfm == null) {
    throw new Error("Enter minimum airflow before completing this test.");
  }
}
