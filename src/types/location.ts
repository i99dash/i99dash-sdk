import { z } from 'zod';

/// Read-only GPS / location snapshot.
///
/// **PII tier (per ADR 0001).** Mini-apps can only read this when the
/// user has granted `location.read` AND completed the host's consent
/// flow. The platform's grant model is two-step:
///   1. Manifest declares `permissions: ['location.read']` at install.
///   2. Host renders a consent prompt before any data flows; rejecting
///      results in `permission_denied` envelopes from the bridge.
/// The schema below describes the *wire shape* once a request makes
/// it through both gates — the abstraction barrier still applies, no
/// OEM identifiers cross.
///
/// Strict-by-construction. Out-of-range or extra fields fail
/// validation at the SDK boundary.
export const LocationSnapshotSchema = z
  .object({
    /// Latitude in WGS-84 degrees. Always present.
    lat: z.number().min(-90).max(90),
    /// Longitude in WGS-84 degrees.
    lng: z.number().min(-180).max(180),
    /// Heading in degrees clockwise from true north (0..360),
    /// or `null` when the host is stationary / can't compute one.
    /// Apps that depend on heading should treat `null` as "use last
    /// known" or hide the directional UI.
    heading: z.number().min(0).max(360).nullable(),
    /// Ground speed in metres per second. `null` when unknown.
    speedMps: z.number().min(0).nullable(),
    /// Horizontal accuracy in metres (1-sigma estimate). `null` when
    /// the underlying GNSS fix doesn't publish one.
    accuracyM: z.number().nonnegative().nullable(),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type LocationSnapshot = z.infer<typeof LocationSnapshotSchema>;
