import { afterEach, describe, expect, it } from 'vitest';
import { createClientOrSSR } from '../ssr.js';
import { HOST_GLOBAL } from '../bridge.js';

describe('createClientOrSSR', () => {
  afterEach(() => {
    if (typeof globalThis !== 'undefined') {
      delete (globalThis as any).window;
    }
  });

  it('returns null in a Node-like environment with no window', () => {
    expect(createClientOrSSR()).toBeNull();
  });

  it('returns null in a window without the host global', () => {
    (globalThis as any).window = {};
    expect(createClientOrSSR()).toBeNull();
  });

  it('returns a MiniAppClient when the host global is present', () => {
    (globalThis as any).window = {
      [HOST_GLOBAL]: { callHandler: async () => undefined },
    };
    const client = createClientOrSSR();
    expect(client).not.toBeNull();
  });
});
