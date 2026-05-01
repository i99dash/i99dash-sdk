/// Tests for `CarStatusController` — the SDK side of the local
/// real-time car status stream.
///
/// Strategy: hand `MiniAppClient.withBridge` a stub that satisfies
/// `CarStatusBridge`. The stub's `subscribeCarStatus` captures the
/// notify callback so the test can synchronously inject events and
/// verify dispatch behaviour. No real WebView, no real DOM beyond
/// the small bits we set up explicitly per test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CarStatusQuotaExceededError as _Quota, // re-export visibility check
  CarStatusUnavailableError,
  MiniAppClient,
  type Bridge,
  type CarStatus,
  type CarStatusBridge,
} from '../index.js';

// Reference to silence "unused import" while still asserting
// the export exists (the public-api snapshot test pins it too).
void _Quota;

interface StubState {
  notifyStatus?: (raw: unknown) => void;
  notifyConnection?: (raw: unknown) => void;
  subscribeCalls: number;
  unsubscribeCalls: number;
  current: CarStatus;
}

function newStubBridge(): { bridge: CarStatusBridge; state: StubState } {
  const state: StubState = {
    subscribeCalls: 0,
    unsubscribeCalls: 0,
    current: validStatus(),
  };
  const bridge: CarStatusBridge = {
    async getContext() {
      return {};
    },
    async callApi() {
      return { success: true, data: null };
    },
    async getCarStatus() {
      return state.current;
    },
    async subscribeCarStatus(notify) {
      state.subscribeCalls++;
      state.notifyStatus = notify;
      return { id: `status-${state.subscribeCalls}` };
    },
    async unsubscribeCarStatus() {
      state.unsubscribeCalls++;
      state.notifyStatus = undefined;
    },
    async subscribeCarConnectionState(notify) {
      state.notifyConnection = notify;
      return { id: 'conn-1' };
    },
    async unsubscribeCarConnectionState() {
      state.notifyConnection = undefined;
    },
  };
  return { bridge, state };
}

function validStatus(overrides: Partial<CarStatus> = {}): CarStatus {
  return {
    vin: 'WDB1234567',
    at: '2026-04-27T12:00:00.000Z',
    staleness: 'fresh',
    isMoving: false,
    speedKmh: 0,
    doorsLocked: true,
    batteryPct: 88,
    ...overrides,
  };
}

describe('client.car — capability gating', () => {
  it('throws CarStatusUnavailableError when bridge lacks the surface', async () => {
    const plain: Bridge = {
      async getContext() {
        return {};
      },
      async callApi() {
        return { success: true, data: null };
      },
    };
    const client = MiniAppClient.withBridge(plain);
    await expect(client.car.getStatus()).rejects.toBeInstanceOf(CarStatusUnavailableError);
    expect(() => client.car.onStatusChange(() => {})).toThrow(CarStatusUnavailableError);
  });
});

describe('client.car.getStatus', () => {
  it('returns the host snapshot validated by Zod', async () => {
    const { bridge, state } = newStubBridge();
    state.current = validStatus({ speedKmh: 60, isMoving: true });
    const client = MiniAppClient.withBridge(bridge);
    const status = await client.car.getStatus();
    expect(status.speedKmh).toBe(60);
    expect(status.isMoving).toBe(true);
  });
});

describe('client.car.onStatusChange — lifecycle', () => {
  it('lazily subscribes on first listener, unsubscribes on last off()', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    expect(state.subscribeCalls).toBe(0);

    const off1 = client.car.onStatusChange(() => {});
    // subscribeCarStatus is invoked async — let microtasks drain
    await Promise.resolve();
    expect(state.subscribeCalls).toBe(1);

    const off2 = client.car.onStatusChange(() => {});
    await Promise.resolve();
    // No second bridge subscription — refcounted single sub.
    expect(state.subscribeCalls).toBe(1);

    off1();
    expect(state.unsubscribeCalls).toBe(0); // still one listener left
    off2();
    await Promise.resolve();
    expect(state.unsubscribeCalls).toBe(1);
  });

  it('off() is idempotent — second call is a no-op', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const off = client.car.onStatusChange(() => {});
    await Promise.resolve();
    off();
    off();
    await Promise.resolve();
    expect(state.unsubscribeCalls).toBe(1);
  });

  it('dispatches valid events to every registered listener', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const a = vi.fn();
    const b = vi.fn();
    client.car.onStatusChange(a);
    client.car.onStatusChange(b);
    await Promise.resolve();

    state.notifyStatus?.(validStatus({ doorsLocked: false }));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(a.mock.calls[0][0].doorsLocked).toBe(false);
  });

  it('drops malformed events without invoking listeners', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    client.car.onStatusChange(cb);
    await Promise.resolve();

    // Suppress the dev-mode console.warn the controller emits
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.notifyStatus?.({ vin: 'X' /* missing required fields */ });
    expect(cb).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('one listener throwing does not silence the others', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    client.car.onStatusChange(bad);
    client.car.onStatusChange(good);
    await Promise.resolve();

    state.notifyStatus?.(validStatus());
    expect(bad).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();
    err.mockRestore();
  });
});

// ── Page Visibility pause / resume ───────────────────────────────────

describe('Page Visibility pause + catch-up', () => {
  let originalDocument: Document | undefined;
  let visibilityHandlers: Array<() => void> = [];
  let hidden = false;

  beforeEach(() => {
    visibilityHandlers = [];
    hidden = false;
    originalDocument = (globalThis as { document?: Document }).document;
    (globalThis as { document?: unknown }).document = {
      get hidden() {
        return hidden;
      },
      addEventListener: (evt: string, h: () => void) => {
        if (evt === 'visibilitychange') visibilityHandlers.push(h);
      },
      removeEventListener: () => {},
    } as unknown as Document;
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: Document }).document = originalDocument;
    }
  });

  function setHidden(v: boolean): void {
    hidden = v;
    for (const h of visibilityHandlers) h();
  }

  it('suppresses callbacks while hidden, fires one catch-up on visible', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    client.car.onStatusChange(cb);
    await Promise.resolve();

    // Visible: events flow normally.
    state.notifyStatus?.(validStatus({ batteryPct: 90 }));
    expect(cb).toHaveBeenCalledTimes(1);

    // Hide: subsequent events are buffered.
    setHidden(true);
    state.notifyStatus?.(validStatus({ batteryPct: 80 }));
    state.notifyStatus?.(validStatus({ batteryPct: 70 }));
    expect(cb).toHaveBeenCalledTimes(1); // still 1

    // Reveal: ONE catch-up event fires with the LATEST buffered value.
    setHidden(false);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0].batteryPct).toBe(70);

    // Subsequent events flow normally again.
    state.notifyStatus?.(validStatus({ batteryPct: 65 }));
    expect(cb).toHaveBeenCalledTimes(3);
  });
});

// ── Zod fast-path ────────────────────────────────────────────────────

describe('Zod fast-path on stable shape', () => {
  it('100 dispatches with identical shape complete in <500ms', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    let count = 0;
    client.car.onStatusChange(() => {
      count++;
    });
    await Promise.resolve();

    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      state.notifyStatus?.(validStatus({ batteryPct: 50 + (i % 50) }));
    }
    const elapsed = performance.now() - t0;

    expect(count).toBe(100);
    // 5ms/event budget. Generous for CI variability; the fast-path
    // typically lands at <0.5ms/event on local dev.
    expect(elapsed).toBeLessThan(500);
  });

  it('a new key in the payload re-triggers strict parse', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    client.car.onStatusChange(cb);
    await Promise.resolve();

    // First payload — strict parse, populates shape cache.
    state.notifyStatus?.(validStatus());
    expect(cb).toHaveBeenCalledTimes(1);

    // Second payload — adds an UNKNOWN key. Strict schema rejects;
    // controller drops the event.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.notifyStatus?.({
      ...validStatus(),
      bogusField: 'leak attempt',
    });
    expect(cb).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

// ── Connection state stream (separate from status) ───────────────────

describe('client.car.onConnectionChange', () => {
  it('dispatches connected / disconnected events', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    const off = client.car.onConnectionChange(cb);
    await Promise.resolve();

    state.notifyConnection?.('connected');
    state.notifyConnection?.('disconnected');
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[0][0]).toBe('connected');
    expect(cb.mock.calls[1][0]).toBe('disconnected');

    off();
    await Promise.resolve();
    state.notifyConnection?.('connected');
    expect(cb).toHaveBeenCalledTimes(2); // no call after off
  });

  it('drops invalid connection state values', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    const cb = vi.fn();
    client.car.onConnectionChange(cb);
    await Promise.resolve();

    state.notifyConnection?.('not_a_real_state');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('client.car — per-field read telemetry', () => {
  it('records each field that consumer code reads off a status event', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    let last: CarStatus | undefined;
    const off = client.car.onStatusChange((s) => {
      last = s;
    });
    await Promise.resolve();
    state.notifyStatus?.(validStatus({ speedKmh: 42 }));
    expect(last).toBeDefined();

    // Consumer code touches three fields:
    void last!.speedKmh;
    void last!.batteryPct;
    void last!.batteryPct;
    void last!.doorsLocked;

    // Use the test-only debug surface; underscore-prefixed.
    const snapshot = (
      client.car as unknown as { _telemetrySnapshot: () => Record<string, number> }
    )._telemetrySnapshot();
    expect(snapshot.speedKmh).toBe(1);
    expect(snapshot.batteryPct).toBe(2);
    expect(snapshot.doorsLocked).toBe(1);

    off();
  });

  it('snapshot resets the buffer', async () => {
    const { bridge, state } = newStubBridge();
    const client = MiniAppClient.withBridge(bridge);
    let last: CarStatus | undefined;
    client.car.onStatusChange((s) => {
      last = s;
    });
    await Promise.resolve();
    state.notifyStatus?.(validStatus());
    void last!.batteryPct;

    const debug = client.car as unknown as { _telemetrySnapshot: () => Record<string, number> };
    expect(debug._telemetrySnapshot().batteryPct).toBe(1);
    // Second snapshot — buffer should have been cleared.
    expect(debug._telemetrySnapshot()).toEqual({});
  });
});
