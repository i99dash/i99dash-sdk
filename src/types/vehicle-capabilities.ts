import { z } from 'zod';

/// Vehicle / hardware capabilities the host advertises and mini-apps
/// declare as required. Distinct from `permissions` (family bridge
/// gating) and `requiredPermissions` (developer-grant scoping):
///
///   * `permissions`           — does the *host* implement this family?
///   * `requiredPermissions`   — is the *publisher* allowed to ship it?
///   * `requiredCapabilities`  — does the *physical car* support it?
///
/// The catalog merge filters apps whose required capabilities aren't a
/// subset of the active vehicle's capabilities, dimming (not hiding)
/// them with a `caps_missing` reason — see `feedback_perms_hide_not_disable`
/// for why dim-with-reason wins over silent omission.
///
/// **Bit positions are frozen — never reorder.** New capabilities append
/// to the end; removed capabilities leave a tombstone with a `null`
/// entry so the bitmask layout stays stable across SDK + host + backend.
/// Bitmask fits in a 32-bit signed int up to 31 entries; the host wires
/// it as a Long (64-bit) to give us headroom past 32.
///
/// Mirrored verbatim in:
///   * `car-i99dash/lib/core/car/vehicle_capability.dart` (Dart)
///   * `car-i99dash/android/app/.../car/VehicleCapability.kt` (host)
///   * `backend-i99dash/app/domain/vehicle_capabilities/constants.py`
///
/// A CI drift check (`scripts/check-capability-drift.mjs`) fails the PR
/// when these copies diverge — same pattern as `category-slugs.json`.
export const VEHICLE_CAPABILITIES = [
  // 0–4: read surfaces — every car has these unless the OS layer is
  //      degraded (dev runner, web preview).
  'display.read',
  'pkg.read',
  // 5–9: launch surfaces — what `pkg.launch({role})` can actually
  //      reach on this trim. `cluster.icons` covers L5's "MCU mux only"
  //      reality (no pixel control, but icon-state toggles work).
  'pkg.launch.ivi',
  'pkg.launch.passenger',
  'pkg.launch.cluster.pixel',
  'pkg.launch.cluster.icons',
  'pkg.launch.dishare',
  // 7–9: surface render targets — independent of launch because a
  //      mini-app can render its own WebView surface without touching
  //      pkg.* (the dash-wallpaper case).
  'surface.write.ivi',
  'surface.write.passenger',
  'surface.write.cluster',
  // 10–11: gesture / cursor synthesis — privileged because they touch
  //        the a11y bridge.
  'cursor.write',
  'gesture.dispatch',
  // 12–15: car control — read vs set are separate so a "fan-speed
  //        gauge" mini-app can declare `ac.get` without scaring the
  //        catalog filter into asking for write perms.
  'ac.get',
  'ac.set',
  'door.set',
  'window.set',
] as const;

export type VehicleCapability = (typeof VEHICLE_CAPABILITIES)[number];

/// Reverse map (capability → bit index). `Object.fromEntries` keeps
/// the table single-sourced — consumers that need a specific bit
/// (rare; most use `bitsFromCapabilities`) read it from this map.
export const CAPABILITY_BITS: Readonly<Record<VehicleCapability, number>> = Object.freeze(
  Object.fromEntries(VEHICLE_CAPABILITIES.map((cap, i) => [cap, i])) as Record<
    VehicleCapability,
    number
  >,
);

/// Pack a capability list into a single integer bitmask. Order in the
/// input doesn't matter — the result is a deterministic OR of bits.
/// Unknown capability strings (defensive: should be caught by Zod
/// upstream) are silently skipped rather than throwing, so a JSON
/// from a newer SDK doesn't crash an older host's parser.
export function bitsFromCapabilities(caps: readonly string[]): number {
  let bits = 0;
  for (const cap of caps) {
    const bit = (CAPABILITY_BITS as Record<string, number | undefined>)[cap];
    if (bit !== undefined) bits |= 1 << bit;
  }
  return bits;
}

/// Inverse — turn a bitmask back into the canonical capability list.
/// Stable order (matches `VEHICLE_CAPABILITIES`).
export function capabilitiesFromBits(bits: number): VehicleCapability[] {
  const out: VehicleCapability[] = [];
  for (let i = 0; i < VEHICLE_CAPABILITIES.length; i++) {
    if ((bits & (1 << i)) !== 0) out.push(VEHICLE_CAPABILITIES[i]!);
  }
  return out;
}

/// Capability subset check — `app.required ⊆ vehicle.has`. One bitmask
/// AND, O(1) regardless of how many capabilities are in play. The
/// catalog filter uses this on every app per render — keep it
/// branchless.
export function hasAllCapabilities(vehicleBits: number, requiredBits: number): boolean {
  return (vehicleBits & requiredBits) === requiredBits;
}

const VehicleCapabilityEnum = z.enum(
  VEHICLE_CAPABILITIES as unknown as [VehicleCapability, ...VehicleCapability[]],
);

/// Backend payload for `GET /api/v1/vehicle-capabilities/{variantId}?fingerprint=...`.
/// One row per (variantId, ROM fingerprint). Empirical truth — backend
/// aggregates probes from real cars and pushes the union back to all
/// hosts on the same fingerprint. The host falls back to its compiled-in
/// VehicleProfile seed when the backend returns 404.
///
/// `fingerprint` may be the empty string when the backend served the
/// trim-only fallback row (no precise (variant, fingerprint) row yet
/// for this ROM build). `capabilities` and `capabilityBits` are
/// redundant on the wire — `capabilityBits` is the bitmask the host
/// uses on the hot path; `capabilities` is the readable list for logs.
export const VehicleCapabilitiesSnapshotSchema = z
  .object({
    variantId: z.string().min(1).max(64),
    /// `ro.build.fingerprint` exactly as Android reports it. Opaque
    /// to the SDK; the backend uses it as the cache key. Empty string
    /// when the backend served the trim-only fallback row.
    fingerprint: z.string().max(256),
    /// Stable enum subset on the wire — easier to reason about in
    /// logs and across language boundaries. Redundant with
    /// `capabilityBits`; consumers pick whichever fits.
    capabilities: z.array(VehicleCapabilityEnum),
    /// Same content as `capabilities`, packed into a bitmask. Backend
    /// stores the canonical state in this column; the host uses it
    /// directly for the hot-path subset check (one AND).
    capabilityBits: z.number().int().nonnegative(),
    /// ISO-8601 timestamp the backend last updated this row.
    updatedAt: z.string().datetime(),
    /// Probe count this row aggregates. Higher = more confident.
    /// Hosts use this only for telemetry; the union semantic is the
    /// same regardless of count.
    probeCount: z.number().int().nonnegative(),
  })
  .strict();

export type VehicleCapabilitiesSnapshot = z.infer<typeof VehicleCapabilitiesSnapshotSchema>;

/// Probe result a host POSTs back to the backend after running its
/// first-boot probe set. The backend folds this into the per-(variant,
/// fingerprint) row — strictly additive, never decrementing, so a
/// flaky probe on one car can never strip a capability another car
/// proved.
export const VehicleCapabilityProbeReportSchema = z
  .object({
    variantId: z.string().min(1).max(64),
    fingerprint: z.string().min(1).max(256),
    /// Capabilities the probe empirically confirmed on this car. The
    /// backend ORs them into the existing row; missing capabilities
    /// here ≠ "this car lacks them" (a probe can fail for many
    /// reasons), only "this run didn't prove them".
    confirmed: z.array(VehicleCapabilityEnum),
    /// Anonymised probe-version string so the backend can ignore
    /// reports from probe versions known to false-negative.
    probeVersion: z.string().min(1).max(32),
  })
  .strict();

export type VehicleCapabilityProbeReport = z.infer<typeof VehicleCapabilityProbeReportSchema>;
