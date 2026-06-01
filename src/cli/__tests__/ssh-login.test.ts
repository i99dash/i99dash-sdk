import { describe, expect, it, vi } from 'vitest';
import { SshLoginClient } from '../auth/ssh-login.js';
import { ServerError } from '../util/errors.js';

function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('SshLoginClient', () => {
  it('challenge returns the nonce from the envelope', async () => {
    const c = new SshLoginClient(
      'http://x',
      fetchReturning(200, { success: true, data: { nonce: 'N', expires_in: 120 } }),
    );
    expect(await c.challenge('SHA256:fp')).toBe('N');
  });

  it('verify returns the access token', async () => {
    const c = new SshLoginClient(
      'http://x',
      fetchReturning(200, { success: true, data: { access_token: 'TKT', token_type: 'bearer' } }),
    );
    expect(await c.verify('N', 'c2ln')).toBe('TKT');
  });

  it('maps an error envelope to ServerError carrying the apiCode', async () => {
    const c = new SshLoginClient(
      'http://x',
      fetchReturning(401, {
        success: false,
        error: { code: 'SSH_CHALLENGE_INVALID', message: 'unknown key' },
      }),
    );
    await expect(c.verify('N', 'c2ln')).rejects.toBeInstanceOf(ServerError);
    await expect(c.verify('N', 'c2ln')).rejects.toMatchObject({
      apiCode: 'SSH_CHALLENGE_INVALID',
    });
  });
});
