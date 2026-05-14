import { describe, it, expect, vi } from 'vitest';
import type { Bridge, CapabilitiesBridge, FamilyBridge } from '../bridge.js';
import { MiniAppClient } from '../client.js';
import {
  BridgeTimeoutError,
  BridgeTransportError,
  CallApiFailedError,
  InvalidResponseError,
  NotInsideHostError,
} from '../errors.js';
import { FamilyOpError, FamilyUnavailableError } from '../family-controller.js';

const validContext = {
  userId: 'u-1',
  activeCarId: 'VIN',
  locale: 'en',
  isDark: false,
  appVersion: '1.0.0',
  appId: 'fuel_prices',
} as const;

function bridgeReturning({
  context,
  api,
  delayMs = 0,
}: {
  context?: unknown;
  api?: unknown;
  delayMs?: number;
}): Bridge {
  return {
    getContext: async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return context;
    },
    callApi: async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return api;
    },
  };
}

describe('MiniAppClient.fromWindow', () => {
  it('throws NotInsideHostError when window is undefined', () => {
    expect(() => MiniAppClient.fromWindow()).toThrow(NotInsideHostError);
  });
});

describe('MiniAppClient.getContext', () => {
  it('returns a schema-parsed context', async () => {
    const c = MiniAppClient.withBridge(bridgeReturning({ context: validContext }));
    const ctx = await c.getContext();
    expect(ctx.userId).toBe('u-1');
    expect(ctx.locale).toBe('en');
  });

  it('throws InvalidResponseError on malformed payload', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({ context: { ...validContext, locale: 'fr' } }),
    );
    await expect(c.getContext()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('bubbles BridgeTransportError when the bridge rejects', async () => {
    const broken: Bridge = {
      getContext: async () => {
        throw new BridgeTransportError('boom', new Error('x'));
      },
      callApi: async () => ({ success: true, data: null }),
    };
    const c = MiniAppClient.withBridge(broken);
    await expect(c.getContext()).rejects.toBeInstanceOf(BridgeTransportError);
  });

  it('respects timeoutMs', async () => {
    vi.useFakeTimers();
    const c = MiniAppClient.withBridge(bridgeReturning({ context: validContext, delayMs: 5_000 }));
    const p = c.getContext({ timeoutMs: 50 });
    // Pre-attach a noop catch so vitest doesn't flag a momentary
    // unhandled-rejection between the timer flush and the `await expect`.
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).rejects.toBeInstanceOf(BridgeTimeoutError);
    vi.useRealTimers();
  });

  it('rejects immediately on pre-aborted signal', async () => {
    const c = MiniAppClient.withBridge(bridgeReturning({ context: validContext }));
    const ac = new AbortController();
    ac.abort('user cancelled');
    await expect(c.getContext({ signal: ac.signal })).rejects.toBe('user cancelled');
  });
});

describe('MiniAppClient.callApi', () => {
  it('returns success envelope unchanged', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({ api: { success: true, data: { stations: [] } } }),
    );
    const res = await c.callApi({ path: '/api/v1/fuel-stations', method: 'GET' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual({ stations: [] });
  });

  it('returns failure envelope unchanged (no throw on success:false)', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({
        api: { success: false, error: { code: 'disallowed_path', message: 'nope' } },
      }),
    );
    const res = await c.callApi({ path: '/api/v1/fuel-stations', method: 'GET' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('disallowed_path');
  });

  it('throws InvalidResponseError on malformed envelope', async () => {
    const c = MiniAppClient.withBridge(bridgeReturning({ api: { foo: 'bar' } }));
    await expect(
      c.callApi({ path: '/api/v1/fuel-stations', method: 'GET' }),
    ).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('MiniAppClient.callApiOrThrow', () => {
  it('returns data on success', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({ api: { success: true, data: { ok: 1 } } }),
    );
    const data = await c.callApiOrThrow<{ ok: number }>({
      path: '/api/v1/x',
      method: 'GET',
    });
    expect(data).toEqual({ ok: 1 });
  });

  it('throws CallApiFailedError carrying the protocol error code', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({
        api: { success: false, error: { code: 'disallowed_path', message: 'nope' } },
      }),
    );
    try {
      await c.callApiOrThrow({ path: '/api/v1/x', method: 'GET' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CallApiFailedError);
      const err = e as CallApiFailedError;
      expect(err.errorCode).toBe('disallowed_path');
      expect(err.code).toBe('CALL_API_FAILED');
    }
  });
});

describe('MiniAppClient.onPermissionDenied', () => {
  it('fires when callApi returns a permission_denied envelope', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({
        api: { success: false, error: { code: 'permission_denied', message: 'no scope' } },
      }),
    );
    const seen: string[] = [];
    const off = c.onPermissionDenied((scope) => seen.push(scope));
    await c.callApi({ path: '/api/v1/foo', method: 'GET' });
    off();
    expect(seen).toEqual(['callApi:/api/v1/foo']);
  });

  it('does not fire on unrelated error codes or success', async () => {
    const c = MiniAppClient.withBridge(bridgeReturning({ api: { success: true, data: {} } }));
    const seen: string[] = [];
    c.onPermissionDenied((scope) => seen.push(scope));
    await c.callApi({ path: '/api/v1/foo', method: 'GET' });
    expect(seen).toEqual([]);
  });

  it('unsubscribe is idempotent and stops dispatch', async () => {
    const c = MiniAppClient.withBridge(
      bridgeReturning({
        api: { success: false, error: { code: 'permission_denied', message: '' } },
      }),
    );
    const seen: string[] = [];
    const off = c.onPermissionDenied((scope) => seen.push(scope));
    off();
    off(); // idempotent
    await c.callApi({ path: '/api/v1/x', method: 'GET' });
    expect(seen).toEqual([]);
  });
});

describe('MiniAppClient.capabilities + has', () => {
  it('returns the host-declared shape on a CapabilitiesBridge', async () => {
    const bridge: CapabilitiesBridge = {
      getContext: async () => validContext,
      callApi: async () => ({ success: true, data: null }),
      capabilities: async () => ({
        bridgeVersion: '1.2.3',
        families: ['car.status', 'media.read'],
      }),
    };
    const c = MiniAppClient.withBridge(bridge);
    const caps = await c.capabilities();
    expect(caps.bridgeVersion).toBe('1.2.3');
    expect(caps.families).toEqual(['car.status', 'media.read']);
    expect(await c.has('media.read')).toBe(true);
    expect(await c.has('nav.read')).toBe(false);
  });

  it('memoises across calls', async () => {
    const handler = vi.fn(async () => ({ bridgeVersion: '1', families: ['car.status'] }));
    const bridge: CapabilitiesBridge = {
      getContext: async () => validContext,
      callApi: async () => ({ success: true, data: null }),
      capabilities: handler,
    };
    const c = MiniAppClient.withBridge(bridge);
    await c.capabilities();
    await c.capabilities();
    await c.has('car.status');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('falls back to bridgeVersion=unknown on a host without the handshake', async () => {
    // Plain Bridge — no `capabilities` method.
    const c = MiniAppClient.withBridge(
      bridgeReturning({ api: { success: true, data: null }, context: validContext }),
    );
    const caps = await c.capabilities();
    expect(caps.bridgeVersion).toBe('unknown');
    // Plain bridge has no car-status surface either, so families = []
    expect(caps.families).toEqual([]);
    expect(await c.has('car.status')).toBe(false);
  });

  it('rejects malformed capabilities payloads with InvalidResponseError', async () => {
    const bridge: CapabilitiesBridge = {
      getContext: async () => validContext,
      callApi: async () => ({ success: true, data: null }),
      capabilities: async () => ({ wrong: 'shape' }),
    };
    const c = MiniAppClient.withBridge(bridge);
    await expect(c.capabilities()).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('MiniAppClient.callFamily', () => {
  function makeFamilyBridge(handler: (familyId: string, op: string) => unknown): {
    bridge: FamilyBridge;
    calls: Array<{
      familyId: string;
      op: string;
      params: Record<string, unknown> | undefined;
      idempotencyKey: string | undefined;
    }>;
  } {
    const calls: Array<{
      familyId: string;
      op: string;
      params: Record<string, unknown> | undefined;
      idempotencyKey: string | undefined;
    }> = [];
    const bridge: FamilyBridge = {
      getContext: async () => validContext,
      callApi: async () => ({ success: true, data: null }),
      callFamily: async (familyId, op, params, idempotencyKey) => {
        calls.push({ familyId, op, params, idempotencyKey });
        return handler(familyId, op);
      },
    };
    return { bridge, calls };
  }

  it('forwards familyId / op / params and auto-generates an idempotency key', async () => {
    const { bridge, calls } = makeFamilyBridge(() => ({ success: true, data: { ok: true } }));
    const c = MiniAppClient.withBridge(bridge);
    const out = await c.callFamily<{ ok: boolean }>('pkg', 'launch', { id: 'x.y' });
    expect(out).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      familyId: 'pkg',
      op: 'launch',
      params: { id: 'x.y' },
    });
    expect(calls[0]!.idempotencyKey).toBeTruthy();
  });

  it('throws FamilyUnavailableError on a non-family bridge', async () => {
    const c = MiniAppClient.withBridge(bridgeReturning({ api: { success: true, data: null } }));
    await expect(c.callFamily('pkg', 'launch')).rejects.toBeInstanceOf(FamilyUnavailableError);
  });

  it('throws FamilyOpError on {success: false}', async () => {
    const { bridge } = makeFamilyBridge(() => ({
      success: false,
      error: { code: 'denied', message: 'nope' },
    }));
    const c = MiniAppClient.withBridge(bridge);
    await expect(c.callFamily('surface', 'create')).rejects.toBeInstanceOf(FamilyOpError);
  });
});
