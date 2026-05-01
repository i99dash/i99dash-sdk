import { describe, expect, it, vi } from 'vitest';
import {
  LocationUnavailableError,
  MiniAppClient,
  type Bridge,
  type LocationBridge,
  type LocationSnapshot,
} from '../index.js';

const validLoc: LocationSnapshot = {
  lat: 24.7,
  lng: 46.6,
  heading: 90,
  speedMps: 12.5,
  accuracyM: 8,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function locationBridge(): { bridge: LocationBridge; notify: (raw: unknown) => void } {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getLocation: async () => validLoc,
      subscribeLocation: async (n) => {
        nf = n;
        return { id: 'l-1' };
      },
      unsubscribeLocation: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.location', () => {
  it('throws LocationUnavailableError on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.location.getSnapshot()).rejects.toBeInstanceOf(LocationUnavailableError);
    expect(() => c.location.onChange(() => {})).toThrow(LocationUnavailableError);
  });
  it('returns the host snapshot validated by Zod', async () => {
    const { bridge } = locationBridge();
    const snap = await MiniAppClient.withBridge(bridge).location.getSnapshot();
    expect(snap.lat).toBe(24.7);
    expect(snap.heading).toBe(90);
  });
  it('dispatches valid events to subscribers', async () => {
    const { bridge, notify } = locationBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.location.onChange(cb);
    await Promise.resolve();
    notify({ ...validLoc, lat: 25.0 });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].lat).toBe(25.0);
  });
});
