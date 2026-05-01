import { describe, expect, it, vi } from 'vitest';
import {
  MiniAppClient,
  VehicleEnvironmentUnavailableError,
  type Bridge,
  type VehicleEnvironmentBridge,
  type VehicleEnvironmentSnapshot,
} from '../index.js';

const validEnv: VehicleEnvironmentSnapshot = {
  aqi: 42,
  pm25: 12,
  ambientLightLux: 800,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function envBridge(): {
  bridge: VehicleEnvironmentBridge;
  notify: (raw: unknown) => void;
} {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getVehicleEnvironment: async () => validEnv,
      subscribeVehicleEnvironment: async (n) => {
        nf = n;
        return { id: 'e-1' };
      },
      unsubscribeVehicleEnvironment: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.vehicleEnvironment', () => {
  it('throws on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.vehicleEnvironment.getSnapshot()).rejects.toBeInstanceOf(
      VehicleEnvironmentUnavailableError,
    );
  });
  it('returns the host snapshot', async () => {
    const { bridge } = envBridge();
    expect((await MiniAppClient.withBridge(bridge).vehicleEnvironment.getSnapshot()).aqi).toBe(42);
  });
  it('dispatches events', async () => {
    const { bridge, notify } = envBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.vehicleEnvironment.onChange(cb);
    await Promise.resolve();
    notify({ ...validEnv, aqi: 99 });
    expect(cb.mock.calls[0][0].aqi).toBe(99);
  });
});
