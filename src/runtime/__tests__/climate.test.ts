import { describe, expect, it, vi } from 'vitest';
import {
  ClimateUnavailableError,
  MiniAppClient,
  type Bridge,
  type ClimateBridge,
  type ClimateSnapshot,
} from '../index.js';

const validClimate: ClimateSnapshot = {
  cabinTempC: 22.5,
  setpointC: 21,
  fanSpeed: 0.5,
  mode: 'auto',
  zoneCount: 2,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function climateBridge(): { bridge: ClimateBridge; notify: (raw: unknown) => void } {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getClimate: async () => validClimate,
      subscribeClimate: async (n) => {
        nf = n;
        return { id: 'c-1' };
      },
      unsubscribeClimate: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.climate — capability gating', () => {
  it('throws ClimateUnavailableError on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.climate.getSnapshot()).rejects.toBeInstanceOf(ClimateUnavailableError);
    expect(() => c.climate.onChange(() => {})).toThrow(ClimateUnavailableError);
  });
});

describe('client.climate.getSnapshot', () => {
  it('returns the host snapshot validated by Zod', async () => {
    const { bridge } = climateBridge();
    const snap = await MiniAppClient.withBridge(bridge).climate.getSnapshot();
    expect(snap.mode).toBe('auto');
    expect(snap.fanSpeed).toBe(0.5);
  });
});

describe('client.climate.onChange', () => {
  it('dispatches valid events to subscribers', async () => {
    const { bridge, notify } = climateBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.climate.onChange(cb);
    await Promise.resolve();
    notify({ ...validClimate, fanSpeed: 0.9 });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].fanSpeed).toBe(0.9);
  });
});
