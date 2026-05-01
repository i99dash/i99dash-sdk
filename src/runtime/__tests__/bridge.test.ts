import { describe, it, expect } from 'vitest';
import { HostBridge } from '../bridge.js';
import { BridgeTransportError, NotInsideHostError } from '../errors.js';

describe('HostBridge', () => {
  it('throws NotInsideHostError when given a windowLike with no bridge', () => {
    expect(() => new HostBridge({})).toThrow(NotInsideHostError);
  });

  it('throws NotInsideHostError when bridge has no callHandler', () => {
    expect(() => new HostBridge({ __i99dashHost: {} as any })).toThrow(NotInsideHostError);
  });

  it('proxies getContext through callHandler("getContext")', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const host = new HostBridge({
      __i99dashHost: {
        callHandler: async (name, ...args) => {
          calls.push([name, args]);
          return { ok: true };
        },
      },
    });
    const res = await host.getContext();
    expect(calls).toEqual([['getContext', []]]);
    expect(res).toEqual({ ok: true });
  });

  it('falls back to the legacy global when branded is absent', async () => {
    const host = new HostBridge({
      flutter_inappwebview: {
        callHandler: async () => 'legacy',
      },
    });
    const res = await host.getContext();
    expect(res).toBe('legacy');
  });

  it('prefers the branded global over the legacy one', async () => {
    const host = new HostBridge({
      __i99dashHost: { callHandler: async () => 'branded' },
      flutter_inappwebview: { callHandler: async () => 'legacy' },
    });
    const res = await host.getContext();
    expect(res).toBe('branded');
  });

  it('wraps bridge rejections into BridgeTransportError', async () => {
    const host = new HostBridge({
      __i99dashHost: {
        callHandler: async () => {
          throw new Error('native boom');
        },
      },
    });
    await expect(host.callApi({ path: '/api/v1/x', method: 'GET' })).rejects.toBeInstanceOf(
      BridgeTransportError,
    );
  });
});
