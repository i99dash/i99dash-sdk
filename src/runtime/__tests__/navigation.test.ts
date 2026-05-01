import { describe, expect, it, vi } from 'vitest';
import {
  MiniAppClient,
  NavigationUnavailableError,
  type Bridge,
  type NavigationBridge,
  type NavigationSnapshot,
} from '../index.js';

const idleNav: NavigationSnapshot = {
  active: false,
  destinationLabel: null,
  distanceRemainingM: null,
  etaSeconds: null,
  currentManeuver: null,
  distanceToTurnM: null,
  at: '2026-04-28T08:00:00.000Z',
};

const activeNav: NavigationSnapshot = {
  active: true,
  destinationLabel: 'Home',
  distanceRemainingM: 5_400,
  etaSeconds: 720,
  currentManeuver: 'turn_right',
  distanceToTurnM: 240,
  at: '2026-04-28T08:00:00.000Z',
};

const plainBridge: Bridge = {
  getContext: async () => ({}),
  callApi: async () => ({ success: true, data: null }),
};

function navBridge(): { bridge: NavigationBridge; notify: (raw: unknown) => void } {
  let nf: ((raw: unknown) => void) | undefined;
  return {
    bridge: {
      ...plainBridge,
      getNavigation: async () => idleNav,
      subscribeNavigation: async (n) => {
        nf = n;
        return { id: 'n-1' };
      },
      unsubscribeNavigation: async () => {},
    },
    notify: (raw) => nf?.(raw),
  };
}

describe('client.navigation', () => {
  it('throws NavigationUnavailableError on plain bridge', async () => {
    const c = MiniAppClient.withBridge(plainBridge);
    await expect(c.navigation.getSnapshot()).rejects.toBeInstanceOf(NavigationUnavailableError);
    expect(() => c.navigation.onChange(() => {})).toThrow(NavigationUnavailableError);
  });
  it('returns the host snapshot (idle)', async () => {
    const { bridge } = navBridge();
    const snap = await MiniAppClient.withBridge(bridge).navigation.getSnapshot();
    expect(snap.active).toBe(false);
  });
  it('dispatches active-route events', async () => {
    const { bridge, notify } = navBridge();
    const c = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    c.navigation.onChange(cb);
    await Promise.resolve();
    notify(activeNav);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].active).toBe(true);
    expect(cb.mock.calls[0][0].destinationLabel).toBe('Home');
  });
});
