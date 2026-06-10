import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../api/client.js';
import { addSshKey, listSshKeys, SshKeySchema } from '../api/endpoints.js';

// What the backend's /account/ssh-keys route actually returns (snake_case).
const SNAKE = {
  id: 'k1',
  name: 'home',
  fingerprint: 'SHA256:abc',
  key_type: 'ssh-ed25519',
  purpose: 'attest',
  created_at: '2026-01-01T00:00:00Z',
  last_used_at: null,
};

/// A stand-in ApiClient that hands `body` straight to the call-site parser —
/// exercises the exact response-validation path that used to throw.
function apiReturning(body: unknown): ApiClient {
  return {
    get: (_p: string, parse: (b: unknown) => unknown) => Promise.resolve(parse(body)),
    post: (_p: string, _b: unknown, parse: (b: unknown) => unknown) => Promise.resolve(parse(body)),
  } as unknown as ApiClient;
}

describe('SshKeySchema (backend snake_case → camelCase)', () => {
  it('parses the snake_case key view the route sends', () => {
    const k = SshKeySchema.parse(SNAKE);
    expect(k).toMatchObject({
      id: 'k1',
      keyType: 'ssh-ed25519',
      purpose: 'attest',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: null,
    });
  });

  it('addSshKey returns a camelCase key without throwing (the bug it fixes)', async () => {
    const k = await addSshKey(apiReturning(SNAKE), 'ssh-ed25519 AAAA', 'home', 'attest');
    expect(k.keyType).toBe('ssh-ed25519');
    expect(k.purpose).toBe('attest');
  });

  it('listSshKeys parses { keys: [snake] }', async () => {
    const keys = await listSshKeys(apiReturning({ keys: [SNAKE] }));
    expect(keys).toHaveLength(1);
    expect(keys[0].fingerprint).toBe('SHA256:abc');
    expect(keys[0].lastUsedAt).toBeNull();
  });

  it('still tolerates a camelCase response (so it cannot silently break either way)', () => {
    const k = SshKeySchema.parse({
      id: 'k2',
      name: 'x',
      fingerprint: 'SHA256:z',
      keyType: 'ssh-ed25519',
      createdAt: 't',
      lastUsedAt: 't2',
    });
    expect(k.keyType).toBe('ssh-ed25519');
    expect(k.lastUsedAt).toBe('t2');
  });
});
