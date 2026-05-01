import { describe, it, expect } from 'vitest';
import { CallApiRequestSchema, CallApiResponseSchema } from '../call-api.js';

describe('CallApiRequestSchema', () => {
  it('accepts a canonical GET', () => {
    expect(() =>
      CallApiRequestSchema.parse({
        path: '/api/v1/fuel-stations',
        method: 'GET',
        query: { lat: 24.5, lng: 54.4 },
      }),
    ).not.toThrow();
  });

  it('rejects paths that do not start with /', () => {
    expect(() =>
      CallApiRequestSchema.parse({ path: 'api/v1/fuel-stations', method: 'GET' }),
    ).toThrow();
  });

  it('rejects unsupported methods in v1', () => {
    expect(() =>
      CallApiRequestSchema.parse({ path: '/api/v1/fuel-stations', method: 'POST' }),
    ).toThrow();
  });
});

describe('CallApiResponseSchema', () => {
  it('accepts both success and failure envelopes', () => {
    expect(() =>
      CallApiResponseSchema.parse({ success: true, data: { stations: [] } }),
    ).not.toThrow();
    expect(() =>
      CallApiResponseSchema.parse({
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'offline' },
      }),
    ).not.toThrow();
  });
});
