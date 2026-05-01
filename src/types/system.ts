import { z } from 'zod';

/// Distance unit the host UI is currently rendering with. Mini-apps
/// align their formatting using this value.
export const DistanceUnitSchema = z.enum(['km', 'mi']);
export type DistanceUnit = z.infer<typeof DistanceUnitSchema>;

/// Temperature unit the host UI is currently rendering with.
export const TemperatureUnitSchema = z.enum(['celsius', 'fahrenheit']);
export type TemperatureUnit = z.infer<typeof TemperatureUnitSchema>;

/// OTA-update lifecycle states the host publishes to mini-apps. The
/// underlying OEM update machinery has many more sub-states; the
/// host collapses to this small abstract set.
export const OtaStatusSchema = z.enum([
  'idle',
  'checking',
  'downloading',
  'ready_to_install',
  'installing',
  'failed',
]);
export type OtaStatus = z.infer<typeof OtaStatusSchema>;

/// Read-only host-system snapshot. Public information; useful to
/// keep mini-app formatting in sync with the host UI without each
/// app having to fork its own preference store.
export const SystemSnapshotSchema = z
  .object({
    otaStatus: OtaStatusSchema,
    units: z
      .object({
        distance: DistanceUnitSchema,
        temperature: TemperatureUnitSchema,
      })
      .strict(),
    /// 0.0 (dim) — 1.0 (max). The host normalises whatever scale the
    /// underlying display uses.
    displayBrightness: z.number().min(0).max(1),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type SystemSnapshot = z.infer<typeof SystemSnapshotSchema>;
