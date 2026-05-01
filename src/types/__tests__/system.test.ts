import { describe, expect, it } from 'vitest';
import { SystemSnapshotSchema } from '../system.js';

const valid = {
  otaStatus: 'idle' as const,
  units: { distance: 'km' as const, temperature: 'celsius' as const },
  displayBrightness: 0.7,
  at: '2026-04-28T08:00:00.000Z',
};

describe('SystemSnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => SystemSnapshotSchema.parse(valid)).not.toThrow();
  });
  it('rejects displayBrightness out of [0..1]', () => {
    expect(() => SystemSnapshotSchema.parse({ ...valid, displayBrightness: 2 })).toThrow();
  });
  it('rejects unknown ota status', () => {
    expect(() => SystemSnapshotSchema.parse({ ...valid, otaStatus: 'pending_review' })).toThrow();
  });
  it('rejects extra fields in units', () => {
    expect(() =>
      SystemSnapshotSchema.parse({
        ...valid,
        units: { distance: 'km', temperature: 'celsius', currency: 'USD' },
      }),
    ).toThrow();
  });
});
