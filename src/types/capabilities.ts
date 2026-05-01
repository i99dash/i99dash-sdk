import { z } from 'zod';

/// Bridge-capability handshake payload.
///
/// The host returns this from the `capabilities` handler so the SDK
/// can graceful-degrade when newer SDKs ship families older hosts
/// don't yet implement. Mirrors the OS-permission family pattern —
/// the SDK asks "do you have `media.read`?", the host says yes/no,
/// the mini-app renders accordingly.
export const HostCapabilitiesSchema = z
  .object({
    /// Semver-ish string the host pins itself to. Opaque to the SDK —
    /// only the SDK's `client.bridgeVersion()` consumer (e.g. a
    /// crash-reporter) reads it.
    bridgeVersion: z.string().min(1),
    /// Permission scope identifiers the host has handlers for. The
    /// well-known set today is `['car.status']`; new families
    /// (e.g. `media.read`) append themselves here as they ship.
    families: z.array(z.string().min(1)),
  })
  .strict();

export type HostCapabilities = z.infer<typeof HostCapabilitiesSchema>;
