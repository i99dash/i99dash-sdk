import { describe, expect, it } from 'vitest';
import { VehicleDiagnosticsSnapshotSchema } from '../vehicle-diagnostics.js';

const valid = {
  tirePressure: { frontLeft: 230, frontRight: 230, rearLeft: 225, rearRight: 225 },
  gearPosition: 'D' as const,
  odometerKm: 42_000,
  at: '2026-04-28T08:00:00.000Z',
};

describe('VehicleDiagnosticsSnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => VehicleDiagnosticsSnapshotSchema.parse(valid)).not.toThrow();
  });
  it('accepts null pressures (missing-wheel sensor case)', () => {
    expect(() =>
      VehicleDiagnosticsSnapshotSchema.parse({
        ...valid,
        tirePressure: { frontLeft: null, frontRight: null, rearLeft: null, rearRight: null },
      }),
    ).not.toThrow();
  });
  it('rejects negative odometer', () => {
    expect(() => VehicleDiagnosticsSnapshotSchema.parse({ ...valid, odometerKm: -1 })).toThrow();
  });
  it('rejects extra top-level fields', () => {
    expect(() => VehicleDiagnosticsSnapshotSchema.parse({ ...valid, vin: 'X' })).toThrow();
  });
});
