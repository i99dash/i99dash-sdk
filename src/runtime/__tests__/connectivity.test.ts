import { describe, expect, it, vi } from 'vitest';
import {
  ConnectivityUnavailableError,
  MiniAppClient,
  type Bridge,
  type ConnectivityBridge,
  type ConnectivitySnapshot,
} from '../index.js';

const validConn: ConnectivitySnapshot = {
  network: 'wifi',
  bluetoothPairedCount: 2,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function connBridge(): { bridge: ConnectivityBridge; notify: (raw: unknown) => void } {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getConnectivity: async () => validConn,
      subscribeConnectivity: async (n) => {
        nf = n;
        return { id: 'n-1' };
      },
      unsubscribeConnectivity: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.connectivity', () => {
  it('throws on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.connectivity.getSnapshot()).rejects.toBeInstanceOf(ConnectivityUnavailableError);
  });
  it('returns the host snapshot', async () => {
    const { bridge } = connBridge();
    expect((await MiniAppClient.withBridge(bridge).connectivity.getSnapshot()).network).toBe(
      'wifi',
    );
  });
  it('dispatches events', async () => {
    const { bridge, notify } = connBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.connectivity.onChange(cb);
    await Promise.resolve();
    notify({ ...validConn, network: 'cellular' });
    expect(cb.mock.calls[0][0].network).toBe('cellular');
  });
});
