import { describe, expect, it, vi } from 'vitest';
import {
  MiniAppClient,
  VehicleDiagnosticsUnavailableError,
  type Bridge,
  type VehicleDiagnosticsBridge,
  type VehicleDiagnosticsSnapshot,
} from '../index.js';

const validDiag: VehicleDiagnosticsSnapshot = {
  tirePressure: { frontLeft: 230, frontRight: 230, rearLeft: 225, rearRight: 225 },
  gearPosition: 'D',
  odometerKm: 42_000,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function diagBridge(): {
  bridge: VehicleDiagnosticsBridge;
  notify: (raw: unknown) => void;
} {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getVehicleDiagnostics: async () => validDiag,
      subscribeVehicleDiagnostics: async (n) => {
        nf = n;
        return { id: 'd-1' };
      },
      unsubscribeVehicleDiagnostics: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.vehicleDiagnostics', () => {
  it('throws on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.vehicleDiagnostics.getSnapshot()).rejects.toBeInstanceOf(
      VehicleDiagnosticsUnavailableError,
    );
  });
  it('returns the host snapshot', async () => {
    const { bridge } = diagBridge();
    const snap = await MiniAppClient.withBridge(bridge).vehicleDiagnostics.getSnapshot();
    expect(snap.gearPosition).toBe('D');
    expect(snap.odometerKm).toBe(42_000);
  });
  it('dispatches events', async () => {
    const { bridge, notify } = diagBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.vehicleDiagnostics.onChange(cb);
    await Promise.resolve();
    notify({ ...validDiag, gearPosition: 'P' });
    expect(cb.mock.calls[0][0].gearPosition).toBe('P');
  });
});
