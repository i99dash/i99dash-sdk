import { describe, expect, it } from 'vitest';
import { ConnectivitySnapshotSchema } from '../connectivity.js';

const valid = {
  network: 'wifi' as const,
  bluetoothPairedCount: 2,
  at: '2026-04-28T08:00:00.000Z',
};

describe('ConnectivitySnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => ConnectivitySnapshotSchema.parse(valid)).not.toThrow();
  });
  it('rejects negative paired count', () => {
    expect(() =>
      ConnectivitySnapshotSchema.parse({ ...valid, bluetoothPairedCount: -1 }),
    ).toThrow();
  });
  it('rejects unknown network types', () => {
    expect(() => ConnectivitySnapshotSchema.parse({ ...valid, network: 'satellite' })).toThrow();
  });
  it('rejects extra fields', () => {
    expect(() => ConnectivitySnapshotSchema.parse({ ...valid, ssid: 'home' })).toThrow();
  });
});
