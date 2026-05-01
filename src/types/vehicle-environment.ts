import { z } from 'zod';

/// Read-only environmental sensors — none of which are personally
/// identifiable. AQI / PM2.5 are good fits for "is the cabin
/// healthy?" widgets that don't need diagnostics permissions.
export const VehicleEnvironmentSnapshotSchema = z
  .object({
    /// Air-quality index, 0–500. Nullable when the OEM doesn't
    /// publish one for this region.
    aqi: z.number().nullable(),
    /// PM2.5 concentration in µg/m³.
    pm25: z.number().nullable(),
    /// Ambient cabin light, in lux. Nullable on hosts without an
    /// ambient-light sensor.
    ambientLightLux: z.number().nullable(),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type VehicleEnvironmentSnapshot = z.infer<typeof VehicleEnvironmentSnapshotSchema>;
