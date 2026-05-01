import { describe, it, expect, beforeEach } from 'vitest';
import { __setKeychainForTest, getKeychain } from '../auth/keychain.js';
import type { KeychainStore } from '../auth/keychain.js';

class InMemoryKeychain implements KeychainStore {
  readonly isSecure = true;
  private value: string | null = null;
  async get(): Promise<string | null> {
    return this.value;
  }
  async set(v: string): Promise<void> {
    this.value = v;
  }
  async clear(): Promise<void> {
    this.value = null;
  }
}

describe('getKeychain (with test seam)', () => {
  beforeEach(() => __setKeychainForTest(new InMemoryKeychain()));

  it('round-trips a value', async () => {
    const kc = await getKeychain();
    await kc.set('token-abc');
    expect(await kc.get()).toBe('token-abc');
  });

  it('clear() removes the value', async () => {
    const kc = await getKeychain();
    await kc.set('token-abc');
    await kc.clear();
    expect(await kc.get()).toBeNull();
  });
});
