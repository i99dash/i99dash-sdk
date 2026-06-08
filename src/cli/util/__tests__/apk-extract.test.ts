import { describe, expect, it } from 'vitest';

import { extractApkMetadata, toLocaleMap } from '../apk-extract.js';

describe('toLocaleMap', () => {
  it('wraps a bare string under the en fallback key', () => {
    expect(toLocaleMap('Dash Cam')).toEqual({ en: 'Dash Cam' });
  });

  it('passes a locale map through verbatim', () => {
    expect(toLocaleMap({ en: 'Dash Cam', ar: 'كاميرا' })).toEqual({
      en: 'Dash Cam',
      ar: 'كاميرا',
    });
  });

  it('treats empty string / empty map / undefined as absent', () => {
    expect(toLocaleMap('')).toBeUndefined();
    expect(toLocaleMap({})).toBeUndefined();
    expect(toLocaleMap(undefined)).toBeUndefined();
  });
});

describe('extractApkMetadata', () => {
  it('degrades gracefully (returns {} not throws) on an unreadable APK', async () => {
    // Icon/label are cosmetic — a parse failure must never bubble up and fail
    // the publish. A path that does not exist exercises the inner try/catch.
    await expect(extractApkMetadata('/no/such/file.apk')).resolves.toEqual({});
  });
});
