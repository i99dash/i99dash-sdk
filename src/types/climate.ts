import { z } from 'zod';

/// HVAC modes the host exposes. Abstract — the OEM's specific mode
/// integers are mapped to one of these on the host side.
export const ClimateModeSchema = z.enum(['heat', 'cool', 'auto', 'fan', 'off']);
export type ClimateMode = z.infer<typeof ClimateModeSchema>;

/// Read-only cabin-climate snapshot. Setpoint reveals user
/// preference but not identity — safe for the read-only tier.
///
/// Strict-by-construction. See ADR 0001 for the schema-evolution
/// policy that applies here too.
export const ClimateSnapshotSchema = z
  .object({
    /// Current cabin temperature, in degrees Celsius. Host-side
    /// translation handles the OEM unit; mini-apps render in the
    /// user's preferred unit using `client.system.getSnapshot().units`.
    cabinTempC: z.number(),
    /// User's setpoint, also in Celsius.
    setpointC: z.number(),
    /// 0.0 (off) — 1.0 (max). Normalised by the host across the
    /// underlying HVAC's stepped scale.
    fanSpeed: z.number().min(0).max(1),
    mode: ClimateModeSchema,
    /// Number of climate zones the underlying system exposes
    /// (single-zone = 1, dual = 2, ...). Lets the UI layout adapt.
    zoneCount: z.number().int().min(1).max(8),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type ClimateSnapshot = z.infer<typeof ClimateSnapshotSchema>;
