import { describe, expect, it } from 'vitest';
import { NavigationSnapshotSchema } from '../navigation.js';

const idle = {
  active: false,
  destinationLabel: null,
  distanceRemainingM: null,
  etaSeconds: null,
  currentManeuver: null,
  distanceToTurnM: null,
  at: '2026-04-28T08:00:00.000Z',
};

const active = {
  active: true,
  destinationLabel: 'Home',
  distanceRemainingM: 5_400,
  etaSeconds: 720,
  currentManeuver: 'turn_right' as const,
  distanceToTurnM: 240,
  at: '2026-04-28T08:00:00.000Z',
};

describe('NavigationSnapshotSchema', () => {
  it('accepts the idle (no-route) shape', () => {
    expect(() => NavigationSnapshotSchema.parse(idle)).not.toThrow();
  });
  it('accepts an active-route shape', () => {
    expect(() => NavigationSnapshotSchema.parse(active)).not.toThrow();
  });
  it('rejects negative distances / ETA', () => {
    expect(() => NavigationSnapshotSchema.parse({ ...active, distanceRemainingM: -1 })).toThrow();
    expect(() => NavigationSnapshotSchema.parse({ ...active, etaSeconds: -1 })).toThrow();
    expect(() => NavigationSnapshotSchema.parse({ ...active, distanceToTurnM: -1 })).toThrow();
  });
  it('rejects unknown maneuver enums', () => {
    expect(() => NavigationSnapshotSchema.parse({ ...active, currentManeuver: 'land' })).toThrow();
  });
  it('rejects extra fields (strict)', () => {
    expect(() =>
      NavigationSnapshotSchema.parse({ ...active, exactStreetName: 'Main St' }),
    ).toThrow();
  });
});
