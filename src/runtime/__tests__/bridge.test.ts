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

  // ── Envelope unwrap (probe-driven regression) ─────────────────────
  //
  // Background: the host's family-op handler (`_handleFamilyOp`)
  // wraps every reply in `{success, data | error}` — same envelope
  // `_admin.exec` uses. The legacy direct-method controllers
  // (MediaController.getSnapshot, ClimateController.getSnapshot,
  // etc.) used to receive the bare snapshot from `bridge.getMedia()`;
  // when the host migrated to the envelope, every legacy controller
  // started 422-ing with INVALID_RESPONSE because zod parsed the
  // envelope (`{success, data}`) instead of the snapshot.
  //
  // The fix: HostBridge.getMedia / getClimate / getSystem / etc.
  // unwrap the envelope before returning. Older hosts that still
  // return bare data continue to work — the helper passes through
  // anything that doesn't look like the envelope shape.
  describe('legacy direct-method get* — envelope unwrap', () => {
    it('unwraps {success: true, data} → returns data verbatim', async () => {
      const host = new HostBridge({
        __i99dashHost: {
          callHandler: async (name) => {
            expect(name).toBe('media.read');
            return { success: true, data: { title: 'Track', volume: 0.5 } };
          },
        },
      });
      const r = await host.getMedia();
      expect(r).toEqual({ title: 'Track', volume: 0.5 });
    });

    it('passes bare snapshot through when envelope keys are absent', async () => {
      // Older host build that hasn't migrated to the envelope.
      const host = new HostBridge({
        __i99dashHost: {
          callHandler: async () => ({ title: 'Bare', volume: 0.3 }),
        },
      });
      const r = await host.getMedia();
      expect(r).toEqual({ title: 'Bare', volume: 0.3 });
    });

    it('throws BridgeTransportError on {success: false} envelope', async () => {
      const host = new HostBridge({
        __i99dashHost: {
          callHandler: async () => ({
            success: false,
            error: { code: 'permission_denied', message: 'no media.read scope' },
          }),
        },
      });
      await expect(host.getMedia()).rejects.toBeInstanceOf(BridgeTransportError);
      await expect(host.getMedia()).rejects.toThrow(/permission_denied/);
    });

    it('passes null through (older host returning no data)', async () => {
      const host = new HostBridge({
        __i99dashHost: { callHandler: async () => null },
      });
      const r = await host.getMedia();
      expect(r).toBeNull();
    });

    it('applies same unwrap to climate/system/connectivity/etc.', async () => {
      // Sanity sweep — all the legacy direct methods route through the
      // same private _unwrapEnvelope helper, so verifying media is
      // covered by the test above. This case asserts the contract
      // holds across the family by exercising one more (climate).
      const host = new HostBridge({
        __i99dashHost: {
          callHandler: async (name) => {
            expect(name).toBe('climate.read');
            return { success: true, data: { cabinTempC: 22.5, fanSpeed: 0.5 } };
          },
        },
      });
      const r = await host.getClimate();
      expect(r).toEqual({ cabinTempC: 22.5, fanSpeed: 0.5 });
    });
  });
});
