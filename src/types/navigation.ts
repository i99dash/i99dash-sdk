import { z } from 'zod';

/// Maneuver hint the host's nav publishes for the *current* turn.
/// Abstract — the underlying turn-by-turn engine's specific maneuver
/// codes are mapped to one of these on the host side.
export const NavManeuverSchema = z.enum([
  'continue',
  'turn_left',
  'turn_right',
  'sharp_left',
  'sharp_right',
  'slight_left',
  'slight_right',
  'u_turn',
  'roundabout',
  'merge',
  'exit',
  'arrive',
  'unknown',
]);
export type NavManeuver = z.infer<typeof NavManeuverSchema>;

/// Read-only navigation snapshot.
///
/// **PII tier (per ADR 0001).** Reveals destinations the user picked —
/// gated behind manifest declaration AND host-side consent prompt
/// (same gates as `location.read`).
///
/// Field-shape choices:
///   - `active: false` is the "no route" idle state. Other fields
///     are nullable / undefined in that state; apps must check
///     `active` before reading the rest.
///   - `destinationLabel` is the user-friendly destination name
///     ("Home", "Acme Corp HQ"). The host strips raw addresses
///     where possible so app analytics don't leak full POIs.
///   - Distances in metres, time in seconds — lets apps choose
///     their own formatting.
export const NavigationSnapshotSchema = z
  .object({
    active: z.boolean(),
    /// Friendly destination name when active. `null` when no route
    /// or when the underlying engine has no label.
    destinationLabel: z.string().nullable(),
    /// Remaining road distance to the active route's final waypoint,
    /// in metres. `null` when no route.
    distanceRemainingM: z.number().nonnegative().nullable(),
    /// Estimated arrival, in seconds from `at`. `null` when the
    /// engine hasn't computed an ETA yet (e.g. just-started reroute).
    etaSeconds: z.number().nonnegative().nullable(),
    /// Current maneuver hint. `null` when the engine isn't yet on a
    /// step (just left a roundabout, between turns, etc.).
    currentManeuver: NavManeuverSchema.nullable(),
    /// Distance to the next maneuver, in metres. `null` when no
    /// maneuver is queued or the engine doesn't publish a distance.
    distanceToTurnM: z.number().nonnegative().nullable(),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type NavigationSnapshot = z.infer<typeof NavigationSnapshotSchema>;
