import { describe, it, expect, vi } from 'vitest';
import { BackendDeviceCodeClient } from '../auth/device-code.js';
import { ServerError } from '../util/errors.js';

function fetchMock(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let i = 0;
  return (async (_url: string) => {
    const r = responses[i++];
    if (!r) throw new Error('ran out of fetch responses');
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('BackendDeviceCodeClient.authorize', () => {
  it('parses a canonical response', async () => {
    const client = new BackendDeviceCodeClient(
      'https://api.test',
      'sdk',
      fetchMock([
        {
          status: 200,
          body: {
            device_code: 'dc',
            user_code: 'UC-1234',
            verification_uri: 'https://app.i99dash.app/devices',
            expires_in: 600,
            interval: 5,
          },
        },
      ]),
    );
    const g = await client.authorize();
    expect(g.user_code).toBe('UC-1234');
    expect(g.interval).toBe(5);
  });
});

describe('BackendDeviceCodeClient.pollToken', () => {
  it('handles authorization_pending → slow_down → success', async () => {
    vi.useFakeTimers();
    const fetchFn = fetchMock([
      { status: 400, body: { error: 'authorization_pending' } },
      { status: 400, body: { error: 'slow_down' } },
      { status: 200, body: { access_token: 'k-abc', token_type: 'Bearer' } },
    ]);
    const client = new BackendDeviceCodeClient('https://api.test', 'sdk', fetchFn);
    const p = client.pollToken('dc', 1, 60);
    // Advance enough to cover three poll intervals + jitter upper bound.
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(p).resolves.toBe('k-abc');
    vi.useRealTimers();
  });

  it('throws ServerError on access_denied', async () => {
    vi.useFakeTimers();
    const fetchFn = fetchMock([{ status: 400, body: { error: 'access_denied' } }]);
    const client = new BackendDeviceCodeClient('https://api.test', 'sdk', fetchFn);
    const p = client.pollToken('dc', 1, 60);
    // Pre-attach a noop catch so vitest doesn't flag a momentary
    // unhandled-rejection between the timer flush and the assertion
    // below; the actual `expect(...).rejects.toBeInstanceOf` runs on
    // the same promise and still inspects the real error.
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).rejects.toBeInstanceOf(ServerError);
    vi.useRealTimers();
  });
});
