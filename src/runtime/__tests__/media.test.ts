/// MediaController tests. Strategy mirrors car.test.ts: hand a stub
/// that satisfies `MediaBridge`, capture the notify callback, inject
/// events synchronously.

import { describe, expect, it, vi } from 'vitest';
import {
  MediaUnavailableError,
  MiniAppClient,
  type Bridge,
  type MediaBridge,
  type MediaSnapshot,
} from '../index.js';

interface StubState {
  notify?: (raw: unknown) => void;
  subs: number;
  unsubs: number;
}

function newBridge(): { bridge: MediaBridge; state: StubState } {
  const state: StubState = { subs: 0, unsubs: 0 };
  const bridge: MediaBridge = {
    getContext: async () => ({}),
    callApi: async () => ({ success: true, data: null }),
    getMedia: async () => validSnapshot(),
    subscribeMedia: async (n) => {
      state.subs++;
      state.notify = n;
      return { id: `m-${state.subs}` };
    },
    unsubscribeMedia: async () => {
      state.unsubs++;
      state.notify = undefined;
    },
  };
  return { bridge, state };
}

function validSnapshot(overrides: Partial<MediaSnapshot> = {}): MediaSnapshot {
  return {
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    artUrl: 'https://art.i99dash.app/x.png',
    state: 'playing',
    source: 'bluetooth',
    volume: 0.5,
    at: '2026-04-28T08:00:00.000Z',
    ...overrides,
  };
}

describe('client.media — capability gating', () => {
  it('throws MediaUnavailableError when bridge lacks the surface', async () => {
    const plain: Bridge = {
      getContext: async () => ({}),
      callApi: async () => ({ success: true, data: null }),
    };
    const client = MiniAppClient.withBridge(plain);
    await expect(client.media.getSnapshot()).rejects.toBeInstanceOf(MediaUnavailableError);
    expect(() => client.media.onChange(() => {})).toThrow(MediaUnavailableError);
  });
});

describe('client.media.getSnapshot', () => {
  it('returns the host snapshot validated by Zod', async () => {
    const { bridge } = newBridge();
    const client = MiniAppClient.withBridge(bridge);
    const snap = await client.media.getSnapshot();
    expect(snap.title).toBe('Track');
    expect(snap.volume).toBe(0.5);
  });
});

describe('client.media.onChange — lifecycle', () => {
  it('lazily subscribes on first listener, unsubscribes on last off()', async () => {
    const { bridge, state } = newBridge();
    const client = MiniAppClient.withBridge(bridge);
    const off1 = client.media.onChange(() => {});
    await Promise.resolve();
    expect(state.subs).toBe(1);

    const off2 = client.media.onChange(() => {});
    await Promise.resolve();
    expect(state.subs).toBe(1);

    off1();
    expect(state.unsubs).toBe(0);
    off2();
    await Promise.resolve();
    expect(state.unsubs).toBe(1);
  });

  it('off() is idempotent', async () => {
    const { bridge, state } = newBridge();
    const client = MiniAppClient.withBridge(bridge);
    const off = client.media.onChange(() => {});
    await Promise.resolve();
    off();
    off();
    await Promise.resolve();
    expect(state.unsubs).toBe(1);
  });

  it('drops malformed events without invoking listeners', async () => {
    const { bridge, state } = newBridge();
    const client = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    client.media.onChange(cb);
    await Promise.resolve();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.notify?.({ title: 'x' /* missing required */ });
    expect(cb).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('dispatches valid events to every registered listener', async () => {
    const { bridge, state } = newBridge();
    const client = MiniAppClient.withBridge(bridge);
    const a = vi.fn();
    const b = vi.fn();
    client.media.onChange(a);
    client.media.onChange(b);
    await Promise.resolve();

    state.notify?.(validSnapshot({ state: 'paused' }));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(a.mock.calls[0][0].state).toBe('paused');
  });
});
