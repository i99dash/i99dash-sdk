import { describe, expect, it } from 'vitest';
import { VehicleEnvironmentSnapshotSchema } from '../vehicle-environment.js';

const valid = {
  aqi: 42,
  pm25: 12.4,
  ambientLightLux: 800,
  at: '2026-04-28T08:00:00.000Z',
};

describe('VehicleEnvironmentSnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => VehicleEnvironmentSnapshotSchema.parse(valid)).not.toThrow();
  });
  it('accepts null sensor values (missing sensor case)', () => {
    expect(() =>
      VehicleEnvironmentSnapshotSchema.parse({
        aqi: null,
        pm25: null,
        ambientLightLux: null,
        at: valid.at,
      }),
    ).not.toThrow();
  });
  it('rejects extra fields', () => {
    expect(() => VehicleEnvironmentSnapshotSchema.parse({ ...valid, gpsLat: 0 })).toThrow();
  });
});
