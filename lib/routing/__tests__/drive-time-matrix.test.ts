import { describe, expect, it } from "vitest";

import {
  createDriveTimeMatrix,
  driveTimePointKey,
  lookupDriveMinutes,
  matrixHasCoverage,
} from "../drive-time-matrix";
import { estimateDriveMinutes, estimateStraightLineDriveMinutes } from "../geometry";

const STOCKTON = { latitude: 37.9577, longitude: -121.2908 };
const LODI = { latitude: 38.1302, longitude: -121.2724 };
const MANTECA = { latitude: 37.7974, longitude: -121.216 };

describe("drive time matrix", () => {
  it("looks up a stored leg", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: 22 },
    ]);
    expect(lookupDriveMinutes(matrix, STOCKTON, LODI)).toBe(22);
  });

  it("is directional — a road network is not symmetric", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: 22 },
    ]);
    expect(lookupDriveMinutes(matrix, LODI, STOCKTON)).toBeNull();
  });

  it("returns null for an uncovered leg rather than zero", () => {
    // Zero would silently claim two stops are adjacent. Null means "estimate it".
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: 22 },
    ]);
    expect(lookupDriveMinutes(matrix, STOCKTON, MANTECA)).toBeNull();
  });

  it("tolerates float drift by quantizing the key", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: 22 },
    ]);
    // Same point after a database round-trip, differing far below 1.1m.
    const driftedStockton = { latitude: 37.957700000001, longitude: -121.290799999998 };
    expect(lookupDriveMinutes(matrix, driftedStockton, LODI)).toBe(22);
  });

  it("ignores negative and non-finite durations", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: -5 },
      { origin: LODI, destination: MANTECA, minutes: Number.NaN },
    ]);
    expect(matrixHasCoverage(matrix)).toBe(false);
  });

  it("keys points independent of object identity", () => {
    expect(driveTimePointKey(STOCKTON)).toBe(driveTimePointKey({ ...STOCKTON }));
  });
});

describe("estimateDriveMinutes with a matrix", () => {
  it("prefers live drive time and adds the arrival buffer", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: 22 },
    ]);
    // Routes returns road time; parking and walking up is still real time.
    expect(estimateDriveMinutes(STOCKTON, LODI, matrix)).toBe(25);
  });

  it("falls back to the straight-line estimate for an uncovered leg", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: LODI, minutes: 22 },
    ]);
    expect(estimateDriveMinutes(STOCKTON, MANTECA, matrix)).toBe(
      estimateStraightLineDriveMinutes(STOCKTON, MANTECA),
    );
  });

  it("behaves exactly as before when no matrix is supplied", () => {
    // The whole lane shipped on estimates; adding live times must not change
    // planning for anyone without routing configured.
    expect(estimateDriveMinutes(STOCKTON, LODI)).toBe(
      estimateStraightLineDriveMinutes(STOCKTON, LODI),
    );
    expect(estimateDriveMinutes(STOCKTON, LODI, null)).toBe(
      estimateStraightLineDriveMinutes(STOCKTON, LODI),
    );
  });

  it("keeps a zero-length live leg at zero rather than adding a buffer", () => {
    const matrix = createDriveTimeMatrix([
      { origin: STOCKTON, destination: STOCKTON, minutes: 0 },
    ]);
    expect(estimateDriveMinutes(STOCKTON, STOCKTON, matrix)).toBe(0);
  });
});
