import { describe, expect, it, vi } from 'vitest';

import { FakeAdminBridge, type AdminExecRequest } from '../bridge.js';
import { AdminClient, UnknownTemplateError } from '../client.js';
import { snapshotFromList, type CommandTemplate } from '../types.js';

const TIER1: CommandTemplate = {
  id: 'diag.tail_logs',
  permissionId: 'cmdExec.read',
  tier: 1,
  requiresStepUp: false,
  category: 'diagnostics',
  paramSchema: {
    lines: { type: 'int', min: 1, max: 1000, default: 100 },
  },
};

const TIER2: CommandTemplate = {
  id: 'pm.disable_user',
  permissionId: 'cmdExec.control',
  tier: 2,
  requiresStepUp: false,
  category: 'package_manager',
  paramSchema: {
    user: { type: 'enum', values: [0, 999] },
    package: {
      type: 'enum',
      values: ['com.byd.trafficmonitor', 'com.byd.autovoice'],
    },
  },
};

function makeClient(
  overrides: {
    exec?: (req: AdminExecRequest) => Promise<
      | {
          success: true;
          data: unknown;
        }
      | { success: false; error: { code: string; message: string } }
    >;
  } = {},
) {
  const exec = overrides.exec ?? (async (_req) => ({ success: true, data: {} }) as const);

  return AdminClient.withBridge({
    bridge: new FakeAdminBridge(exec),
    context: {
      appId: 'diagnostics-pro',
      deviceId: 'byd:BYDMCKLE0PARD8801',
      brand: 'byd',
    },
    catalog: snapshotFromList([TIER1, TIER2, INSTALL]),
  });
}

const INSTALL: CommandTemplate = {
  id: 'pm.install',
  permissionId: 'cmdExec.control',
  tier: 2,
  requiresStepUp: true,
  category: 'package_manager',
  paramSchema: {
    user: { type: 'enum', values: [0, 999] },
    apk_path: { type: 'regex', pattern: '^/data/local/tmp/.+\\.apk$' },
  },
};

describe('AdminClient — invoke (Phase 9 thin shape)', () => {
  it('rejects unknown templates locally without round-trip', async () => {
    const exec = vi.fn();
    const client = makeClient({ exec });
    await expect(client.invoke('totally.fake', {})).rejects.toBeInstanceOf(UnknownTemplateError);
    expect(exec).not.toHaveBeenCalled();
  });

  it('listTemplates surfaces the catalog in iteration order', () => {
    const client = makeClient();
    const ids = client.listTemplates().map((t) => t.id);
    expect(ids).toEqual(['diag.tail_logs', 'pm.disable_user', 'pm.install']);
  });

  it('passes templateId + params + idempotency key to the bridge', async () => {
    const exec = vi.fn(async (_req: AdminExecRequest) => ({
      success: true as const,
      data: {},
    }));
    const client = makeClient({ exec });
    await client.invoke('pm.disable_user', {
      user: 0,
      package: 'com.byd.trafficmonitor',
    });
    expect(exec).toHaveBeenCalledOnce();
    const req = exec.mock.calls[0][0];
    expect(req.templateId).toBe('pm.disable_user');
    expect(req.params).toEqual({ user: 0, package: 'com.byd.trafficmonitor' });
    expect(req.idempotencyKey).toBeTruthy();
  });

  it('does NOT attach a capability — host owns the cap (Phase 9)', async () => {
    const exec = vi.fn(async (_req: AdminExecRequest) => ({
      success: true as const,
      data: {},
    }));
    const client = makeClient({ exec });
    await client.invoke('pm.disable_user', {
      user: 0,
      package: 'com.byd.trafficmonitor',
    });
    // Critical security property: the SDK never sees a cap.
    // Phase 9 moved cap management entirely to the host's
    // SQLite-backed dispatcher.
    expect(exec.mock.calls[0][0].capability).toBeUndefined();
  });

  it('tier-1 and tier-2 are dispatched the same way (host decides)', async () => {
    // The mini-app doesn't know or care about tiers; the host's
    // dispatcher applies the tier-2 gates locally.
    const exec = vi.fn(async (_req: AdminExecRequest) => ({
      success: true as const,
      data: {},
    }));
    const client = makeClient({ exec });
    await client.invoke('diag.tail_logs', { lines: 50 });
    await client.invoke('pm.disable_user', {
      user: 0,
      package: 'com.byd.trafficmonitor',
    });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][0].capability).toBeUndefined();
    expect(exec.mock.calls[1][0].capability).toBeUndefined();
  });
});

describe('AdminClient — convenience wrappers', () => {
  it('disableUser invokes pm.disable_user', async () => {
    const exec = vi.fn(async (_req: AdminExecRequest) => ({
      success: true as const,
      data: { disabled: true as const },
    }));
    const client = makeClient({ exec });
    await client.disableUser({ user: 0, package: 'com.byd.trafficmonitor' });
    expect(exec.mock.calls[0][0].templateId).toBe('pm.disable_user');
  });

  it('tailLogs invokes diag.tail_logs', async () => {
    const exec = vi.fn(async (_req: AdminExecRequest) => ({
      success: true as const,
      data: { lines: [] },
    }));
    const client = makeClient({ exec });
    await client.tailLogs({ lines: 5 });
    expect(exec.mock.calls[0][0].templateId).toBe('diag.tail_logs');
    expect(exec.mock.calls[0][0].params).toEqual({ lines: 5 });
  });

  it('installApk maps apkPath → apk_path slot name', async () => {
    const exec = vi.fn(async (_req: AdminExecRequest) => ({
      success: true as const,
      data: {},
    }));
    const client = makeClient({ exec });
    await client.installApk({ user: 0, apkPath: '/data/local/tmp/x.apk' });
    expect(exec.mock.calls[0][0].params).toEqual({
      user: 0,
      apk_path: '/data/local/tmp/x.apk',
    });
  });
});
