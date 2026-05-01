import { z } from 'zod';

/// Network type currently in use, abstract enum. Specific
/// generations (3G/4G/5G) collapse to `cellular` — apps that care
/// about generation should ask `client.callApi` to time out
/// reasonably and react to the result, not branch on the cellular
/// generation.
export const NetworkTypeSchema = z.enum(['wifi', 'cellular', 'ethernet', 'offline', 'unknown']);
export type NetworkType = z.infer<typeof NetworkTypeSchema>;

/// Read-only connectivity snapshot. Useful for graceful-degradation
/// UIs. Note: pairing *names* are not exposed (PII) — only a count.
export const ConnectivitySnapshotSchema = z
  .object({
    network: NetworkTypeSchema,
    /// Number of currently-paired Bluetooth devices the host knows
    /// about. Names / identifiers stay host-side.
    bluetoothPairedCount: z.number().int().min(0),
    /// ISO-8601 capture wall-clock, UTC.
    at: z.string().min(1),
  })
  .strict();

export type ConnectivitySnapshot = z.infer<typeof ConnectivitySnapshotSchema>;
