import { describe, it, expect, vi } from 'vitest';
import {
  promoteAppToBeta,
  demoteAppBeta,
  promoteAppToProduction,
  listTesters,
  inviteTester,
  inviteTestersBatch,
  revokeTester,
  getBetaStatus,
} from '../api/endpoints.js';
import { ApiClient } from '../api/client.js';

// ---------------------------------------------------------------------------
// Fetch mock factory — each test supplies its own ordered response list.
// ---------------------------------------------------------------------------
function makeFetch(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let i = 0;
  return (async (_url: string, _init?: RequestInit) => {
    const r = responses[i++];
    if (!r) throw new Error('ran out of fetch responses');
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

function makeClient(responses: Array<{ status: number; body: unknown }>): ApiClient {
  return new ApiClient('https://api.test', 'test-token', makeFetch(responses));
}

// Helper: a 200 OK with an empty data envelope.
const OK = { status: 200, body: { success: true, data: null, error: null } };

// ---------------------------------------------------------------------------
// promoteAppToBeta
// ---------------------------------------------------------------------------
describe('promoteAppToBeta', () => {
  it('resolves on 200', async () => {
    const client = makeClient([OK]);
    await expect(promoteAppToBeta(client, 'app1', '1.1.0')).resolves.toBeUndefined();
  });

  it('resolves with release notes on 200', async () => {
    const client = makeClient([OK]);
    await expect(
      promoteAppToBeta(client, 'app1', '1.1.0', 'Fixed dark mode contrast'),
    ).resolves.toBeUndefined();
  });

  it('captures the correct request path (app_id encoded)', async () => {
    let capturedUrl: string | undefined;
    const fetchSpy = vi.fn(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ success: true, data: null, error: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new ApiClient('https://api.test', 'tok', fetchSpy);
    await promoteAppToBeta(client, 'fuel_prices', '2.0.0');
    expect(capturedUrl).toBe('https://api.test/api/v1/dev/apps/fuel_prices/beta/promote');
  });
});

// ---------------------------------------------------------------------------
// demoteAppBeta
// ---------------------------------------------------------------------------
describe('demoteAppBeta', () => {
  it('resolves on 200', async () => {
    const client = makeClient([OK]);
    await expect(demoteAppBeta(client, 'app1')).resolves.toBeUndefined();
  });

  it('uses DELETE method', async () => {
    let capturedMethod: string | undefined;
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedMethod = init?.method;
      return new Response(JSON.stringify({ success: true, data: null, error: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new ApiClient('https://api.test', 'tok', fetchSpy);
    await demoteAppBeta(client, 'app1');
    expect(capturedMethod).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// promoteAppToProduction
// ---------------------------------------------------------------------------
describe('promoteAppToProduction', () => {
  it('resolves on 200', async () => {
    const client = makeClient([OK]);
    await expect(promoteAppToProduction(client, 'app1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listTesters
// ---------------------------------------------------------------------------
describe('listTesters', () => {
  const sampleTesters = [
    {
      userId: 'u1',
      telegramUsername: 'alice',
      status: 'accepted',
      invitedAt: '2025-01-01T00:00:00Z',
      acceptedAt: '2025-01-02T00:00:00Z',
      revokedAt: null,
    },
    {
      userId: 'u2',
      telegramUsername: 'bob',
      status: 'invited',
      invitedAt: '2025-01-03T00:00:00Z',
      acceptedAt: null,
      revokedAt: null,
    },
  ];

  it('returns an array of tester objects', async () => {
    const client = makeClient([
      { status: 200, body: { success: true, data: { testers: sampleTesters }, error: null } },
    ]);
    const testers = await listTesters(client, 'app1');
    expect(testers).toHaveLength(2);
    expect(testers[0]?.userId).toBe('u1');
    expect(testers[0]?.status).toBe('accepted');
  });

  it('returns empty array when roster is empty', async () => {
    const client = makeClient([
      { status: 200, body: { success: true, data: { testers: [] }, error: null } },
    ]);
    const testers = await listTesters(client, 'app1');
    expect(testers).toHaveLength(0);
  });

  it('throws on unexpected shape', async () => {
    const client = makeClient([
      { status: 200, body: { success: true, data: { testers: 'not-an-array' }, error: null } },
    ]);
    await expect(listTesters(client, 'app1')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// inviteTester
// ---------------------------------------------------------------------------
describe('inviteTester', () => {
  it('resolves on 200 (user exists)', async () => {
    const client = makeClient([OK]);
    await expect(inviteTester(client, 'app1', 'charlie')).resolves.toBeUndefined();
  });

  it('resolves on 200 even when backend says user-not-found', async () => {
    // Backend returns 200 for account-enumeration mitigation — CLI must not surface an error.
    const client = makeClient([
      { status: 200, body: { success: true, data: { recorded: true }, error: null } },
    ]);
    await expect(inviteTester(client, 'app1', 'unknown_user')).resolves.toBeUndefined();
  });

  it('sends the username in the request body', async () => {
    let capturedBody: string | undefined;
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true, data: null, error: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new ApiClient('https://api.test', 'tok', fetchSpy);
    await inviteTester(client, 'app1', 'diana');
    const parsed = JSON.parse(capturedBody ?? '{}') as { telegramUsername?: string };
    expect(parsed.telegramUsername).toBe('diana');
  });
});

// ---------------------------------------------------------------------------
// inviteTestersBatch
// ---------------------------------------------------------------------------
describe('inviteTestersBatch', () => {
  it('resolves on 200', async () => {
    const client = makeClient([OK]);
    await expect(inviteTestersBatch(client, 'app1', ['eve', 'frank'])).resolves.toBeUndefined();
  });

  it('sends all usernames in the request body', async () => {
    let capturedBody: string | undefined;
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true, data: null, error: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new ApiClient('https://api.test', 'tok', fetchSpy);
    await inviteTestersBatch(client, 'app1', ['grace', 'heidi']);
    const parsed = JSON.parse(capturedBody ?? '{}') as { telegramUsernames?: string[] };
    expect(parsed.telegramUsernames).toEqual(['grace', 'heidi']);
  });
});

// ---------------------------------------------------------------------------
// revokeTester
// ---------------------------------------------------------------------------
describe('revokeTester', () => {
  it('resolves on 200', async () => {
    const client = makeClient([OK]);
    await expect(revokeTester(client, 'app1', 'u1')).resolves.toBeUndefined();
  });

  it('uses DELETE method with encoded user_id in path', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method;
      return new Response(JSON.stringify({ success: true, data: null, error: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new ApiClient('https://api.test', 'tok', fetchSpy);
    await revokeTester(client, 'app1', 'user-uuid-123');
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toBe('https://api.test/api/v1/dev/apps/app1/testers/user-uuid-123');
  });
});

// ---------------------------------------------------------------------------
// getBetaStatus
// ---------------------------------------------------------------------------
describe('getBetaStatus', () => {
  it('parses an active-beta payload end-to-end', async () => {
    const payload = {
      appId: 'com.flight.demo',
      betaActive: true,
      betaVersion: '1.4.2',
      betaBundleSha256: 'a'.repeat(64),
      betaExpiresAt: '2026-07-29T12:00:00Z',
      daysUntilExpiry: 89,
      betaReleaseNotes: 'First beta cut',
      lastPublishedAt: '2026-04-30T14:23:00Z',
      testerCount: 7,
      testerCap: 25,
    };
    const client = makeClient([
      { status: 200, body: { success: true, data: payload, error: null } },
    ]);
    const status = await getBetaStatus(client, 'com.flight.demo');
    expect(status.betaActive).toBe(true);
    expect(status.betaVersion).toBe('1.4.2');
    expect(status.testerCount).toBe(7);
    expect(status.testerCap).toBe(25);
    expect(status.daysUntilExpiry).toBe(89);
  });

  it('parses an idle-app payload (no beta active)', async () => {
    const payload = {
      appId: 'com.flight.idle',
      betaActive: false,
      betaVersion: null,
      betaBundleSha256: null,
      betaExpiresAt: null,
      daysUntilExpiry: null,
      betaReleaseNotes: null,
      lastPublishedAt: '2026-04-30T14:23:00Z',
      testerCount: 0,
      testerCap: 25,
    };
    const client = makeClient([
      { status: 200, body: { success: true, data: payload, error: null } },
    ]);
    const status = await getBetaStatus(client, 'com.flight.idle');
    expect(status.betaActive).toBe(false);
    expect(status.betaVersion).toBeNull();
    expect(status.testerCount).toBe(0);
  });

  it('uses GET method with encoded app_id in path', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? 'GET';
      const body = {
        success: true,
        data: {
          appId: 'app/with/slashes',
          betaActive: false,
          betaVersion: null,
          betaBundleSha256: null,
          betaExpiresAt: null,
          daysUntilExpiry: null,
          betaReleaseNotes: null,
          lastPublishedAt: null,
          testerCount: 0,
          testerCap: 25,
        },
        error: null,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new ApiClient('https://api.test', 'tok', fetchSpy);
    await getBetaStatus(client, 'app/with/slashes');
    expect(capturedMethod).toBe('GET');
    expect(capturedUrl).toBe('https://api.test/api/v1/dev/apps/app%2Fwith%2Fslashes/beta/status');
  });

  it('rejects on schema mismatch (missing required field)', async () => {
    const malformed = {
      appId: 'com.bad',
      betaActive: true,
      // missing betaVersion, testerCount, etc. Schema must reject.
    };
    const client = makeClient([
      { status: 200, body: { success: true, data: malformed, error: null } },
    ]);
    await expect(getBetaStatus(client, 'com.bad')).rejects.toThrow();
  });
});
