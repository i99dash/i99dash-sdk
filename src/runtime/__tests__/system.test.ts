import { describe, expect, it, vi } from 'vitest';
import {
  MiniAppClient,
  SystemUnavailableError,
  type Bridge,
  type SystemBridge,
  type SystemSnapshot,
} from '../index.js';

const validSystem: SystemSnapshot = {
  otaStatus: 'idle',
  units: { distance: 'km', temperature: 'celsius' },
  displayBrightness: 0.7,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function systemBridge(): { bridge: SystemBridge; notify: (raw: unknown) => void } {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getSystem: async () => validSystem,
      subscribeSystem: async (n) => {
        nf = n;
        return { id: 's-1' };
      },
      unsubscribeSystem: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.system', () => {
  it('throws on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.system.getSnapshot()).rejects.toBeInstanceOf(SystemUnavailableError);
  });
  it('returns the host snapshot', async () => {
    const { bridge } = systemBridge();
    expect((await MiniAppClient.withBridge(bridge).system.getSnapshot()).units.distance).toBe('km');
  });
  it('dispatches events', async () => {
    const { bridge, notify } = systemBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.system.onChange(cb);
    await Promise.resolve();
    notify({ ...validSystem, otaStatus: 'ready_to_install' });
    expect(cb.mock.calls[0][0].otaStatus).toBe('ready_to_install');
  });
});
