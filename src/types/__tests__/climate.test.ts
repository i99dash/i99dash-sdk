import { describe, expect, it } from 'vitest';
import { ClimateSnapshotSchema } from '../climate.js';

const valid = {
  cabinTempC: 22.5,
  setpointC: 21,
  fanSpeed: 0.4,
  mode: 'auto' as const,
  zoneCount: 2,
  at: '2026-04-28T08:00:00.000Z',
};

describe('ClimateSnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => ClimateSnapshotSchema.parse(valid)).not.toThrow();
  });
  it('rejects extra fields (strict)', () => {
    expect(() => ClimateSnapshotSchema.parse({ ...valid, secret: 1 })).toThrow();
  });
  it('rejects fanSpeed out of [0..1]', () => {
    expect(() => ClimateSnapshotSchema.parse({ ...valid, fanSpeed: 1.5 })).toThrow();
  });
  it('rejects unknown mode enums', () => {
    expect(() => ClimateSnapshotSchema.parse({ ...valid, mode: 'arctic' })).toThrow();
  });
});
