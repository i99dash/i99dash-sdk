import { describe, it, expect } from 'vitest';
import {
  VEHICLE_CAPABILITIES,
  CAPABILITY_BITS,
  bitsFromCapabilities,
  capabilitiesFromBits,
  hasAllCapabilities,
  VehicleCapabilitiesSnapshotSchema,
  VehicleCapabilityProbeReportSchema,
} from '../vehicle-capabilities.js';
import { MiniAppManifestSchema } from '../manifest.js';

describe('VEHICLE_CAPABILITIES taxonomy', () => {
  it('has unique entries', () => {
    expect(new Set(VEHICLE_CAPABILITIES).size).toBe(VEHICLE_CAPABILITIES.length);
  });

  it('fits in a 31-bit signed-int bitmask', () => {
    expect(VEHICLE_CAPABILITIES.length).toBeLessThanOrEqual(31);
  });

  it('CAPABILITY_BITS matches array order (frozen contract)', () => {
    VEHICLE_CAPABILITIES.forEach((cap, i) => {
      expect(CAPABILITY_BITS[cap]).toBe(i);
    });
  });

  it('locks the first eight bit positions (regression guard)', () => {
    expect(CAPABILITY_BITS['display.read']).toBe(0);
    expect(CAPABILITY_BITS['pkg.read']).toBe(1);
    expect(CAPABILITY_BITS['pkg.launch.ivi']).toBe(2);
    expect(CAPABILITY_BITS['pkg.launch.passenger']).toBe(3);
    expect(CAPABILITY_BITS['pkg.launch.cluster.pixel']).toBe(4);
    expect(CAPABILITY_BITS['pkg.launch.cluster.icons']).toBe(5);
    expect(CAPABILITY_BITS['pkg.launch.dishare']).toBe(6);
    expect(CAPABILITY_BITS['surface.write.ivi']).toBe(7);
  });
});

describe('bitsFromCapabilities / capabilitiesFromBits', () => {
  it('roundtrips a single capability', () => {
    const bits = bitsFromCapabilities(['display.read']);
    expect(bits).toBe(1);
    expect(capabilitiesFromBits(bits)).toEqual(['display.read']);
  });

  it('roundtrips multi-cap deterministically (order = taxonomy order)', () => {
    const bits = bitsFromCapabilities(['pkg.read', 'display.read', 'cursor.write']);
    expect(capabilitiesFromBits(bits)).toEqual(['display.read', 'pkg.read', 'cursor.write']);
  });

  it('silently drops unknown capability strings', () => {
    const bits = bitsFromCapabilities(['display.read', 'made.up' as never]);
    expect(bits).toBe(1);
  });

  it('empty input → 0 bitmask', () => {
    expect(bitsFromCapabilities([])).toBe(0);
    expect(capabilitiesFromBits(0)).toEqual([]);
  });
});

describe('hasAllCapabilities', () => {
  it('true when required is empty', () => {
    expect(hasAllCapabilities(0, 0)).toBe(true);
    expect(hasAllCapabilities(0xff, 0)).toBe(true);
  });

  it('true when vehicle covers required', () => {
    const have = bitsFromCapabilities([
      'display.read',
      'pkg.read',
      'pkg.launch.ivi',
      'pkg.launch.passenger',
    ]);
    const need = bitsFromCapabilities(['display.read', 'pkg.launch.passenger']);
    expect(hasAllCapabilities(have, need)).toBe(true);
  });

  it('false when one required bit is missing', () => {
    const have = bitsFromCapabilities(['display.read']);
    const need = bitsFromCapabilities(['display.read', 'pkg.launch.cluster.pixel']);
    expect(hasAllCapabilities(have, need)).toBe(false);
  });
});

describe('VehicleCapabilitiesSnapshotSchema', () => {
  it('parses a minimal valid payload', () => {
    const parsed = VehicleCapabilitiesSnapshotSchema.parse({
      variantId: 'l8',
      fingerprint: 'BYD/leopard8/leopard8:13/Q0414/202512071900:user/release-keys',
      capabilities: ['display.read', 'pkg.read'],
      capabilityBits: 0b11,
      updatedAt: '2026-05-04T12:00:00Z',
      probeCount: 17,
    });
    expect(parsed.capabilities).toHaveLength(2);
    expect(parsed.capabilityBits).toBe(0b11);
  });

  it('accepts the trim-only fallback row (empty fingerprint)', () => {
    /// Backend returns `fingerprint=""` when the precise (variant, fingerprint)
    /// row hasn't been probed yet — the host gets the trim-aggregate
    /// rather than a 404 for fresh ROM builds. See
    /// backend-i99dash/app/domain/vehicle_capabilities/repository.py:get
    /// for the fallback path.
    const parsed = VehicleCapabilitiesSnapshotSchema.parse({
      variantId: 'l5',
      fingerprint: '',
      capabilities: ['display.read'],
      capabilityBits: 1,
      updatedAt: '2026-05-04T12:00:00Z',
      probeCount: 4,
    });
    expect(parsed.fingerprint).toBe('');
  });

  it('rejects unknown capability strings', () => {
    expect(() =>
      VehicleCapabilitiesSnapshotSchema.parse({
        variantId: 'l8',
        fingerprint: 'fp',
        capabilities: ['display.read', 'cluster.maglev' as never],
        capabilityBits: 1,
        updatedAt: '2026-05-04T12:00:00Z',
        probeCount: 1,
      }),
    ).toThrow();
  });

  it('rejects negative probeCount', () => {
    expect(() =>
      VehicleCapabilitiesSnapshotSchema.parse({
        variantId: 'l8',
        fingerprint: 'fp',
        capabilities: [],
        capabilityBits: 0,
        updatedAt: '2026-05-04T12:00:00Z',
        probeCount: -1,
      }),
    ).toThrow();
  });

  it('rejects negative capabilityBits', () => {
    expect(() =>
      VehicleCapabilitiesSnapshotSchema.parse({
        variantId: 'l8',
        fingerprint: 'fp',
        capabilities: [],
        capabilityBits: -1,
        updatedAt: '2026-05-04T12:00:00Z',
        probeCount: 0,
      }),
    ).toThrow();
  });
});

describe('VehicleCapabilityProbeReportSchema', () => {
  it('accepts a valid probe report', () => {
    const parsed = VehicleCapabilityProbeReportSchema.parse({
      variantId: 'l5',
      fingerprint: 'BYD/leopard5/...',
      confirmed: ['display.read', 'pkg.launch.dishare'],
      probeVersion: '1',
    });
    expect(parsed.confirmed).toContain('pkg.launch.dishare');
  });
});

describe('MiniAppManifestSchema with requiredCapabilities', () => {
  const valid = {
    id: 'dash_wallpaper',
    name: { en: 'Dash Wallpaper' },
    icon: './icon.svg',
    url: 'https://miniapps.i99dash.app/dash-wallpaper/',
    version: '0.2.0',
    category: 'lifestyle',
  };

  it('defaults requiredCapabilities to empty array', () => {
    const parsed = MiniAppManifestSchema.parse(valid);
    expect(parsed.requiredCapabilities).toEqual([]);
  });

  it('accepts a manifest with requiredCapabilities', () => {
    const parsed = MiniAppManifestSchema.parse({
      ...valid,
      requiredCapabilities: ['display.read', 'surface.write.cluster'],
    });
    expect(parsed.requiredCapabilities).toEqual(['display.read', 'surface.write.cluster']);
  });

  it('rejects unknown capabilities (closed enum)', () => {
    expect(() =>
      MiniAppManifestSchema.parse({
        ...valid,
        requiredCapabilities: ['display.read', 'fly.ivi' as never],
      }),
    ).toThrow();
  });
});
