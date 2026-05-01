/// Public-API surface lock for `@i99dash/admin-sdk`. See the matching
/// test in `@i99dash/sdk` for the contract.

import { describe, expect, it } from 'vitest';

import * as admin from '../index.js';
import * as types from '../public-types.js';

const ADMIN_PUBLIC_EXPORTS = [
  'AdminClient',
  'BridgeTimeoutError',
  'BridgeTransportError',
  'FakeAdminBridge',
  'HostAdminBridge',
  'NotInsideHostError',
  'UnknownTemplateError',
  'snapshotFromList',
] as const;

const TYPES_RUNTIME_EXPORTS: readonly string[] = [
  // Type-only subpath; runtime exports here would be a regression.
];

describe('@i99dash/admin-sdk — public API surface', () => {
  it('exports exactly the documented runtime symbols', () => {
    const actual = Object.keys(admin).sort();
    expect(actual).toEqual([...ADMIN_PUBLIC_EXPORTS].sort());
  });

  it('the /types subpath has zero runtime exports', () => {
    const actual = Object.keys(types).sort();
    expect(actual).toEqual([...TYPES_RUNTIME_EXPORTS].sort());
  });
});
