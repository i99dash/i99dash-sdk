import { describe, expect, it } from 'vitest';
import { LocationSnapshotSchema } from '../location.js';

const valid = {
  lat: 24.7,
  lng: 46.6,
  heading: 90,
  speedMps: 12.5,
  accuracyM: 8,
  at: '2026-04-28T08:00:00.000Z',
};

describe('LocationSnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => LocationSnapshotSchema.parse(valid)).not.toThrow();
  });
  it('accepts null heading / speed / accuracy', () => {
    expect(() =>
      LocationSnapshotSchema.parse({
        ...valid,
        heading: null,
        speedMps: null,
        accuracyM: null,
      }),
    ).not.toThrow();
  });
  it('rejects out-of-range latitude', () => {
    expect(() => LocationSnapshotSchema.parse({ ...valid, lat: 91 })).toThrow();
  });
  it('rejects out-of-range longitude', () => {
    expect(() => LocationSnapshotSchema.parse({ ...valid, lng: -181 })).toThrow();
  });
  it('rejects out-of-range heading', () => {
    expect(() => LocationSnapshotSchema.parse({ ...valid, heading: 400 })).toThrow();
  });
  it('rejects negative speed / accuracy', () => {
    expect(() => LocationSnapshotSchema.parse({ ...valid, speedMps: -1 })).toThrow();
    expect(() => LocationSnapshotSchema.parse({ ...valid, accuracyM: -5 })).toThrow();
  });
  it('rejects extra fields (strict)', () => {
    expect(() => LocationSnapshotSchema.parse({ ...valid, altitude: 100 })).toThrow();
  });
});
