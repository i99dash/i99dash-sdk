import { z } from 'zod';

/// Gearbox position, abstract enum. The OEM's specific gear-byte
/// values are mapped to one of these on the host side.
export const GearPositionSchema = z.enum(['P', 'R', 'N', 'D', 'M', 'unknown']);
export type GearPosition = z.infer<typeof GearPositionSchema>;

/// Per-wheel tire pressure. All four wheels are reported when the
/// underlying TPMS publishes them; missing wheels are `null`.
/// Units: kPa (host-side conversion handles psi/bar).
export const TirePressureSchema = z
  .object({
    frontLeft: z.number().nullable(),
    frontRight: z.number().nullable(),
    rearLeft: z.number().nullable(),
    rearRight: z.number().nullable(),
  })
  .strict();
export type TirePressure = z.infer<typeof TirePressureSchema>;

/// Read-only diagnostics snapshot. Includes a coarsened odometer per
/// the privacy notes in ADR 0001 (bucketed + per-launch jitter so a
/// single car isn't trivially fingerprintable). The host applies
/// both before this value reaches the SDK.
export const VehicleDiagnosticsSnapshotSchema = z
  .object({
    tirePressure: TirePressureSchema,
    gearPosition: GearPositionSchema,
    /// Odometer, in km, bucketed by the host (floor 1000, ceiling
    /// 10000 km depending on regional fleet density) and offset by
    /// a per-launch ±100 km jitter. Stable within a session, varies
    /// across sessions.
    odometerKm: z.number().nonnegative(),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type VehicleDiagnosticsSnapshot = z.infer<typeof VehicleDiagnosticsSnapshotSchema>;
