import { describe, it, expect } from 'vitest';
import { MiniAppContextSchema } from '../context.js';

describe('MiniAppContextSchema', () => {
  it('accepts a canonical context', () => {
    expect(() =>
      MiniAppContextSchema.parse({
        userId: 'u-123',
        activeCarId: 'VIN-XXX',
        locale: 'en',
        isDark: true,
        appVersion: '1.0.0',
        appId: 'fuel_prices',
      }),
    ).not.toThrow();
  });

  it('accepts empty strings for unbound identifiers', () => {
    // Host returns '' for userId/activeCarId when not signed in / no car.
    expect(() =>
      MiniAppContextSchema.parse({
        userId: '',
        activeCarId: '',
        locale: 'ar',
        isDark: false,
        appVersion: '1.0.0',
        appId: 'fuel_prices',
      }),
    ).not.toThrow();
  });

  it('rejects unknown locale', () => {
    expect(() =>
      MiniAppContextSchema.parse({
        userId: '',
        activeCarId: '',
        locale: 'fr',
        isDark: false,
        appVersion: '1.0.0',
        appId: 'x',
      }),
    ).toThrow();
  });
});
